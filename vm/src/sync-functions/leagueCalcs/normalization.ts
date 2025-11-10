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
 * Calculate normalized values for recent stats
 * recent_mean_norm: min-max scaling normalization
 * recent_std_norm: inverted z-score normalization (-1 * z-score)
 * Normalizes within each position group (WR vs WR, RB vs RB, etc.)
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
    // Use SQL bulk update to normalize recent stats for all players at once
    const { data: result, error: rpcError } = await supabase.rpc(
      'normalize_recent_stats_bulk',
      {
        p_league_id: leagueId,
        p_season_year: seasonYear,
        p_week: week,
      }
    );

    if (rpcError) {
      logger.warn(
        'SQL bulk normalization failed, falling back to individual updates',
        {
          error: rpcError,
          leagueId,
          seasonYear,
          week,
        }
      );
      // Fallback to individual updates
      return await calculateNormalizedRecentStatsFallback(
        leagueId,
        seasonYear,
        week
      );
    } else {
      logger.info(
        'Successfully normalized recent stats using SQL bulk update',
        {
          leagueId,
          seasonYear,
          week,
          playersUpdated: result || 0,
        }
      );
      return { recent_mean_norm: null, recent_std_norm: null };
    }
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

/**
 * Fallback: Normalize recent stats individually (less efficient)
 * Used when SQL bulk function is not available
 * recent_mean_norm: min-max scaling normalization
 * recent_std_norm: inverted z-score normalization (-1 * z-score)
 * Normalizes within each position group (WR vs WR, RB vs RB, etc.)
 */
async function calculateNormalizedRecentStatsFallback(
  leagueId: string,
  seasonYear: number,
  week: number
): Promise<{
  recent_mean_norm: number | null;
  recent_std_norm: number | null;
}> {
  const { data: allRecent, error } = await supabase
    .from('league_calcs')
    .select(
      'player_id, recent_mean, recent_std, players!league_calcs_player_id_fkey(position)'
    )
    .eq('league_id', leagueId)
    .eq('season_year', seasonYear)
    .eq('week', week)
    .not('recent_mean', 'is', null)
    .not('recent_std', 'is', null);

  if (error || !allRecent || allRecent.length === 0) {
    return { recent_mean_norm: null, recent_std_norm: null };
  }

  // Group by position
  const byPosition = new Map<string, typeof allRecent>();
  for (const record of allRecent) {
    const position = (record as any).players?.position;
    if (!position) {
      logger.warn('Player missing position, skipping normalization', {
        playerId: record.player_id,
        leagueId,
        seasonYear,
        week,
      });
      continue;
    }

    if (!byPosition.has(position)) {
      byPosition.set(position, []);
    }
    byPosition.get(position)!.push(record);
  }

  // Normalize within each position group
  const normalized: Array<{
    player_id: string;
    recent_mean_norm: number;
    recent_std_norm: number;
  }> = [];

  for (const [_position, positionRecords] of byPosition.entries()) {
    const recentMeanValues = positionRecords
      .map((m: any) => m.recent_mean)
      .filter((v: any) => v !== null && v !== undefined);
    const recentStdValues = positionRecords
      .map((m: any) => m.recent_std)
      .filter((v: any) => v !== null && v !== undefined);

    if (recentMeanValues.length === 0 || recentStdValues.length === 0) {
      continue;
    }

    // Min-max normalization for recent_mean
    const recentMeanMin = Math.min(...recentMeanValues);
    const recentMeanMax = Math.max(...recentMeanValues);
    const recentMeanRange = recentMeanMax - recentMeanMin;

    // Z-score normalization for recent_std: calculate mean and std
    const recentStdMean =
      recentStdValues.reduce((sum: number, val: number) => sum + val, 0) /
      recentStdValues.length;
    const recentStdVariance =
      recentStdValues.reduce(
        (sum: number, val: number) => sum + Math.pow(val - recentStdMean, 2),
        0
      ) / recentStdValues.length;
    const recentStdStddev = Math.sqrt(recentStdVariance);

    for (const r of positionRecords) {
      normalized.push({
        player_id: r.player_id,
        recent_mean_norm:
          recentMeanRange > 0
            ? (r.recent_mean - recentMeanMin) / recentMeanRange
            : 0,
        recent_std_norm:
          recentStdStddev > 0
            ? -1 * ((r.recent_std - recentStdMean) / recentStdStddev)
            : 0,
      });
    }
  }

  // Update all normalized values
  for (const n of normalized) {
    const { error: updateError } = await supabase
      .from('league_calcs')
      .update({
        recent_mean_norm: Math.round(n.recent_mean_norm * 1000) / 1000,
        recent_std_norm: (-1 * Math.round(n.recent_std_norm * 1000)) / 1000, // multiply by -1 to invert the z-score normalization
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

  return { recent_mean_norm: null, recent_std_norm: null };
}
