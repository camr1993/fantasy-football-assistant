import { logger } from '../../../../../../supabase/functions/utils/logger.ts';
import { supabase } from '../../../../../../supabase/functions/utils/supabase.ts';

/**
 * Normalize K efficiency metrics globally across all Ks
 * Uses min-max scaling: (x - min) / (max - min)
 * This is league-agnostic - all Ks are normalized together
 */
export async function normalizeKEfficiencyMetricsGlobally(
  seasonYear: number,
  week: number
): Promise<void> {
  logger.info('Normalizing efficiency metrics globally for all Ks', {
    seasonYear,
    week,
  });

  // Get all K players with 3-week averages for this week
  const kMetrics: any[] = [];
  let from = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: pageData, error } = await supabase
      .from('player_stats')
      .select(
        `
        player_id,
        fg_profile_3wk_avg,
        fg_pat_misses_3wk_avg,
        fg_attempts_3wk_avg,
        players!inner!player_stats_player_id_fkey(position)
      `
      )
      .eq('season_year', seasonYear)
      .eq('week', week)
      .eq('source', 'actual')
      .eq('players.position', 'K')
      .range(from, from + pageSize - 1);

    if (error) {
      logger.error('Failed to fetch K efficiency metrics for normalization', {
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

    kMetrics.push(...pageData);

    if (pageData.length < pageSize) {
      hasMore = false;
    } else {
      from += pageSize;
    }
  }

  if (!kMetrics || kMetrics.length === 0) {
    logger.warn(
      'No K players with efficiency metrics found for normalization',
      {
        seasonYear,
        week,
      }
    );
    return;
  }

  // Extract values for min/max calculation
  // Each metric is normalized independently, so we filter nulls per metric
  const fgProfileValues = kMetrics
    .map((m: any) => m.fg_profile_3wk_avg)
    .filter((v: any) => v !== null && v !== undefined);

  const fgPatMissesValues = kMetrics
    .map((m: any) => m.fg_pat_misses_3wk_avg)
    .filter((v: any) => v !== null && v !== undefined);

  const fgAttemptsValues = kMetrics
    .map((m: any) => m.fg_attempts_3wk_avg)
    .filter((v: any) => v !== null && v !== undefined);

  // Check if we have any data to normalize
  if (
    fgProfileValues.length === 0 &&
    fgPatMissesValues.length === 0 &&
    fgAttemptsValues.length === 0
  ) {
    logger.warn('Insufficient data for K normalization', {
      seasonYear,
      week,
      fgProfileCount: fgProfileValues.length,
      fgPatMissesCount: fgPatMissesValues.length,
      fgAttemptsCount: fgAttemptsValues.length,
    });
    return;
  }

  // Calculate min and max for each metric globally
  const fgProfileMin =
    fgProfileValues.length > 0 ? Math.min(...fgProfileValues) : null;
  const fgProfileMax =
    fgProfileValues.length > 0 ? Math.max(...fgProfileValues) : null;
  const fgProfileRange =
    fgProfileMin !== null && fgProfileMax !== null
      ? fgProfileMax - fgProfileMin
      : 0;

  const fgPatMissesMin =
    fgPatMissesValues.length > 0 ? Math.min(...fgPatMissesValues) : null;
  const fgPatMissesMax =
    fgPatMissesValues.length > 0 ? Math.max(...fgPatMissesValues) : null;
  const fgPatMissesRange =
    fgPatMissesMin !== null && fgPatMissesMax !== null
      ? fgPatMissesMax - fgPatMissesMin
      : 0;

  const fgAttemptsMin =
    fgAttemptsValues.length > 0 ? Math.min(...fgAttemptsValues) : null;
  const fgAttemptsMax =
    fgAttemptsValues.length > 0 ? Math.max(...fgAttemptsValues) : null;
  const fgAttemptsRange =
    fgAttemptsMin !== null && fgAttemptsMax !== null
      ? fgAttemptsMax - fgAttemptsMin
      : 0;

  logger.info('Calculated global min/max for K efficiency metrics', {
    seasonYear,
    week,
    fgProfile: { min: fgProfileMin, max: fgProfileMax },
    fgPatMisses: { min: fgPatMissesMin, max: fgPatMissesMax },
    fgAttempts: { min: fgAttemptsMin, max: fgAttemptsMax },
  });

  // Normalize values using min-max scaling: (x - min) / (max - min)
  // Each metric is normalized independently - null values remain null
  const normalizedMetrics = kMetrics.map((metric: any) => ({
    player_id: metric.player_id,
    fg_profile_3wk_avg_norm:
      metric.fg_profile_3wk_avg !== null &&
      fgProfileRange > 0 &&
      fgProfileMin !== null
        ? (metric.fg_profile_3wk_avg - fgProfileMin) / fgProfileRange
        : null,
    fg_pat_misses_3wk_avg_norm:
      metric.fg_pat_misses_3wk_avg !== null &&
      fgPatMissesRange > 0 &&
      fgPatMissesMin !== null
        ? (metric.fg_pat_misses_3wk_avg - fgPatMissesMin) / fgPatMissesRange
        : null,
    fg_attempts_3wk_avg_norm:
      metric.fg_attempts_3wk_avg !== null &&
      fgAttemptsRange > 0 &&
      fgAttemptsMin !== null
        ? (metric.fg_attempts_3wk_avg - fgAttemptsMin) / fgAttemptsRange
        : null,
  }));

  // Update all K records with normalized values
  const batchSize = 100;
  for (let i = 0; i < normalizedMetrics.length; i += batchSize) {
    const batch = normalizedMetrics.slice(i, i + batchSize);

    for (const normalizedMetric of batch) {
      // Build update object, handling null values for all metrics
      const updateData: Record<string, number | null> = {
        fg_profile_3wk_avg_norm:
          normalizedMetric.fg_profile_3wk_avg_norm !== null
            ? Math.round(normalizedMetric.fg_profile_3wk_avg_norm * 1000) / 1000
            : null,
        fg_pat_misses_3wk_avg_norm:
          normalizedMetric.fg_pat_misses_3wk_avg_norm !== null
            ? Math.round(
                normalizedMetric.fg_pat_misses_3wk_avg_norm * 1000
              ) / 1000
            : null,
        fg_attempts_3wk_avg_norm:
          normalizedMetric.fg_attempts_3wk_avg_norm !== null
            ? Math.round(normalizedMetric.fg_attempts_3wk_avg_norm * 1000) /
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
        logger.error('Failed to update normalized K efficiency metrics', {
          error: updateError,
          playerId: normalizedMetric.player_id,
          seasonYear,
          week,
        });
      }
    }
  }

  logger.info(
    'Successfully normalized efficiency metrics globally for all Ks',
    {
      seasonYear,
      week,
      playersUpdated: normalizedMetrics.length,
    }
  );
}

