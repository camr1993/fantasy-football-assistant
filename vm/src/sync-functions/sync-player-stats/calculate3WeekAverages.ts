import { logger } from '../../../../supabase/functions/utils/logger.ts';
import { supabase } from '../../../../supabase/functions/utils/supabase.ts';

/**
 * Calculate 3-week rolling averages for efficiency metrics using SQL
 * This is much more efficient than doing it in JavaScript loops
 * Only includes weeks where the player actually played (played = true)
 * Uses the most recent 3 weeks where the player played (not necessarily consecutive weeks)
 */
export async function calculate3WeekRollingAverages(
  seasonYear: number,
  currentWeek: number
): Promise<void> {
  logger.info('Calculating 3-week rolling averages for efficiency metrics', {
    seasonYear,
    currentWeek,
  });

  // Use SQL to calculate rolling averages efficiently
  // Note: p_start_week parameter is kept for backwards compatibility but not used
  const { error } = await supabase.rpc('calculate_efficiency_3wk_avg', {
    p_season_year: seasonYear,
    p_week: currentWeek,
    p_start_week: Math.max(1, currentWeek - 2), // Not used in function, kept for compatibility
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

  // Calculate 3-week rolling averages for RB efficiency metrics
  const { error: rbError } = await supabase.rpc(
    'calculate_rb_efficiency_3wk_avg',
    {
      p_season_year: seasonYear,
      p_week: currentWeek,
      p_start_week: Math.max(1, currentWeek - 2), // Not used in function, kept for compatibility
    }
  );

  if (rbError) {
    logger.warn('SQL function for RB efficiency 3wk avg not found', {
      error: rbError.message,
      seasonYear,
      currentWeek,
    });
  } else {
    logger.info('Successfully calculated RB 3-week rolling averages via SQL', {
      seasonYear,
      currentWeek,
    });
  }

  // Calculate 3-week rolling averages for QB efficiency metrics
  const { error: qbError } = await supabase.rpc(
    'calculate_qb_efficiency_3wk_avg',
    {
      p_season_year: seasonYear,
      p_week: currentWeek,
      p_start_week: Math.max(1, currentWeek - 2), // Not used in function, kept for compatibility
    }
  );

  if (qbError) {
    logger.warn('SQL function for QB efficiency 3wk avg not found', {
      error: qbError.message,
      seasonYear,
      currentWeek,
    });
  } else {
    logger.info('Successfully calculated QB 3-week rolling averages via SQL', {
      seasonYear,
      currentWeek,
    });
  }

  // Calculate 3-week rolling averages for K efficiency metrics
  const { error: kError } = await supabase.rpc(
    'calculate_k_efficiency_3wk_avg',
    {
      p_season_year: seasonYear,
      p_week: currentWeek,
      p_start_week: Math.max(1, currentWeek - 2), // Not used in function, kept for compatibility
    }
  );

  if (kError) {
    logger.warn('SQL function for K efficiency 3wk avg not found', {
      error: kError.message,
      seasonYear,
      currentWeek,
    });
  } else {
    logger.info('Successfully calculated K 3-week rolling averages via SQL', {
      seasonYear,
      currentWeek,
    });
  }
}

/**
 * Fallback: Calculate 3-week rolling averages in code
 * This is less efficient but works if SQL function isn't available
 * Only includes weeks where the player actually played (played = true)
 * Uses the most recent 3 weeks where the player played (not necessarily consecutive weeks)
 */
async function calculate3WeekRollingAveragesFallback(
  seasonYear: number,
  currentWeek: number
): Promise<void> {
  // Get all players who have played in any week up to the current week
  const { data: players, error: playersError } = await supabase
    .from('player_stats')
    .select('player_id')
    .eq('season_year', seasonYear)
    .lte('week', currentWeek)
    .eq('source', 'actual')
    .eq('played', true)
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
      // Get efficiency metrics for the most recent 3 weeks where the player actually played
      // Only include weeks where played = true
      const { data: recentMetrics, error: metricsError } = await supabase
        .from('player_stats')
        .select('targets_per_game, catch_rate, yards_per_target, week')
        .eq('player_id', playerId)
        .eq('season_year', seasonYear)
        .lte('week', currentWeek)
        .eq('source', 'actual')
        .eq('played', true)
        .order('week', { ascending: false })
        .limit(3); // Get the most recent 3 weeks where played = true

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
