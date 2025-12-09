import { logger } from '../../../../../../supabase/functions/utils/logger.ts';
import { supabase } from '../../../../../../supabase/functions/utils/supabase.ts';

/**
 * Normalize efficiency metrics globally across all QBs
 * Uses min-max scaling for passing_efficiency and rushing_upside: (x - min) / (max - min)
 * Uses z-score normalization for turnovers: (x - mean) / stddev
 * This is league-agnostic - all QBs are normalized together
 */
export async function normalizeQBEfficiencyMetricsGlobally(
  seasonYear: number,
  week: number
): Promise<void> {
  logger.info('Normalizing efficiency metrics globally for all QBs', {
    seasonYear,
    week,
  });

  // Get all QB players with 3-week averages for this week
  // Note: We fetch ALL QB records for this week, even if some metrics are null.
  // Each metric is normalized independently, so we'll filter nulls per metric in JavaScript.
  // This ensures we include all records that have ANY of the three metrics, not just
  // records that have all three metrics.
  // IMPORTANT: Use pagination to fetch all records (Supabase has a default limit of 1000 rows)
  const qbMetrics: any[] = [];
  let from = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    // Use !inner to force an inner join, ensuring we only get records where player exists
    // Specify the exact foreign key relationship (player_stats_player_id_fkey) since there
    // are multiple relationships between player_stats and players
    // Filter by position = 'QB'
    const { data: pageData, error } = await supabase
      .from('player_stats')
      .select(
        `
        player_id,
        passing_efficiency_3wk_avg,
        turnovers_3wk_avg,
        rushing_upside_3wk_avg,
        players!inner!player_stats_player_id_fkey(position)
      `
      )
      .eq('season_year', seasonYear)
      .eq('week', week)
      .eq('source', 'actual')
      .eq('players.position', 'QB')
      .range(from, from + pageSize - 1);

    if (error) {
      logger.error('Failed to fetch QB efficiency metrics for normalization', {
        error,
        seasonYear,
        week,
        from,
        pageSize,
      });
      return;
    }

    if (!pageData || pageData.length === 0) {
      hasMore = false;
      break;
    }

    qbMetrics.push(...pageData);

    if (pageData.length < pageSize) {
      hasMore = false;
    } else {
      from += pageSize;
    }
  }

  if (!qbMetrics || qbMetrics.length === 0) {
    logger.warn(
      'No QB players with efficiency metrics found for normalization',
      {
        seasonYear,
        week,
      }
    );
    return;
  }

  // Extract values for min/max calculation
  // Each metric is normalized independently, so we filter nulls per metric
  // NOTE: The query already filters by .eq('players.position', 'QB'), so all records should be QB
  const passingEfficiencyValues = qbMetrics
    .map((m: any) => m.passing_efficiency_3wk_avg)
    .filter((v: any) => v !== null && v !== undefined);

  const turnoversValues = qbMetrics
    .map((m: any) => m.turnovers_3wk_avg)
    .filter((v: any) => v !== null && v !== undefined);

  const rushingUpsideValues = qbMetrics
    .map((m: any) => m.rushing_upside_3wk_avg)
    .filter((v: any) => v !== null && v !== undefined);

  // Check if we have any data to normalize
  // Each metric is normalized independently, so we need at least one metric with data
  if (
    passingEfficiencyValues.length === 0 &&
    turnoversValues.length === 0 &&
    rushingUpsideValues.length === 0
  ) {
    logger.warn('Insufficient data for QB normalization', {
      seasonYear,
      week,
      passingEfficiencyCount: passingEfficiencyValues.length,
      turnoversCount: turnoversValues.length,
      rushingUpsideCount: rushingUpsideValues.length,
    });
    return;
  }

  // Calculate min and max for each metric globally
  // Handle cases where a metric might have no data
  const passingEfficiencyMin =
    passingEfficiencyValues.length > 0
      ? Math.min(...passingEfficiencyValues)
      : null;
  const passingEfficiencyMax =
    passingEfficiencyValues.length > 0
      ? Math.max(...passingEfficiencyValues)
      : null;
  const passingEfficiencyRange =
    passingEfficiencyMin !== null && passingEfficiencyMax !== null
      ? passingEfficiencyMax - passingEfficiencyMin
      : 0;

  // Z-score normalization for turnovers: calculate mean and std
  const turnoversMean =
    turnoversValues.length > 0
      ? turnoversValues.reduce((sum: number, val: number) => sum + val, 0) /
        turnoversValues.length
      : null;
  const turnoversVariance =
    turnoversMean !== null && turnoversValues.length > 0
      ? turnoversValues.reduce(
          (sum: number, val: number) => sum + Math.pow(val - turnoversMean, 2),
          0
        ) / turnoversValues.length
      : 0;
  const turnoversStddev = Math.sqrt(turnoversVariance);

  // Only calculate rushing upside min/max if we have data
  const rushingUpsideMin =
    rushingUpsideValues.length > 0 ? Math.min(...rushingUpsideValues) : null;
  const rushingUpsideMax =
    rushingUpsideValues.length > 0 ? Math.max(...rushingUpsideValues) : null;
  const rushingUpsideRange =
    rushingUpsideMin !== null && rushingUpsideMax !== null
      ? rushingUpsideMax - rushingUpsideMin
      : 0;

  logger.info('Calculated global stats for QB efficiency metrics', {
    seasonYear,
    week,
    passingEfficiency: {
      min: passingEfficiencyMin,
      max: passingEfficiencyMax,
    },
    turnovers: { mean: turnoversMean, stddev: turnoversStddev },
    rushingUpside: { min: rushingUpsideMin, max: rushingUpsideMax },
  });

  // Normalize values:
  // - passing_efficiency and rushing_upside use min-max scaling: (x - min) / (max - min)
  // - turnovers uses z-score normalization: (x - mean) / stddev
  // Each metric is normalized independently - null values remain null
  const normalizedMetrics = qbMetrics.map((metric: any) => ({
    player_id: metric.player_id,
    passing_efficiency_3wk_avg_norm:
      metric.passing_efficiency_3wk_avg !== null &&
      passingEfficiencyRange > 0 &&
      passingEfficiencyMin !== null
        ? (metric.passing_efficiency_3wk_avg - passingEfficiencyMin) /
          passingEfficiencyRange
        : null,
    turnovers_3wk_avg_norm:
      metric.turnovers_3wk_avg !== null &&
      turnoversStddev > 0 &&
      turnoversMean !== null
        ? (metric.turnovers_3wk_avg - turnoversMean) / turnoversStddev
        : null,
    rushing_upside_3wk_avg_norm:
      metric.rushing_upside_3wk_avg !== null &&
      rushingUpsideRange > 0 &&
      rushingUpsideMin !== null
        ? (metric.rushing_upside_3wk_avg - rushingUpsideMin) /
          rushingUpsideRange
        : null,
  }));

  // Update all QB records with normalized values
  const batchSize = 100;
  for (let i = 0; i < normalizedMetrics.length; i += batchSize) {
    const batch = normalizedMetrics.slice(i, i + batchSize);

    for (const normalizedMetric of batch) {
      // Build update object, handling null values for all metrics
      const updateData: Record<string, number | null> = {
        passing_efficiency_3wk_avg_norm:
          normalizedMetric.passing_efficiency_3wk_avg_norm !== null
            ? Math.round(
                normalizedMetric.passing_efficiency_3wk_avg_norm * 1000
              ) / 1000
            : null,
        turnovers_3wk_avg_norm:
          normalizedMetric.turnovers_3wk_avg_norm !== null
            ? Math.round(normalizedMetric.turnovers_3wk_avg_norm * 1000) / 1000
            : null,
        rushing_upside_3wk_avg_norm:
          normalizedMetric.rushing_upside_3wk_avg_norm !== null
            ? Math.round(normalizedMetric.rushing_upside_3wk_avg_norm * 1000) /
              1000
            : null,
      };

      const { error: updateError } = await supabase
        .from('player_stats')
        .update(updateData)
        .eq('player_id', normalizedMetric.player_id)
        .eq('season_year', seasonYear)
        .eq('week', week)
        .eq('source', 'actual');

      if (updateError) {
        logger.error('Failed to update normalized QB efficiency metrics', {
          error: updateError,
          playerId: normalizedMetric.player_id,
          seasonYear,
          week,
        });
      }
    }
  }

  logger.info(
    'Successfully normalized efficiency metrics globally for all QBs',
    {
      seasonYear,
      week,
      playersUpdated: normalizedMetrics.length,
    }
  );
}
