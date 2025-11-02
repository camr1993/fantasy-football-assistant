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
  // Note: We fetch ALL WR records for this week, even if some metrics are null.
  // Each metric is normalized independently, so we'll filter nulls per metric in JavaScript.
  // This ensures we include all records that have ANY of the three metrics, not just
  // records that have all three metrics.
  // IMPORTANT: Use pagination to fetch all records (Supabase has a default limit of 1000 rows)
  const wrMetrics: any[] = [];
  let from = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    // Use !inner to force an inner join, ensuring we only get records where player exists
    // Specify the exact foreign key relationship (player_stats_player_id_fkey) since there
    // are multiple relationships between player_stats and players
    // Filter by position = 'WR'
    const { data: pageData, error } = await supabase
      .from('player_stats')
      .select(
        `
        player_id,
        targets_per_game_3wk_avg,
        catch_rate_3wk_avg,
        yards_per_target_3wk_avg,
        players!inner!player_stats_player_id_fkey(position)
      `
      )
      .eq('season_year', seasonYear)
      .eq('week', week)
      .eq('source', 'actual')
      .eq('players.position', 'WR')
      .range(from, from + pageSize - 1);

    if (error) {
      logger.error('Failed to fetch WR efficiency metrics for normalization', {
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

    wrMetrics.push(...pageData);

    if (pageData.length < pageSize) {
      hasMore = false;
    } else {
      from += pageSize;
    }
  }

  if (!wrMetrics || wrMetrics.length === 0) {
    logger.warn(
      'No WR players with efficiency metrics found for normalization',
      {
        seasonYear,
        week,
      }
    );
    return;
  }

  // Extract values for min/max calculation
  // Each metric is normalized independently, so we filter nulls per metric
  // NOTE: The query already filters by .eq('players.position', 'WR'), so all records should be WR
  // Debug: Verify all records are actually WR (should all be 'WR' if query filter is working)
  const nonWRRecords = wrMetrics.filter(
    (m: any) => m.players?.position !== 'WR'
  );
  if (nonWRRecords.length > 0) {
    logger.warn('Found non-WR records in query results despite WR filter', {
      seasonYear,
      week,
      nonWRCount: nonWRRecords.length,
      totalRecords: wrMetrics.length,
      sampleNonWRPositions: nonWRRecords
        .slice(0, 5)
        .map((r: any) => r.players?.position),
    });
  }

  const targetsPerGameValues = wrMetrics
    .map((m: any) => m.targets_per_game_3wk_avg)
    .filter((v: any) => v !== null && v !== undefined);

  const catchRateValues = wrMetrics
    .map((m: any) => m.catch_rate_3wk_avg)
    .filter((v: any) => v !== null && v !== undefined);

  const yardsPerTargetValues = wrMetrics
    .map((m: any) => m.yards_per_target_3wk_avg)
    .filter((v: any) => v !== null && v !== undefined);

  // Check if we have any data to normalize
  // Each metric is normalized independently, so we need at least one metric with data
  if (
    targetsPerGameValues.length === 0 &&
    catchRateValues.length === 0 &&
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
  // Handle cases where a metric might have no data
  const targetsPerGameMin =
    targetsPerGameValues.length > 0 ? Math.min(...targetsPerGameValues) : null;
  const targetsPerGameMax =
    targetsPerGameValues.length > 0 ? Math.max(...targetsPerGameValues) : null;
  const targetsPerGameRange =
    targetsPerGameMin !== null && targetsPerGameMax !== null
      ? targetsPerGameMax - targetsPerGameMin
      : 0;

  // Only calculate catch rate min/max if we have data
  const catchRateMin =
    catchRateValues.length > 0 ? Math.min(...catchRateValues) : null;
  const catchRateMax =
    catchRateValues.length > 0 ? Math.max(...catchRateValues) : null;
  const catchRateRange =
    catchRateMin !== null && catchRateMax !== null
      ? catchRateMax - catchRateMin
      : 0;

  // Only calculate yards per target min/max if we have data
  const yardsPerTargetMin =
    yardsPerTargetValues.length > 0 ? Math.min(...yardsPerTargetValues) : null;
  const yardsPerTargetMax =
    yardsPerTargetValues.length > 0 ? Math.max(...yardsPerTargetValues) : null;
  const yardsPerTargetRange =
    yardsPerTargetMin !== null && yardsPerTargetMax !== null
      ? yardsPerTargetMax - yardsPerTargetMin
      : 0;

  logger.info('Calculated global min/max for efficiency metrics', {
    seasonYear,
    week,
    targetsPerGame: { min: targetsPerGameMin, max: targetsPerGameMax },
    catchRate: { min: catchRateMin, max: catchRateMax },
    yardsPerTarget: { min: yardsPerTargetMin, max: yardsPerTargetMax },
  });

  // Normalize values using min-max scaling: (x - min) / (max - min)
  // Each metric is normalized independently - null values remain null
  const normalizedMetrics = wrMetrics.map((metric: any) => ({
    player_id: metric.player_id,
    targets_per_game_3wk_avg_norm:
      metric.targets_per_game_3wk_avg !== null &&
      targetsPerGameRange > 0 &&
      targetsPerGameMin !== null
        ? (metric.targets_per_game_3wk_avg - targetsPerGameMin) /
          targetsPerGameRange
        : null,
    catch_rate_3wk_avg_norm:
      metric.catch_rate_3wk_avg !== null &&
      catchRateRange > 0 &&
      catchRateMin !== null
        ? (metric.catch_rate_3wk_avg - catchRateMin) / catchRateRange
        : null,
    yards_per_target_3wk_avg_norm:
      metric.yards_per_target_3wk_avg !== null &&
      yardsPerTargetRange > 0 &&
      yardsPerTargetMin !== null
        ? (metric.yards_per_target_3wk_avg - yardsPerTargetMin) /
          yardsPerTargetRange
        : null,
  }));

  // Update all WR records with normalized values
  const batchSize = 100;
  for (let i = 0; i < normalizedMetrics.length; i += batchSize) {
    const batch = normalizedMetrics.slice(i, i + batchSize);

    for (const normalizedMetric of batch) {
      if (
        normalizedMetric.player_id === '7eda501d-d1b2-443f-b316-e553bc6cd6e4'
      ) {
        console.log('normalizedMetric', normalizedMetric);
        console.log(
          'targets_per_game_3wk_avg_norm',
          normalizedMetric.targets_per_game_3wk_avg_norm !== null
            ? Math.round(
                normalizedMetric.targets_per_game_3wk_avg_norm * 1000
              ) / 1000
            : null
        );
        console.log(
          'catch_rate_3wk_avg_norm',
          normalizedMetric.catch_rate_3wk_avg_norm !== null
            ? Math.round(normalizedMetric.catch_rate_3wk_avg_norm * 1000) / 1000
            : null
        );
        console.log(
          'yards_per_target_3wk_avg_norm',
          normalizedMetric.yards_per_target_3wk_avg_norm !== null
            ? Math.round(
                normalizedMetric.yards_per_target_3wk_avg_norm * 1000
              ) / 1000
            : null
        );
        console.log('--------------------------------');
        console.log('max', targetsPerGameMax, catchRateMax, yardsPerTargetMax);
        console.log('min', targetsPerGameMin, catchRateMin, yardsPerTargetMin);
        console.log(
          'range',
          targetsPerGameRange,
          catchRateRange,
          yardsPerTargetRange
        );
      }
      // Build update object, handling null values for all metrics
      const updateData: Record<string, number | null> = {
        targets_per_game_3wk_avg_norm:
          normalizedMetric.targets_per_game_3wk_avg_norm !== null
            ? Math.round(
                normalizedMetric.targets_per_game_3wk_avg_norm * 1000
              ) / 1000
            : null,
        catch_rate_3wk_avg_norm:
          normalizedMetric.catch_rate_3wk_avg_norm !== null
            ? Math.round(normalizedMetric.catch_rate_3wk_avg_norm * 1000) / 1000
            : null,
        yards_per_target_3wk_avg_norm:
          normalizedMetric.yards_per_target_3wk_avg_norm !== null
            ? Math.round(
                normalizedMetric.yards_per_target_3wk_avg_norm * 1000
              ) / 1000
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
        logger.error('Failed to update normalized efficiency metrics', {
          error: updateError,
          playerId: normalizedMetric.player_id,
          seasonYear,
          week,
        });
      }
    }
  }

  logger.info(
    'Successfully normalized efficiency metrics globally for all WRs',
    {
      seasonYear,
      week,
      playersUpdated: normalizedMetrics.length,
    }
  );
}
