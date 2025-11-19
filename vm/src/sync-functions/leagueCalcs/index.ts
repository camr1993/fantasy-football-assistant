import { logger } from '../../../../supabase/functions/utils/logger.ts';
import { supabase } from '../../../../supabase/functions/utils/supabase.ts';
import { getMostRecentNFLWeek } from '../../../../supabase/functions/utils/syncHelpers.ts';
import { calculateRecentStats } from './recentStats.ts';
import { calculateNormalizedRecentStats } from './normalization.ts';
import {
  calculateWeightedScoresForLeagueWR,
  calculateWeightedScoresForLeagueRB,
  calculateWeightedScoresForLeagueTE,
} from './weightedScoring/index.ts';
import type { LeagueCalcsResult } from './types.ts';

/**
 * League Calculations Coordinator
 *
 * Main orchestrator for all league calculations including:
 * 1. Recent statistics (mean and standard deviation) for fantasy points over the last 3 weeks
 * 2. Efficiency metrics (targets per game, catch rate, yards per target) for players
 * 3. 3-week rolling averages for efficiency metrics
 * 4. Normalized values (0-1 scale) for 3-week rolling averages using min-max scaling
 * 5. Weighted scores for players using position-specific weights
 */

/**
 * Update recent statistics for all players in a league after main calculation
 */
async function updateRecentStatsForLeague(
  leagueId: string,
  seasonYear: number,
  week: number
): Promise<void> {
  logger.info('Updating recent statistics for league', {
    leagueId,
    seasonYear,
    week,
  });

  // Use SQL bulk update to calculate recent stats for all players at once
  const { data: result, error: rpcError } = await supabase.rpc(
    'calculate_recent_stats_bulk',
    {
      p_league_id: leagueId,
      p_season_year: seasonYear,
      p_week: week,
      p_recent_weeks: 3,
    }
  );

  if (rpcError) {
    logger.warn('SQL bulk update failed, falling back to individual updates', {
      error: rpcError,
      leagueId,
      seasonYear,
      week,
    });
    // Fallback to individual updates
    await updateRecentStatsForLeagueFallback(leagueId, seasonYear, week);
  } else {
    logger.info('Successfully calculated recent stats using SQL bulk update', {
      leagueId,
      seasonYear,
      week,
      playersUpdated: result || 0,
    });
  }

  // Note: Efficiency metrics normalization is now done globally in syncPlayerStats
  // and stored in player_stats, so we skip it here

  // Normalize recent stats (mean and std) prior to weighted scoring
  // Recent stats are league-specific because they use league-specific fantasy_points
  await calculateNormalizedRecentStats(leagueId, seasonYear, week);

  // Calculate weighted scores for WR players after normalization is complete
  await calculateWeightedScoresForLeagueWR(leagueId, seasonYear, week);

  // Calculate weighted scores for RB players after normalization is complete
  await calculateWeightedScoresForLeagueRB(leagueId, seasonYear, week);

  // Calculate weighted scores for TE players after normalization is complete
  await calculateWeightedScoresForLeagueTE(leagueId, seasonYear, week);

  logger.info('Completed recent statistics update for league', {
    leagueId,
    seasonYear,
    week,
  });
}

/**
 * Fallback: Calculate recent stats individually (less efficient)
 * Used when SQL bulk function is not available
 */
async function updateRecentStatsForLeagueFallback(
  leagueId: string,
  seasonYear: number,
  week: number
): Promise<void> {
  // Get all players who have fantasy points calculated for this week
  const { data: players, error: fetchError } = await supabase
    .from('league_calcs')
    .select('player_id')
    .eq('league_id', leagueId)
    .eq('season_year', seasonYear)
    .eq('week', week)
    .not('fantasy_points', 'is', null);

  if (fetchError || !players || players.length === 0) {
    logger.warn('No players found for recent stats update', {
      error: fetchError,
      leagueId,
      seasonYear,
      week,
    });
    return;
  }

  // Update recent stats for each player individually
  for (const player of players) {
    const { recent_mean, recent_std } = await calculateRecentStats(
      leagueId,
      player.player_id,
      seasonYear,
      week
    );

    const { error: updateError } = await supabase
      .from('league_calcs')
      .update({
        recent_mean,
        recent_std,
        updated_at: new Date().toISOString(),
      })
      .eq('league_id', leagueId)
      .eq('player_id', player.player_id)
      .eq('season_year', seasonYear)
      .eq('week', week);

    if (updateError) {
      logger.error('Failed to update recent stats for player', {
        error: updateError,
        leagueId,
        playerId: player.player_id,
        seasonYear,
        week,
      });
    }
  }
}

/**
 * Calculate only recent statistics for existing fantasy points
 */
export async function calculateRecentStatsOnly(
  leagueId?: string,
  seasonYear?: number,
  week?: number
): Promise<LeagueCalcsResult> {
  const currentYear = seasonYear || new Date().getFullYear();
  const currentWeek = week || getMostRecentNFLWeek();

  logger.info('Calculating recent statistics only', {
    league_id: leagueId,
    season_year: currentYear,
    week: currentWeek,
  });

  if (leagueId) {
    // Update recent stats for a specific league
    await updateRecentStatsForLeague(leagueId, currentYear, currentWeek);

    return {
      success: true,
      message: 'Recent statistics calculated for league',
      league_id: leagueId,
      season_year: currentYear,
      week: currentWeek,
    };
  } else {
    // Update recent stats for all leagues
    const { data: leagues, error } = await supabase
      .from('league_calcs')
      .select('league_id')
      .eq('season_year', currentYear)
      .eq('week', currentWeek)
      .not('fantasy_points', 'is', null);

    if (error) {
      logger.error('Failed to fetch leagues for recent stats', { error });
      throw new Error(`Failed to fetch leagues: ${error.message}`);
    }

    if (leagues && leagues.length > 0) {
      // Deduplicate league IDs since we can't use DISTINCT in Supabase select
      const leagueIds = leagues.map(
        (league: { league_id: string }) => league.league_id
      );
      const uniqueLeagueIds = [...new Set<string>(leagueIds)];

      for (const leagueId of uniqueLeagueIds) {
        await updateRecentStatsForLeague(leagueId, currentYear, currentWeek);
      }
    }

    return {
      success: true,
      message: 'Recent statistics calculated for all leagues',
      season_year: currentYear,
      week: currentWeek,
    };
  }
}
