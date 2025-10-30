import { logger } from '../../../../supabase/functions/utils/logger.ts';
import { supabase } from '../../../../supabase/functions/utils/supabase.ts';
import { getMostRecentNFLWeek } from '../../../../supabase/functions/utils/syncHelpers.ts';
import {
  calculateEfficiencyMetrics,
  calculateEfficiencyMetrics3WeekAvg,
} from './efficiencyMetrics.ts';
import { calculateRecentStats } from './recentStats.ts';
import { calculateNormalizedEfficiencyMetrics3WeekAvg } from './normalization.ts';
import { calculateWeightedScoresForLeague } from './weightedScoring/leagueWeightedScoring.ts';
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

  // Get all players who have fantasy points calculated for this week
  const { data: players, error: fetchError } = await supabase
    .from('league_calcs')
    .select('player_id')
    .eq('league_id', leagueId)
    .eq('season_year', seasonYear)
    .eq('week', week)
    .not('fantasy_points', 'is', null);

  if (fetchError) {
    logger.error('Failed to fetch players for recent stats update', {
      error: fetchError,
      leagueId,
      seasonYear,
      week,
    });
    return;
  }

  if (!players || players.length === 0) {
    logger.info('No players found for recent stats update', {
      leagueId,
      seasonYear,
      week,
    });
    return;
  }

  // Update recent stats and efficiency metrics for each player
  for (const player of players) {
    const { recent_mean, recent_std } = await calculateRecentStats(
      leagueId,
      player.player_id,
      seasonYear,
      week
    );

    const { targets_per_game, catch_rate, yards_per_target } =
      await calculateEfficiencyMetrics(
        leagueId,
        player.player_id,
        seasonYear,
        week
      );

    const {
      targets_per_game_3wk_avg,
      catch_rate_3wk_avg,
      yards_per_target_3wk_avg,
    } = await calculateEfficiencyMetrics3WeekAvg(
      leagueId,
      player.player_id,
      seasonYear,
      week
    );

    // Update the league_calcs record with recent statistics and efficiency metrics
    const { error: updateError } = await supabase
      .from('league_calcs')
      .update({
        recent_mean,
        recent_std,
        targets_per_game,
        catch_rate,
        yards_per_target,
        targets_per_game_3wk_avg,
        catch_rate_3wk_avg,
        yards_per_target_3wk_avg,
        updated_at: new Date().toISOString(),
      })
      .eq('league_id', leagueId)
      .eq('player_id', player.player_id)
      .eq('season_year', seasonYear)
      .eq('week', week);

    if (updateError) {
      logger.error(
        'Failed to update recent stats and efficiency metrics for player',
        {
          error: updateError,
          leagueId,
          playerId: player.player_id,
          seasonYear,
          week,
        }
      );
    }
  }

  // Calculate normalized values for all players after individual updates are complete
  await calculateNormalizedEfficiencyMetrics3WeekAvg(
    leagueId,
    seasonYear,
    week
  );

  // Calculate weighted scores for WR players after normalization is complete
  await calculateWeightedScoresForLeague(leagueId, seasonYear, week);

  logger.info('Completed recent statistics update for league', {
    leagueId,
    seasonYear,
    week,
    playersUpdated: players.length,
  });
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
      .select('DISTINCT league_id')
      .eq('season_year', currentYear)
      .eq('week', currentWeek)
      .not('fantasy_points', 'is', null);

    if (error) {
      logger.error('Failed to fetch leagues for recent stats', { error });
      throw new Error(`Failed to fetch leagues: ${error.message}`);
    }

    if (leagues && leagues.length > 0) {
      for (const league of leagues) {
        await updateRecentStatsForLeague(
          league.league_id,
          currentYear,
          currentWeek
        );
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
