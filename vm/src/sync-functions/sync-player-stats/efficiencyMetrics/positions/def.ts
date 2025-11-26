import type {
  DEFEfficiencyMetricsInput,
  DEFEfficiencyMetricsResult,
} from '../../types.ts';

/**
 * Calculate DEF efficiency metrics from raw player stats
 * These are league-agnostic metrics
 */
export function calculateDEFEfficiencyMetrics(
  input: DEFEfficiencyMetricsInput
): DEFEfficiencyMetricsResult {
  const {
    sacks = 0,
    defensiveInt = 0,
    fumbleRecoveries = 0,
    defensiveTouchdowns = 0,
    defenseReturnTouchdowns = 0,
    totalYardsGivenUp = 0,
    pointsAllowed = 0,
    blockKicks = 0,
    safeties = 0,
  } = input;

  // Sacks per game: sacks (already per game)
  const sacksPerGame = sacks;

  // Turnovers forced: defensive_int + fumble_recoveries
  const turnoversForced = defensiveInt + fumbleRecoveries;

  // DST TDs: defensive_touchdowns + defense_return_touchdowns
  const dstTds = defensiveTouchdowns + defenseReturnTouchdowns;

  // Yards allowed: total_yards_given_up
  const yardsAllowed = totalYardsGivenUp;

  return {
    sacks_per_game: Math.round(sacksPerGame * 100) / 100,
    turnovers_forced: Math.round(turnoversForced * 100) / 100,
    dst_tds: Math.round(dstTds * 100) / 100,
    yards_allowed: Math.round(yardsAllowed * 100) / 100,
    points_allowed: Math.round(pointsAllowed * 100) / 100,
    block_kicks: Math.round(blockKicks * 100) / 100,
    safeties: Math.round(safeties * 100) / 100,
  };
}
