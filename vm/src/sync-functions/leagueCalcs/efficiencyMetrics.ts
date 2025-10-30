import { logger } from '../../../../supabase/functions/utils/logger.ts';
import { supabase } from '../../../../supabase/functions/utils/supabase.ts';
import { RECENT_WEEKS } from './constants.ts';
import type { EfficiencyMetrics, EfficiencyMetrics3WeekAvg } from './types.ts';

/**
 * Efficiency Metrics Calculation Module
 *
 * Handles calculation of efficiency metrics for players including:
 * - Targets per game
 * - Catch rate (receptions / targets)
 * - Yards per target
 * - 3-week rolling averages of these metrics
 */

/**
 * Calculate efficiency metrics for a player for a specific week
 */
export async function calculateEfficiencyMetrics(
  leagueId: string,
  playerId: string,
  seasonYear: number,
  week: number
): Promise<EfficiencyMetrics> {
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
 * Calculate 3-week rolling averages for efficiency metrics
 */
export async function calculateEfficiencyMetrics3WeekAvg(
  leagueId: string,
  playerId: string,
  seasonYear: number,
  currentWeek: number
): Promise<EfficiencyMetrics3WeekAvg> {
  const startWeek = Math.max(1, currentWeek - RECENT_WEEKS + 1);

  const { data: recentMetrics, error } = await supabase
    .from('league_calcs')
    .select('targets_per_game, catch_rate, yards_per_target')
    .eq('league_id', leagueId)
    .eq('player_id', playerId)
    .eq('season_year', seasonYear)
    .gte('week', startWeek)
    .lte('week', currentWeek)
    .order('week', { ascending: true });

  if (error) {
    logger.error(
      'Failed to fetch recent efficiency metrics for 3-week average',
      {
        error,
        leagueId,
        playerId,
        seasonYear,
        currentWeek,
      }
    );
    return {
      targets_per_game_3wk_avg: null,
      catch_rate_3wk_avg: null,
      yards_per_target_3wk_avg: null,
    };
  }

  if (!recentMetrics || recentMetrics.length === 0) {
    return {
      targets_per_game_3wk_avg: null,
      catch_rate_3wk_avg: null,
      yards_per_target_3wk_avg: null,
    };
  }

  // Filter out null values and calculate averages
  const targetsPerGame = recentMetrics
    .map((r: any) => r.targets_per_game)
    .filter((p: any) => p !== null && p !== undefined);

  const catchRates = recentMetrics
    .map((r: any) => r.catch_rate)
    .filter((p: any) => p !== null && p !== undefined);

  const yardsPerTarget = recentMetrics
    .map((r: any) => r.yards_per_target)
    .filter((p: any) => p !== null && p !== undefined);

  // Calculate averages
  const targetsPerGameAvg =
    targetsPerGame.length > 0
      ? targetsPerGame.reduce((sum: number, val: number) => sum + val, 0) /
        targetsPerGame.length
      : null;

  const catchRateAvg =
    catchRates.length > 0
      ? catchRates.reduce((sum: number, val: number) => sum + val, 0) /
        catchRates.length
      : null;

  const yardsPerTargetAvg =
    yardsPerTarget.length > 0
      ? yardsPerTarget.reduce((sum: number, val: number) => sum + val, 0) /
        yardsPerTarget.length
      : null;

  return {
    targets_per_game_3wk_avg:
      targetsPerGameAvg !== null
        ? Math.round(targetsPerGameAvg * 100) / 100
        : null,
    catch_rate_3wk_avg:
      catchRateAvg !== null ? Math.round(catchRateAvg * 1000) / 1000 : null,
    yards_per_target_3wk_avg:
      yardsPerTargetAvg !== null
        ? Math.round(yardsPerTargetAvg * 100) / 100
        : null,
  };
}
