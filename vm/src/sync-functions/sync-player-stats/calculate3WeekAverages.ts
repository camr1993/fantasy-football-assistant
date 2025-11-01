import { logger } from '../../../../supabase/functions/utils/logger.ts';
import { supabase } from '../../../../supabase/functions/utils/supabase.ts';

/**
 * Calculate 3-week rolling averages for efficiency metrics using SQL
 * This is much more efficient than doing it in JavaScript loops
 */
export async function calculate3WeekRollingAverages(
  seasonYear: number,
  currentWeek: number
): Promise<void> {
  const startWeek = Math.max(1, currentWeek - 2); // 3 weeks: currentWeek, currentWeek-1, currentWeek-2

  logger.info('Calculating 3-week rolling averages for efficiency metrics', {
    seasonYear,
    currentWeek,
    startWeek,
  });

  // Use SQL to calculate rolling averages efficiently
  const { error } = await supabase.rpc('calculate_efficiency_3wk_avg', {
    p_season_year: seasonYear,
    p_week: currentWeek,
    p_start_week: startWeek,
  });

  if (error) {
    // If the function doesn't exist yet, calculate in code as fallback
    logger.warn('SQL function not found, calculating 3-week averages in code', {
      error: error.message,
    });
    await calculate3WeekRollingAveragesFallback(seasonYear, currentWeek);
  } else {
    logger.info('Successfully calculated 3-week rolling averages via SQL', {
      seasonYear,
      currentWeek,
    });
  }
}

/**
 * Fallback: Calculate 3-week rolling averages in code
 * This is less efficient but works if SQL function isn't available
 */
async function calculate3WeekRollingAveragesFallback(
  seasonYear: number,
  currentWeek: number
): Promise<void> {
  const startWeek = Math.max(1, currentWeek - 2);

  // Get all players with stats in the 3-week window
  const { data: players, error: playersError } = await supabase
    .from('player_stats')
    .select('player_id')
    .eq('season_year', seasonYear)
    .gte('week', startWeek)
    .lte('week', currentWeek)
    .eq('source', 'actual')
    .not('targets_per_game', 'is', null);

  if (playersError || !players) {
    logger.error('Failed to fetch players for 3-week averages', {
      error: playersError,
      seasonYear,
      currentWeek,
    });
    return;
  }

  const uniquePlayerIds = [
    ...new Set(players.map((p: { player_id: string }) => p.player_id)),
  ];

  logger.info('Calculating 3-week averages for players', {
    playerCount: uniquePlayerIds.length,
  });

  // Process in batches
  const batchSize = 100;
  for (let i = 0; i < uniquePlayerIds.length; i += batchSize) {
    const batch = uniquePlayerIds.slice(i, i + batchSize);

    for (const playerId of batch) {
      // Get efficiency metrics for the 3-week window
      const { data: recentMetrics, error: metricsError } = await supabase
        .from('player_stats')
        .select('targets_per_game, catch_rate, yards_per_target')
        .eq('player_id', playerId)
        .eq('season_year', seasonYear)
        .gte('week', startWeek)
        .lte('week', currentWeek)
        .eq('source', 'actual')
        .order('week', { ascending: true });

      if (metricsError || !recentMetrics || recentMetrics.length === 0) {
        continue;
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

      // Update current week's record with the 3-week average
      const { error: updateError } = await supabase
        .from('player_stats')
        .update({
          targets_per_game_3wk_avg:
            targetsPerGameAvg !== null
              ? Math.round(targetsPerGameAvg * 100) / 100
              : null,
          catch_rate_3wk_avg:
            catchRateAvg !== null
              ? Math.round(catchRateAvg * 1000) / 1000
              : null,
          yards_per_target_3wk_avg:
            yardsPerTargetAvg !== null
              ? Math.round(yardsPerTargetAvg * 100) / 100
              : null,
        })
        .eq('player_id', playerId)
        .eq('season_year', seasonYear)
        .eq('week', currentWeek)
        .eq('source', 'actual');

      if (updateError) {
        logger.error('Failed to update 3-week averages', {
          error: updateError,
          playerId,
          seasonYear,
          currentWeek,
        });
      }
    }
  }
}

