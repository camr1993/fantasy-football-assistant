import type {
  QBEfficiencyMetricsInput,
  QBEfficiencyMetricsResult,
} from '../../types.ts';

/**
 * Calculate QB efficiency metrics from raw player stats
 * These are league-agnostic metrics
 */
export function calculateQBEfficiencyMetrics(
  input: QBEfficiencyMetricsInput
): QBEfficiencyMetricsResult {
  const {
    passingTouchdowns = 0,
    passingYards = 0,
    passesAttempted = 0,
    interceptions = 0,
    fumblesLost = 0,
    rushingYards = 0,
    rushingTouchdowns = 0,
  } = input;

  // Passing efficiency: passing_touchdowns + (passing_yards / passes_attempted)
  // Guard divide-by-zero
  const passingEfficiency =
    passesAttempted > 0
      ? passingTouchdowns + passingYards / passesAttempted
      : null;

  // Turnovers: interceptions + fumbles_lost
  const turnovers = interceptions + fumblesLost;

  // Rushing upside: rushing_yards + (6 × rushing_touchdowns)
  const rushingUpside = rushingYards + 6 * rushingTouchdowns;

  return {
    passing_efficiency:
      passingEfficiency !== null
        ? Math.round(passingEfficiency * 100) / 100
        : null,
    turnovers: Math.round(turnovers * 100) / 100,
    rushing_upside: Math.round(rushingUpside * 100) / 100,
  };
}
