import type {
  KEfficiencyMetricsInput,
  KEfficiencyMetricsResult,
} from '../../types.ts';

/**
 * Calculate K efficiency metrics from raw player stats
 * These are league-agnostic metrics for kickers
 */
export function calculateKEfficiencyMetrics(
  input: KEfficiencyMetricsInput
): KEfficiencyMetricsResult {
  const {
    fgMade0_19 = 0,
    fgMade20_29 = 0,
    fgMade30_39 = 0,
    fgMade40_49 = 0,
    fgMade50Plus = 0,
    fgMissed0_19 = 0,
    fgMissed20_29 = 0,
    fgMissed30_39 = 0,
    fgMissed40_49 = 0,
    fgMissed50Plus = 0,
    patMissed = 0,
  } = input;

  // FG profile: D = 3(FG50+) + 2(FG40-49) + 1(FG0-39)
  // FG0-39 includes 0-19, 20-29, and 30-39
  const fgProfile =
    3 * fgMade50Plus +
    2 * fgMade40_49 +
    1 * (fgMade0_19 + fgMade20_29 + fgMade30_39);

  // FG/PAT misses penalty: total misses
  const fgPatMisses =
    fgMissed0_19 +
    fgMissed20_29 +
    fgMissed30_39 +
    fgMissed40_49 +
    fgMissed50Plus +
    patMissed;

  // Team offensive opportunity: total FG attempts
  // Includes all made and missed FGs
  const fgAttempts =
    fgMade0_19 +
    fgMade20_29 +
    fgMade30_39 +
    fgMade40_49 +
    fgMade50Plus +
    fgMissed0_19 +
    fgMissed20_29 +
    fgMissed30_39 +
    fgMissed40_49 +
    fgMissed50Plus;

  return {
    fg_profile: Math.round(fgProfile * 100) / 100,
    fg_pat_misses: Math.round(fgPatMisses * 100) / 100,
    fg_attempts: Math.round(fgAttempts * 100) / 100,
  };
}
