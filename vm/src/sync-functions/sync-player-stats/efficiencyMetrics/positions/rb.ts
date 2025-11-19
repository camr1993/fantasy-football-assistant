import type {
  RBEfficiencyMetricsInput,
  RBEfficiencyMetricsResult,
} from '../../types.ts';

/**
 * Calculate RB efficiency metrics from raw player stats
 * These are league-agnostic metrics for running backs
 */
export function calculateRBEfficiencyMetrics(
  input: RBEfficiencyMetricsInput
): RBEfficiencyMetricsResult {
  const {
    rushingAttempts = 0,
    targets = 0,
    rushingTouchdowns = 0,
    receivingTouchdowns = 0,
    receptions = 0,
    receivingYards = 0,
    rushingYards = 0,
  } = input;

  // Weighted Opportunity: carries + targets (raw counts)
  const weightedOpportunity = rushingAttempts + targets;

  // Touchdown production: rush_tds + rec_tds
  const touchdownProduction = rushingTouchdowns + receivingTouchdowns;

  // Receiving profile: receptions + receiving_yards (PPR value)
  const receivingProfile = receptions + receivingYards;

  // Efficiency: yards per touch = (rushing_yards + receiving_yards) / (rushing_attempts + targets)
  // Guard divide-by-zero
  const totalTouches = rushingAttempts + targets;
  const yardsPerTouch =
    totalTouches > 0 ? (rushingYards + receivingYards) / totalTouches : null;

  return {
    weighted_opportunity: Math.round(weightedOpportunity * 100) / 100,
    touchdown_production: Math.round(touchdownProduction * 100) / 100,
    receiving_profile: Math.round(receivingProfile * 100) / 100,
    yards_per_touch:
      yardsPerTouch !== null ? Math.round(yardsPerTouch * 100) / 100 : null,
  };
}

