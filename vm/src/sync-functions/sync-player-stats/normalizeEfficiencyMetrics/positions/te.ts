import { logger } from '../../../../../../supabase/functions/utils/logger.ts';
import { supabase } from '../../../../../../supabase/functions/utils/supabase.ts';

/**
 * Normalize efficiency metrics globally across all TEs
 * Uses min-max scaling: (x - min) / (max - min)
 * This is league-agnostic - all TEs are normalized together
 */
export async function normalizeTEEfficiencyMetricsGlobally(
  seasonYear: number,
  week: number
): Promise<void> {
  logger.info('Normalizing efficiency metrics globally for all TEs', {
    seasonYear,
    week,
  });

  // Get all TE players with 3-week averages for this week
  // Note: We fetch ALL TE records for this week, even if some metrics are null.
  // Each metric is normalized independently, so we'll filter nulls per metric in JavaScript.
  // This ensures we include all records that have ANY of the three metrics, not just
  // records that have all three metrics.
  // IMPORTANT: Use pagination to fetch all records (Supabase has a default limit of 1000 rows)
  const teMetrics: any[] = [];
  let from = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    // Use !inner to force an inner join, ensuring we only get records where player exists
    // Specify the exact foreign key relationship (player_stats_player_id_fkey) since there
    // are multiple relationships between player_stats and players
    // Filter by position = 'TE'
    const { data: pageData, error } = await supabase
      .from('player_stats')
      .select(
        `
        player_id,
        targets_per_game_3wk_avg,
        yards_per_target_3wk_avg,
        receiving_touchdowns_3wk_avg,
        players!inner!player_stats_player_id_fkey(position)
      `
      )
      .eq('season_year', seasonYear)
      .eq('week', week)
      .eq('source', 'actual')
      .eq('players.position', 'TE')
      .range(from, from + pageSize - 1);

    if (error) {
      logger.error('Failed to fetch TE efficiency metrics for normalization', {
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

    teMetrics.push(...pageData);

    if (pageData.length < pageSize) {
      hasMore = false;
    } else {
      from += pageSize;
    }
  }

  if (!teMetrics || teMetrics.length === 0) {
    logger.warn(
      'No TE players with efficiency metrics found for normalization',
      {
        seasonYear,
        week,
      }
    );
    return;
  }

  // Extract values for min/max calculation
  // Each metric is normalized independently, so we filter nulls per metric
  // NOTE: The query already filters by .eq('players.position', 'TE'), so all records should be TE
  const targetsPerGameValues = teMetrics
    .map((m: any) => m.targets_per_game_3wk_avg)
    .filter((v: any) => v !== null && v !== undefined);

  const yardsPerTargetValues = teMetrics
    .map((m: any) => m.yards_per_target_3wk_avg)
    .filter((v: any) => v !== null && v !== undefined);

  const receivingTouchdownsValues = teMetrics
    .map((m: any) => m.receiving_touchdowns_3wk_avg)
    .filter((v: any) => v !== null && v !== undefined);

  // Check if we have any data to normalize
  // Each metric is normalized independently, so we need at least one metric with data
  if (
    targetsPerGameValues.length === 0 &&
    yardsPerTargetValues.length === 0 &&
    receivingTouchdownsValues.length === 0
  ) {
    logger.warn('Insufficient data for TE normalization', {
      seasonYear,
      week,
      targetsCount: targetsPerGameValues.length,
      yardsPerTargetCount: yardsPerTargetValues.length,
      receivingTouchdownsCount: receivingTouchdownsValues.length,
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

  // Only calculate yards per target min/max if we have data
  const yardsPerTargetMin =
    yardsPerTargetValues.length > 0 ? Math.min(...yardsPerTargetValues) : null;
  const yardsPerTargetMax =
    yardsPerTargetValues.length > 0 ? Math.max(...yardsPerTargetValues) : null;
  const yardsPerTargetRange =
    yardsPerTargetMin !== null && yardsPerTargetMax !== null
      ? yardsPerTargetMax - yardsPerTargetMin
      : 0;

  // Only calculate receiving touchdowns min/max if we have data
  const receivingTouchdownsMin =
    receivingTouchdownsValues.length > 0
      ? Math.min(...receivingTouchdownsValues)
      : null;
  const receivingTouchdownsMax =
    receivingTouchdownsValues.length > 0
      ? Math.max(...receivingTouchdownsValues)
      : null;
  const receivingTouchdownsRange =
    receivingTouchdownsMin !== null && receivingTouchdownsMax !== null
      ? receivingTouchdownsMax - receivingTouchdownsMin
      : 0;

  logger.info('Calculated global min/max for TE efficiency metrics', {
    seasonYear,
    week,
    targetsPerGame: { min: targetsPerGameMin, max: targetsPerGameMax },
    yardsPerTarget: { min: yardsPerTargetMin, max: yardsPerTargetMax },
    receivingTouchdowns: {
      min: receivingTouchdownsMin,
      max: receivingTouchdownsMax,
    },
  });

  // Normalize values using min-max scaling: (x - min) / (max - min)
  // Each metric is normalized independently - null values remain null
  const normalizedMetrics = teMetrics.map((metric: any) => ({
    player_id: metric.player_id,
    targets_per_game_3wk_avg_norm:
      metric.targets_per_game_3wk_avg !== null &&
      targetsPerGameRange > 0 &&
      targetsPerGameMin !== null
        ? (metric.targets_per_game_3wk_avg - targetsPerGameMin) /
          targetsPerGameRange
        : null,
    yards_per_target_3wk_avg_norm:
      metric.yards_per_target_3wk_avg !== null &&
      yardsPerTargetRange > 0 &&
      yardsPerTargetMin !== null
        ? (metric.yards_per_target_3wk_avg - yardsPerTargetMin) /
          yardsPerTargetRange
        : null,
    receiving_touchdowns_3wk_avg_norm:
      metric.receiving_touchdowns_3wk_avg !== null &&
      receivingTouchdownsRange > 0 &&
      receivingTouchdownsMin !== null
        ? (metric.receiving_touchdowns_3wk_avg - receivingTouchdownsMin) /
          receivingTouchdownsRange
        : null,
  }));

  // Update all TE records with normalized values
  const batchSize = 100;
  for (let i = 0; i < normalizedMetrics.length; i += batchSize) {
    const batch = normalizedMetrics.slice(i, i + batchSize);

    for (const normalizedMetric of batch) {
      // Build update object, handling null values for all metrics
      const updateData: Record<string, number | null> = {
        targets_per_game_3wk_avg_norm:
          normalizedMetric.targets_per_game_3wk_avg_norm !== null
            ? Math.round(
                normalizedMetric.targets_per_game_3wk_avg_norm * 1000
              ) / 1000
            : null,
        yards_per_target_3wk_avg_norm:
          normalizedMetric.yards_per_target_3wk_avg_norm !== null
            ? Math.round(
                normalizedMetric.yards_per_target_3wk_avg_norm * 1000
              ) / 1000
            : null,
        receiving_touchdowns_3wk_avg_norm:
          normalizedMetric.receiving_touchdowns_3wk_avg_norm !== null
            ? Math.round(
                normalizedMetric.receiving_touchdowns_3wk_avg_norm * 1000
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
        logger.error('Failed to update normalized TE efficiency metrics', {
          error: updateError,
          playerId: normalizedMetric.player_id,
          seasonYear,
          week,
        });
      }
    }
  }

  logger.info(
    'Successfully normalized efficiency metrics globally for all TEs',
    {
      seasonYear,
      week,
      playersUpdated: normalizedMetrics.length,
    }
  );
}

