import type {
  TEEfficiencyMetricsInput,
  TEEfficiencyMetricsResult,
} from '../../types.ts';

/**
 * Calculate TE efficiency metrics from raw player stats
 * These are league-agnostic metrics
 */
export function calculateTEEfficiencyMetrics(
  input: TEEfficiencyMetricsInput
): TEEfficiencyMetricsResult {
  const { targets = 0, receivingYards = 0, receivingTouchdowns = 0 } = input;

  // Calculate efficiency metrics
  // targets_per_game: always set (0 if no targets)
  // yards_per_target: null if no targets (can't calculate), otherwise calculated
  // receiving_touchdowns: always set (raw value)
  const targetsPerGame = targets;
  const yardsPerTarget = targets > 0 ? receivingYards / targets : null;
  const receivingTouchdownsValue = receivingTouchdowns;

  return {
    targets_per_game: Math.round(targetsPerGame * 100) / 100,
    yards_per_target:
      yardsPerTarget !== null ? Math.round(yardsPerTarget * 100) / 100 : null,
    receiving_touchdowns: Math.round(receivingTouchdownsValue * 100) / 100,
  };
}

