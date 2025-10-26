import { logger } from '../../../supabase/functions/utils/logger.ts';
import { supabase } from '../../../supabase/functions/utils/supabase.ts';
import { getMostRecentNFLWeek } from '../../../supabase/functions/utils/syncHelpers.ts';

/**
 * League Calculations - Recent Statistics and Efficiency Metrics Module
 *
 * This module handles the calculation of:
 * 1. Recent statistics (mean and standard deviation) for fantasy points over the last 3 weeks
 * 2. Efficiency metrics (targets per game, catch rate, yards per target) for players
 *
 * It operates on existing fantasy points data in the league_calcs table.
 */

// Configuration for recent statistics calculation
const RECENT_WEEKS = 3; // Number of recent weeks to include in mean/std calculations

/**
 * Calculate efficiency metrics for a player for a specific week
 */
async function calculateEfficiencyMetrics(
  leagueId: string,
  playerId: string,
  seasonYear: number,
  week: number
): Promise<{
  targets_per_game: number;
  catch_rate: number;
  yards_per_target: number;
}> {
  try {
    // Get player stats for the specific week
    const { data: playerStats, error } = await supabase
      .from('player_stats')
      .select(
        `
        receptions,
        targets,
        receiving_yards,
        players!player_stats_player_id_fkey(position)
      `
      )
      .eq('player_id', playerId)
      .eq('season_year', seasonYear)
      .eq('week', week)
      .eq('source', 'actual')
      .single();

    if (error || !playerStats) {
      logger.debug('No player stats found for efficiency metrics', {
        leagueId,
        playerId,
        seasonYear,
        week,
        error: error?.message,
      });
      return {
        targets_per_game: 0,
        catch_rate: 0,
        yards_per_target: 0,
      };
    }

    const receptions = playerStats.receptions || 0;
    const targets = playerStats.targets || 0;
    const receivingYards = playerStats.receiving_yards || 0;

    // Calculate targets per game (for this week, it's just the targets)
    const targetsPerGame = targets;

    // Calculate catch rate (receptions / targets)
    const catchRate = targets > 0 ? receptions / targets : 0;

    // Calculate yards per target
    const yardsPerTarget = targets > 0 ? receivingYards / targets : 0;

    return {
      targets_per_game: Math.round(targetsPerGame * 100) / 100,
      catch_rate: Math.round(catchRate * 1000) / 1000, // Round to 3 decimal places
      yards_per_target: Math.round(yardsPerTarget * 100) / 100,
    };
  } catch (error) {
    logger.error('Error calculating efficiency metrics', {
      error: error instanceof Error ? error.message : String(error),
      leagueId,
      playerId,
      seasonYear,
      week,
    });
    return {
      targets_per_game: 0,
      catch_rate: 0,
      yards_per_target: 0,
    };
  }
}

/**
 * Calculate recent statistics (mean and std) for a player over recent weeks
 */
async function calculateRecentStats(
  leagueId: string,
  playerId: string,
  seasonYear: number,
  currentWeek: number
): Promise<{ recent_mean: number | null; recent_std: number | null }> {
  const startWeek = Math.max(1, currentWeek - RECENT_WEEKS + 1);

  const { data: recentPoints, error } = await supabase
    .from('league_calcs')
    .select('fantasy_points')
    .eq('league_id', leagueId)
    .eq('player_id', playerId)
    .eq('season_year', seasonYear)
    .gte('week', startWeek)
    .lte('week', currentWeek)
    .order('week', { ascending: true });

  if (error) {
    logger.error('Failed to fetch recent points for statistics', {
      error,
      leagueId,
      playerId,
      seasonYear,
      currentWeek,
    });
    return { recent_mean: null, recent_std: null };
  }

  if (!recentPoints || recentPoints.length === 0) {
    return { recent_mean: null, recent_std: null };
  }

  const points = recentPoints
    .map((r: any) => r.fantasy_points)
    .filter((p: any) => p !== null);

  if (points.length === 0) {
    return { recent_mean: null, recent_std: null };
  }

  // Calculate mean
  const mean =
    points.reduce((sum: number, point: number) => sum + point, 0) /
    points.length;

  // Calculate standard deviation
  const variance =
    points.reduce(
      (sum: number, point: number) => sum + Math.pow(point - mean, 2),
      0
    ) / points.length;
  const std = Math.sqrt(variance);

  return {
    recent_mean: Math.round(mean * 100) / 100, // Round to 2 decimal places
    recent_std: Math.round(std * 100) / 100, // Round to 2 decimal places
  };
}

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

    // Update the league_calcs record with recent statistics and efficiency metrics
    const { error: updateError } = await supabase
      .from('league_calcs')
      .update({
        recent_mean,
        recent_std,
        targets_per_game,
        catch_rate,
        yards_per_target,
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
): Promise<{
  success: boolean;
  message: string;
  league_id?: string;
  season_year?: number;
  week?: number;
  updated_count?: number;
}> {
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
