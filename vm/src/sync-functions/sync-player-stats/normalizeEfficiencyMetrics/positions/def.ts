import { logger } from '../../../../../../supabase/functions/utils/logger.ts';
import { supabase } from '../../../../../../supabase/functions/utils/supabase.ts';

/**
 * Normalize efficiency metrics globally across all DEFs
 * Uses min-max scaling: (x - min) / (max - min)
 * This is league-agnostic - all DEFs are normalized together
 */
export async function normalizeDEFEfficiencyMetricsGlobally(
  seasonYear: number,
  week: number
): Promise<void> {
  logger.info('Normalizing efficiency metrics globally for all DEFs', {
    seasonYear,
    week,
  });

  // Get all DEF players with 3-week averages for this week
  const defMetrics: any[] = [];
  let from = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: pageData, error } = await supabase
      .from('player_stats')
      .select(
        `
        player_id,
        sacks_per_game_3wk_avg,
        turnovers_forced_3wk_avg,
        dst_tds_3wk_avg,
        points_allowed_3wk_avg,
        yards_allowed_3wk_avg,
        block_kicks_3wk_avg,
        safeties_3wk_avg,
        players!inner!player_stats_player_id_fkey(position)
      `
      )
      .eq('season_year', seasonYear)
      .eq('week', week)
      .eq('source', 'actual')
      .eq('players.position', 'DEF')
      .range(from, from + pageSize - 1);

    if (error) {
      logger.error('Failed to fetch DEF efficiency metrics for normalization', {
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

    defMetrics.push(...pageData);

    if (pageData.length < pageSize) {
      hasMore = false;
    } else {
      from += pageSize;
    }
  }

  if (!defMetrics || defMetrics.length === 0) {
    logger.warn(
      'No DEF players with efficiency metrics found for normalization',
      {
        seasonYear,
        week,
      }
    );
    return;
  }

  // Extract values for min/max calculation
  const sacksPerGameValues = defMetrics
    .map((m: any) => m.sacks_per_game_3wk_avg)
    .filter((v: any) => v !== null && v !== undefined);

  const turnoversForcedValues = defMetrics
    .map((m: any) => m.turnovers_forced_3wk_avg)
    .filter((v: any) => v !== null && v !== undefined);

  const dstTdsValues = defMetrics
    .map((m: any) => m.dst_tds_3wk_avg)
    .filter((v: any) => v !== null && v !== undefined);

  const pointsAllowedValues = defMetrics
    .map((m: any) => m.points_allowed_3wk_avg)
    .filter((v: any) => v !== null && v !== undefined);

  const yardsAllowedValues = defMetrics
    .map((m: any) => m.yards_allowed_3wk_avg)
    .filter((v: any) => v !== null && v !== undefined);

  const blockedKicksValues = defMetrics
    .map((m: any) => m.block_kicks_3wk_avg)
    .filter((v: any) => v !== null && v !== undefined);

  const safetiesValues = defMetrics
    .map((m: any) => m.safeties_3wk_avg)
    .filter((v: any) => v !== null && v !== undefined);

  // Check if we have any data to normalize
  if (
    sacksPerGameValues.length === 0 &&
    turnoversForcedValues.length === 0 &&
    dstTdsValues.length === 0 &&
    pointsAllowedValues.length === 0 &&
    yardsAllowedValues.length === 0 &&
    blockedKicksValues.length === 0 &&
    safetiesValues.length === 0
  ) {
    logger.warn('Insufficient data for DEF normalization', {
      seasonYear,
      week,
      sacksPerGameCount: sacksPerGameValues.length,
      turnoversForcedCount: turnoversForcedValues.length,
      dstTdsCount: dstTdsValues.length,
      pointsAllowedCount: pointsAllowedValues.length,
      yardsAllowedCount: yardsAllowedValues.length,
      blockedKicksCount: blockedKicksValues.length,
      safetiesCount: safetiesValues.length,
    });
    return;
  }

  // Calculate min and max for each metric globally
  const sacksPerGameMin =
    sacksPerGameValues.length > 0 ? Math.min(...sacksPerGameValues) : null;
  const sacksPerGameMax =
    sacksPerGameValues.length > 0 ? Math.max(...sacksPerGameValues) : null;
  const sacksPerGameRange =
    sacksPerGameMin !== null && sacksPerGameMax !== null
      ? sacksPerGameMax - sacksPerGameMin
      : 0;

  const turnoversForcedMin =
    turnoversForcedValues.length > 0
      ? Math.min(...turnoversForcedValues)
      : null;
  const turnoversForcedMax =
    turnoversForcedValues.length > 0
      ? Math.max(...turnoversForcedValues)
      : null;
  const turnoversForcedRange =
    turnoversForcedMin !== null && turnoversForcedMax !== null
      ? turnoversForcedMax - turnoversForcedMin
      : 0;

  const dstTdsMin = dstTdsValues.length > 0 ? Math.min(...dstTdsValues) : null;
  const dstTdsMax = dstTdsValues.length > 0 ? Math.max(...dstTdsValues) : null;
  const dstTdsRange =
    dstTdsMin !== null && dstTdsMax !== null ? dstTdsMax - dstTdsMin : 0;

  const pointsAllowedMin =
    pointsAllowedValues.length > 0 ? Math.min(...pointsAllowedValues) : null;
  const pointsAllowedMax =
    pointsAllowedValues.length > 0 ? Math.max(...pointsAllowedValues) : null;
  const pointsAllowedRange =
    pointsAllowedMin !== null && pointsAllowedMax !== null
      ? pointsAllowedMax - pointsAllowedMin
      : 0;

  const yardsAllowedMin =
    yardsAllowedValues.length > 0 ? Math.min(...yardsAllowedValues) : null;
  const yardsAllowedMax =
    yardsAllowedValues.length > 0 ? Math.max(...yardsAllowedValues) : null;
  const yardsAllowedRange =
    yardsAllowedMin !== null && yardsAllowedMax !== null
      ? yardsAllowedMax - yardsAllowedMin
      : 0;

  const blockedKicksMin =
    blockedKicksValues.length > 0 ? Math.min(...blockedKicksValues) : null;
  const blockedKicksMax =
    blockedKicksValues.length > 0 ? Math.max(...blockedKicksValues) : null;
  const blockedKicksRange =
    blockedKicksMin !== null && blockedKicksMax !== null
      ? blockedKicksMax - blockedKicksMin
      : 0;

  const safetiesMin =
    safetiesValues.length > 0 ? Math.min(...safetiesValues) : null;
  const safetiesMax =
    safetiesValues.length > 0 ? Math.max(...safetiesValues) : null;
  const safetiesRange =
    safetiesMin !== null && safetiesMax !== null
      ? safetiesMax - safetiesMin
      : 0;

  logger.info('Calculated global min/max for DEF efficiency metrics', {
    seasonYear,
    week,
    sacksPerGame: { min: sacksPerGameMin, max: sacksPerGameMax },
    turnoversForced: { min: turnoversForcedMin, max: turnoversForcedMax },
    dstTds: { min: dstTdsMin, max: dstTdsMax },
    pointsAllowed: { min: pointsAllowedMin, max: pointsAllowedMax },
    yardsAllowed: { min: yardsAllowedMin, max: yardsAllowedMax },
    blockedKicks: { min: blockedKicksMin, max: blockedKicksMax },
    safeties: { min: safetiesMin, max: safetiesMax },
  });

  // Normalize values using min-max scaling: (x - min) / (max - min)
  const normalizedMetrics = defMetrics.map((metric: any) => ({
    player_id: metric.player_id,
    sacks_per_game_3wk_avg_norm:
      metric.sacks_per_game_3wk_avg !== null &&
      sacksPerGameRange > 0 &&
      sacksPerGameMin !== null
        ? (metric.sacks_per_game_3wk_avg - sacksPerGameMin) / sacksPerGameRange
        : null,
    turnovers_forced_3wk_avg_norm:
      metric.turnovers_forced_3wk_avg !== null &&
      turnoversForcedRange > 0 &&
      turnoversForcedMin !== null
        ? (metric.turnovers_forced_3wk_avg - turnoversForcedMin) /
          turnoversForcedRange
        : null,
    dst_tds_3wk_avg_norm:
      metric.dst_tds_3wk_avg !== null && dstTdsRange > 0 && dstTdsMin !== null
        ? (metric.dst_tds_3wk_avg - dstTdsMin) / dstTdsRange
        : null,
    // For points_allowed and yards_allowed, invert normalization (lower is better)
    points_allowed_3wk_avg_norm:
      metric.points_allowed_3wk_avg !== null &&
      pointsAllowedRange > 0 &&
      pointsAllowedMin !== null
        ? (metric.points_allowed_3wk_avg - pointsAllowedMin) /
          pointsAllowedRange
        : null,
    yards_allowed_3wk_avg_norm:
      metric.yards_allowed_3wk_avg !== null &&
      yardsAllowedRange > 0 &&
      yardsAllowedMin !== null
        ? (metric.yards_allowed_3wk_avg - yardsAllowedMin) / yardsAllowedRange
        : null,
    block_kicks_3wk_avg_norm:
      metric.block_kicks_3wk_avg !== null &&
      blockedKicksRange > 0 &&
      blockedKicksMin !== null
        ? (metric.block_kicks_3wk_avg - blockedKicksMin) / blockedKicksRange
        : null,
    safeties_3wk_avg_norm:
      metric.safeties_3wk_avg !== null &&
      safetiesRange > 0 &&
      safetiesMin !== null
        ? (metric.safeties_3wk_avg - safetiesMin) / safetiesRange
        : null,
  }));

  // Update all DEF records with normalized values
  const batchSize = 100;
  for (let i = 0; i < normalizedMetrics.length; i += batchSize) {
    const batch = normalizedMetrics.slice(i, i + batchSize);

    for (const normalizedMetric of batch) {
      const updateData: Record<string, number | null> = {
        sacks_per_game_3wk_avg_norm:
          normalizedMetric.sacks_per_game_3wk_avg_norm !== null
            ? Math.round(normalizedMetric.sacks_per_game_3wk_avg_norm * 1000) /
              1000
            : null,
        turnovers_forced_3wk_avg_norm:
          normalizedMetric.turnovers_forced_3wk_avg_norm !== null
            ? Math.round(
                normalizedMetric.turnovers_forced_3wk_avg_norm * 1000
              ) / 1000
            : null,
        dst_tds_3wk_avg_norm:
          normalizedMetric.dst_tds_3wk_avg_norm !== null
            ? Math.round(normalizedMetric.dst_tds_3wk_avg_norm * 1000) / 1000
            : null,
        points_allowed_3wk_avg_norm:
          normalizedMetric.points_allowed_3wk_avg_norm !== null
            ? Math.round(normalizedMetric.points_allowed_3wk_avg_norm * 1000) /
              1000
            : null,
        yards_allowed_3wk_avg_norm:
          normalizedMetric.yards_allowed_3wk_avg_norm !== null
            ? Math.round(normalizedMetric.yards_allowed_3wk_avg_norm * 1000) /
              1000
            : null,
        block_kicks_3wk_avg_norm:
          normalizedMetric.block_kicks_3wk_avg_norm !== null
            ? Math.round(normalizedMetric.block_kicks_3wk_avg_norm * 1000) /
              1000
            : null,
        safeties_3wk_avg_norm:
          normalizedMetric.safeties_3wk_avg_norm !== null
            ? Math.round(normalizedMetric.safeties_3wk_avg_norm * 1000) / 1000
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
        logger.error('Failed to update normalized DEF efficiency metrics', {
          error: updateError,
          playerId: normalizedMetric.player_id,
          seasonYear,
          week,
        });
      }
    }
  }

  logger.info(
    'Successfully normalized efficiency metrics globally for all DEFs',
    {
      seasonYear,
      week,
      playersUpdated: normalizedMetrics.length,
    }
  );
}
