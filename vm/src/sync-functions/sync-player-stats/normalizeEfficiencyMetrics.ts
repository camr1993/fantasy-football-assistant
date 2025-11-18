import { logger } from '../../../../supabase/functions/utils/logger.ts';
import { supabase } from '../../../../supabase/functions/utils/supabase.ts';

/**
 * Normalize efficiency metrics globally across all WRs
 * Uses min-max scaling: (x - min) / (max - min)
 * This is league-agnostic - all WRs are normalized together
 */
export async function normalizeWREfficiencyMetricsGlobally(
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

/**
 * Normalize RB efficiency metrics globally across all RBs
 * Uses min-max scaling: (x - min) / (max - min)
 * This is league-agnostic - all RBs are normalized together
 */
export async function normalizeRBEfficiencyMetricsGlobally(
  seasonYear: number,
  week: number
): Promise<void> {
  logger.info('Normalizing RB efficiency metrics globally for all RBs', {
    seasonYear,
    week,
  });

  // Get all RB players with 3-week averages for this week
  const rbMetrics: any[] = [];
  let from = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: pageData, error } = await supabase
      .from('player_stats')
      .select(
        `
        player_id,
        weighted_opportunity_3wk_avg,
        touchdown_production_3wk_avg,
        receiving_profile_3wk_avg,
        yards_per_touch_3wk_avg,
        players!inner!player_stats_player_id_fkey(position)
      `
      )
      .eq('season_year', seasonYear)
      .eq('week', week)
      .eq('source', 'actual')
      .eq('players.position', 'RB')
      .range(from, from + pageSize - 1);

    if (error) {
      logger.error('Failed to fetch RB efficiency metrics for normalization', {
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

    rbMetrics.push(...pageData);

    if (pageData.length < pageSize) {
      hasMore = false;
    } else {
      from += pageSize;
    }
  }

  if (!rbMetrics || rbMetrics.length === 0) {
    logger.warn(
      'No RB players with efficiency metrics found for normalization',
      {
        seasonYear,
        week,
      }
    );
    return;
  }

  // Extract values for min/max calculation
  const weightedOpportunityValues = rbMetrics
    .map((m: any) => m.weighted_opportunity_3wk_avg)
    .filter((v: any) => v !== null && v !== undefined);

  const touchdownProductionValues = rbMetrics
    .map((m: any) => m.touchdown_production_3wk_avg)
    .filter((v: any) => v !== null && v !== undefined);

  const receivingProfileValues = rbMetrics
    .map((m: any) => m.receiving_profile_3wk_avg)
    .filter((v: any) => v !== null && v !== undefined);

  const yardsPerTouchValues = rbMetrics
    .map((m: any) => m.yards_per_touch_3wk_avg)
    .filter((v: any) => v !== null && v !== undefined);

  // Check if we have any data to normalize
  if (
    weightedOpportunityValues.length === 0 &&
    touchdownProductionValues.length === 0 &&
    receivingProfileValues.length === 0 &&
    yardsPerTouchValues.length === 0
  ) {
    logger.warn('Insufficient data for RB normalization', {
      seasonYear,
      week,
      weightedOpportunityCount: weightedOpportunityValues.length,
      touchdownProductionCount: touchdownProductionValues.length,
      receivingProfileCount: receivingProfileValues.length,
      yardsPerTouchCount: yardsPerTouchValues.length,
    });
    return;
  }

  // Calculate min and max for each metric globally
  const weightedOpportunityMin =
    weightedOpportunityValues.length > 0
      ? Math.min(...weightedOpportunityValues)
      : null;
  const weightedOpportunityMax =
    weightedOpportunityValues.length > 0
      ? Math.max(...weightedOpportunityValues)
      : null;
  const weightedOpportunityRange =
    weightedOpportunityMin !== null && weightedOpportunityMax !== null
      ? weightedOpportunityMax - weightedOpportunityMin
      : 0;

  const touchdownProductionMin =
    touchdownProductionValues.length > 0
      ? Math.min(...touchdownProductionValues)
      : null;
  const touchdownProductionMax =
    touchdownProductionValues.length > 0
      ? Math.max(...touchdownProductionValues)
      : null;
  const touchdownProductionRange =
    touchdownProductionMin !== null && touchdownProductionMax !== null
      ? touchdownProductionMax - touchdownProductionMin
      : 0;

  const receivingProfileMin =
    receivingProfileValues.length > 0
      ? Math.min(...receivingProfileValues)
      : null;
  const receivingProfileMax =
    receivingProfileValues.length > 0
      ? Math.max(...receivingProfileValues)
      : null;
  const receivingProfileRange =
    receivingProfileMin !== null && receivingProfileMax !== null
      ? receivingProfileMax - receivingProfileMin
      : 0;

  const yardsPerTouchMin =
    yardsPerTouchValues.length > 0 ? Math.min(...yardsPerTouchValues) : null;
  const yardsPerTouchMax =
    yardsPerTouchValues.length > 0 ? Math.max(...yardsPerTouchValues) : null;
  const yardsPerTouchRange =
    yardsPerTouchMin !== null && yardsPerTouchMax !== null
      ? yardsPerTouchMax - yardsPerTouchMin
      : 0;

  logger.info('Calculated global min/max for RB efficiency metrics', {
    seasonYear,
    week,
    weightedOpportunity: {
      min: weightedOpportunityMin,
      max: weightedOpportunityMax,
    },
    touchdownProduction: {
      min: touchdownProductionMin,
      max: touchdownProductionMax,
    },
    receivingProfile: { min: receivingProfileMin, max: receivingProfileMax },
    yardsPerTouch: { min: yardsPerTouchMin, max: yardsPerTouchMax },
  });

  // Normalize values using min-max scaling: (x - min) / (max - min)
  const normalizedMetrics = rbMetrics.map((metric: any) => ({
    player_id: metric.player_id,
    weighted_opportunity_3wk_avg_norm:
      metric.weighted_opportunity_3wk_avg !== null &&
      weightedOpportunityRange > 0 &&
      weightedOpportunityMin !== null
        ? (metric.weighted_opportunity_3wk_avg - weightedOpportunityMin) /
          weightedOpportunityRange
        : null,
    touchdown_production_3wk_avg_norm:
      metric.touchdown_production_3wk_avg !== null &&
      touchdownProductionRange > 0 &&
      touchdownProductionMin !== null
        ? (metric.touchdown_production_3wk_avg - touchdownProductionMin) /
          touchdownProductionRange
        : null,
    receiving_profile_3wk_avg_norm:
      metric.receiving_profile_3wk_avg !== null &&
      receivingProfileRange > 0 &&
      receivingProfileMin !== null
        ? (metric.receiving_profile_3wk_avg - receivingProfileMin) /
          receivingProfileRange
        : null,
    yards_per_touch_3wk_avg_norm:
      metric.yards_per_touch_3wk_avg !== null &&
      yardsPerTouchRange > 0 &&
      yardsPerTouchMin !== null
        ? (metric.yards_per_touch_3wk_avg - yardsPerTouchMin) /
          yardsPerTouchRange
        : null,
  }));

  // Update all RB records with normalized values
  const batchSize = 100;
  for (let i = 0; i < normalizedMetrics.length; i += batchSize) {
    const batch = normalizedMetrics.slice(i, i + batchSize);

    for (const normalizedMetric of batch) {
      const updateData: Record<string, number | null> = {
        weighted_opportunity_3wk_avg_norm:
          normalizedMetric.weighted_opportunity_3wk_avg_norm !== null
            ? Math.round(
                normalizedMetric.weighted_opportunity_3wk_avg_norm * 1000
              ) / 1000
            : null,
        touchdown_production_3wk_avg_norm:
          normalizedMetric.touchdown_production_3wk_avg_norm !== null
            ? Math.round(
                normalizedMetric.touchdown_production_3wk_avg_norm * 1000
              ) / 1000
            : null,
        receiving_profile_3wk_avg_norm:
          normalizedMetric.receiving_profile_3wk_avg_norm !== null
            ? Math.round(
                normalizedMetric.receiving_profile_3wk_avg_norm * 1000
              ) / 1000
            : null,
        yards_per_touch_3wk_avg_norm:
          normalizedMetric.yards_per_touch_3wk_avg_norm !== null
            ? Math.round(normalizedMetric.yards_per_touch_3wk_avg_norm * 1000) /
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
        logger.error('Failed to update normalized RB efficiency metrics', {
          error: updateError,
          playerId: normalizedMetric.player_id,
          seasonYear,
          week,
        });
      }
    }
  }

  logger.info(
    'Successfully normalized RB efficiency metrics globally for all RBs',
    {
      seasonYear,
      week,
      playersUpdated: normalizedMetrics.length,
    }
  );
}
