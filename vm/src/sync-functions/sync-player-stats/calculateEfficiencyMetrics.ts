import type {
  WREfficiencyMetricsInput,
  WREfficiencyMetricsResult,
  RBEfficiencyMetricsInput,
  RBEfficiencyMetricsResult,
} from './types.ts';

/**
 * Calculate efficiency metrics from raw player stats
 * These are league-agnostic metrics
 */
export function calculateWREfficiencyMetrics(
  input: WREfficiencyMetricsInput
): WREfficiencyMetricsResult {
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
    catch_rate: catchRate !== null ? Math.round(catchRate * 1000) / 1000 : null,
    yards_per_target:
      yardsPerTarget !== null ? Math.round(yardsPerTarget * 100) / 100 : null,
  };
}

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

  // Efficiency: yards per carry (guard divide-by-zero)
  const yardsPerCarry =
    rushingAttempts > 0 ? rushingYards / rushingAttempts : null;

  // Efficiency: yards per target (guard divide-by-zero)
  const yardsPerTargetRb = targets > 0 ? receivingYards / targets : null;

  return {
    weighted_opportunity: Math.round(weightedOpportunity * 100) / 100,
    touchdown_production: Math.round(touchdownProduction * 100) / 100,
    receiving_profile: Math.round(receivingProfile * 100) / 100,
    yards_per_carry:
      yardsPerCarry !== null ? Math.round(yardsPerCarry * 100) / 100 : null,
    yards_per_target_rb:
      yardsPerTargetRb !== null
        ? Math.round(yardsPerTargetRb * 100) / 100
        : null,
  };
}
