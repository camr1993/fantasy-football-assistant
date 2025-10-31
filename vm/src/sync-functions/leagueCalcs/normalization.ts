import { logger } from '../../../../supabase/functions/utils/logger.ts';
import { supabase } from '../../../../supabase/functions/utils/supabase.ts';
import type { EfficiencyMetrics3WeekAvgNorm } from './types.ts';

/**
 * Normalization Module
 *
 * Handles min-max scaling normalization of efficiency metrics to 0-1 scale
 */

/**
 * Calculate normalized values for 3-week rolling averages
 * NOTE: Efficiency metrics normalization is now done globally in syncPlayerStats
 * This function is kept for backward compatibility but is a no-op for efficiency metrics
 */
export async function calculateNormalizedEfficiencyMetrics3WeekAvg(
  leagueId: string,
  seasonYear: number,
  week: number
): Promise<EfficiencyMetrics3WeekAvgNorm> {
  // Efficiency metrics are now normalized globally in syncPlayerStats job
  // and stored in player_stats. No need to normalize here per league.
  logger.info(
    'Efficiency metrics normalization skipped - already done globally in player_stats',
    {
        leagueId,
        seasonYear,
        week,
    }
  );

      return {
        targets_per_game_3wk_avg_norm: null,
        catch_rate_3wk_avg_norm: null,
        yards_per_target_3wk_avg_norm: null,
      };
}

/**
 * Calculate normalized values for recent stats (mean and std) using min-max scaling
 */
export async function calculateNormalizedRecentStats(
  leagueId: string,
  seasonYear: number,
  week: number
): Promise<{
  recent_mean_norm: number | null;
  recent_std_norm: number | null;
}> {
  try {
    const { data: allRecent, error } = await supabase
      .from('league_calcs')
      .select('player_id, recent_mean, recent_std')
      .eq('league_id', leagueId)
      .eq('season_year', seasonYear)
      .eq('week', week)
      .not('recent_mean', 'is', null)
      .not('recent_std', 'is', null);

    if (error) {
      logger.error('Failed to fetch recent stats for normalization', {
        error,
        leagueId,
        seasonYear,
        week,
      });
      return { recent_mean_norm: null, recent_std_norm: null };
    }

    if (!allRecent || allRecent.length === 0) {
      return { recent_mean_norm: null, recent_std_norm: null };
    }

    const recentMeanValues = allRecent
      .map((m: any) => m.recent_mean)
      .filter((v: any) => v !== null && v !== undefined);
    const recentStdValues = allRecent
      .map((m: any) => m.recent_std)
      .filter((v: any) => v !== null && v !== undefined);

    const recentMeanMin = Math.min(...recentMeanValues);
    const recentMeanMax = Math.max(...recentMeanValues);
    const recentMeanRange = recentMeanMax - recentMeanMin;

    const recentStdMin = Math.min(...recentStdValues);
    const recentStdMax = Math.max(...recentStdValues);
    const recentStdRange = recentStdMax - recentStdMin;

    const normalized = allRecent.map((r: any) => ({
      player_id: r.player_id,
      recent_mean_norm:
        recentMeanRange > 0
          ? (r.recent_mean - recentMeanMin) / recentMeanRange
          : 0,
      recent_std_norm:
        recentStdRange > 0 ? (r.recent_std - recentStdMin) / recentStdRange : 0,
    }));

    for (const n of normalized) {
      const { error: updateError } = await supabase
        .from('league_calcs')
        .update({
          recent_mean_norm: Math.round(n.recent_mean_norm * 1000) / 1000,
          recent_std_norm: Math.round(n.recent_std_norm * 1000) / 1000,
          updated_at: new Date().toISOString(),
        })
        .eq('league_id', leagueId)
        .eq('player_id', n.player_id)
        .eq('season_year', seasonYear)
        .eq('week', week);

      if (updateError) {
        logger.error('Failed to update normalized recent stats', {
          error: updateError,
          leagueId,
          playerId: n.player_id,
          seasonYear,
          week,
        });
      }
    }

    logger.info('Successfully normalized recent stats for all players', {
      leagueId,
      seasonYear,
      week,
      playersUpdated: normalized.length,
    });

    return { recent_mean_norm: null, recent_std_norm: null };
  } catch (error) {
    logger.error('Error calculating normalized recent stats', {
      error: error instanceof Error ? error.message : String(error),
      leagueId,
      seasonYear,
      week,
    });
    return { recent_mean_norm: null, recent_std_norm: null };
  }
}
