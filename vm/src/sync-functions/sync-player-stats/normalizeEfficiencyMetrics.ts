import { logger } from '../../../../supabase/functions/utils/logger.ts';
import { supabase } from '../../../../supabase/functions/utils/supabase.ts';

/**
 * Normalize efficiency metrics globally across all WRs
 * Uses min-max scaling: (x - min) / (max - min)
 * This is league-agnostic - all WRs are normalized together
 */
export async function normalizeEfficiencyMetricsGlobally(
  seasonYear: number,
  week: number
): Promise<void> {
  logger.info('Normalizing efficiency metrics globally for all WRs', {
    seasonYear,
    week,
  });

  // Get all WR players with 3-week averages for this week
  const { data: wrMetrics, error } = await supabase
    .from('player_stats')
    .select(
      `
      player_id,
      targets_per_game_3wk_avg,
      catch_rate_3wk_avg,
      yards_per_target_3wk_avg,
      players!player_stats_player_id_fkey(position)
    `
    )
    .eq('season_year', seasonYear)
    .eq('week', week)
    .eq('source', 'actual')
    .eq('players.position', 'WR')
    .not('targets_per_game_3wk_avg', 'is', null)
    .not('catch_rate_3wk_avg', 'is', null)
    .not('yards_per_target_3wk_avg', 'is', null);

  if (error) {
    logger.error('Failed to fetch WR efficiency metrics for normalization', {
      error,
      seasonYear,
      week,
    });
    return;
  }

  if (!wrMetrics || wrMetrics.length === 0) {
    logger.warn('No WR players with efficiency metrics found for normalization', {
      seasonYear,
      week,
    });
    return;
  }

  // Extract values for min/max calculation
  const targetsPerGameValues = wrMetrics
    .map((m: any) => m.targets_per_game_3wk_avg)
    .filter((v: any) => v !== null && v !== undefined);

  const catchRateValues = wrMetrics
    .map((m: any) => m.catch_rate_3wk_avg)
    .filter((v: any) => v !== null && v !== undefined);

  const yardsPerTargetValues = wrMetrics
    .map((m: any) => m.yards_per_target_3wk_avg)
    .filter((v: any) => v !== null && v !== undefined);

  if (
    targetsPerGameValues.length === 0 ||
    catchRateValues.length === 0 ||
    yardsPerTargetValues.length === 0
  ) {
    logger.warn('Insufficient data for normalization', {
      seasonYear,
      week,
      targetsCount: targetsPerGameValues.length,
      catchRateCount: catchRateValues.length,
      yardsPerTargetCount: yardsPerTargetValues.length,
    });
    return;
  }

  // Calculate min and max for each metric globally
  const targetsPerGameMin = Math.min(...targetsPerGameValues);
  const targetsPerGameMax = Math.max(...targetsPerGameValues);
  const targetsPerGameRange = targetsPerGameMax - targetsPerGameMin;

  const catchRateMin = Math.min(...catchRateValues);
  const catchRateMax = Math.max(...catchRateValues);
  const catchRateRange = catchRateMax - catchRateMin;

  const yardsPerTargetMin = Math.min(...yardsPerTargetValues);
  const yardsPerTargetMax = Math.max(...yardsPerTargetValues);
  const yardsPerTargetRange = yardsPerTargetMax - yardsPerTargetMin;

  logger.info('Calculated global min/max for efficiency metrics', {
    seasonYear,
    week,
    targetsPerGame: { min: targetsPerGameMin, max: targetsPerGameMax },
    catchRate: { min: catchRateMin, max: catchRateMax },
    yardsPerTarget: { min: yardsPerTargetMin, max: yardsPerTargetMax },
  });

  // Normalize values using min-max scaling: (x - min) / (max - min)
  const normalizedMetrics = wrMetrics.map((metric: any) => ({
    player_id: metric.player_id,
    targets_per_game_3wk_avg_norm:
      targetsPerGameRange > 0
        ? (metric.targets_per_game_3wk_avg - targetsPerGameMin) /
          targetsPerGameRange
        : 0,
    catch_rate_3wk_avg_norm:
      catchRateRange > 0
        ? (metric.catch_rate_3wk_avg - catchRateMin) / catchRateRange
        : 0,
    yards_per_target_3wk_avg_norm:
      yardsPerTargetRange > 0
        ? (metric.yards_per_target_3wk_avg - yardsPerTargetMin) /
          yardsPerTargetRange
        : 0,
  }));

  // Update all WR records with normalized values
  const batchSize = 100;
  for (let i = 0; i < normalizedMetrics.length; i += batchSize) {
    const batch = normalizedMetrics.slice(i, i + batchSize);

    for (const normalizedMetric of batch) {
      const { error: updateError } = await supabase
        .from('player_stats')
        .update({
          targets_per_game_3wk_avg_norm:
            Math.round(normalizedMetric.targets_per_game_3wk_avg_norm * 1000) /
            1000,
          catch_rate_3wk_avg_norm:
            Math.round(normalizedMetric.catch_rate_3wk_avg_norm * 1000) / 1000,
          yards_per_target_3wk_avg_norm:
            Math.round(normalizedMetric.yards_per_target_3wk_avg_norm * 1000) /
            1000,
        })
        .eq('player_id', normalizedMetric.player_id)
        .eq('season_year', seasonYear)
        .eq('week', week)
        .eq('source', 'actual');

      if (updateError) {
        logger.error('Failed to update normalized efficiency metrics', {
          error: updateError,
          playerId: normalizedMetric.player_id,
          seasonYear,
          week,
        });
      }
    }
  }

  logger.info('Successfully normalized efficiency metrics globally for all WRs', {
    seasonYear,
    week,
    playersUpdated: normalizedMetrics.length,
  });
}

