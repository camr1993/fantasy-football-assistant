import type {
  EfficiencyMetricsInput,
  EfficiencyMetricsResult,
} from './types.ts';

/**
 * Calculate efficiency metrics from raw player stats
 * These are league-agnostic metrics
 */
export function calculateEfficiencyMetrics(
  input: EfficiencyMetricsInput
): EfficiencyMetricsResult {
  const { receptions = 0, targets = 0, receivingYards = 0 } = input;

  // Calculate efficiency metrics
  // targets_per_game: always set (0 if no targets)
  // catch_rate: null if no targets (can't calculate), otherwise calculated
  // yards_per_target: null if no targets (can't calculate), otherwise calculated
  const targetsPerGame = targets;
  const catchRate = targets > 0 ? receptions / targets : null;
  const yardsPerTarget = targets > 0 ? receivingYards / targets : null;

  return {
    targets_per_game: Math.round(targetsPerGame * 100) / 100,
    catch_rate:
      catchRate !== null ? Math.round(catchRate * 1000) / 1000 : null,
    yards_per_target:
      yardsPerTarget !== null ? Math.round(yardsPerTarget * 100) / 100 : null,
  };
}

