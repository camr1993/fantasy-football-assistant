import { logger } from '../../../../supabase/functions/utils/logger.ts';
import { supabase } from '../../../../supabase/functions/utils/supabase.ts';
import { RECENT_WEEKS } from './constants.ts';
import type { RecentStats } from './types.ts';

/**
 * Recent Statistics Calculation Module
 *
 * Handles calculation of recent statistics for players including:
 * - Rolling mean of fantasy points over recent weeks
 * - Rolling standard deviation of fantasy points over recent weeks
 */

/**
 * Calculate recent statistics (mean and std) for a player over recent weeks
 */
export async function calculateRecentStats(
  leagueId: string,
  playerId: string,
  seasonYear: number,
  currentWeek: number
): Promise<RecentStats> {
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
