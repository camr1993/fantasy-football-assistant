/**
 * Constants and configuration for league calculations
 */

// Configuration for recent statistics calculation
export const RECENT_WEEKS = 3; // Number of recent weeks to include in mean/std calculations

// Weighted scoring configuration for WRs
export const WR_WEIGHTS = {
  recent_mean: 0.35, // w_1: Performance baseline
  volatility: -0.1, // w_2: Penalize inconsistency (negative weight)
  targets_per_game: 0.25, // w_3: Opportunity driver
  catch_rate: 0.1, // w_4: Efficiency
  yards_per_target: 0.15, // w_5: Explosiveness
  opponent_difficulty: 0.05, // w_6: Context
} as const;

// Position-specific weight configurations
export const POSITION_WEIGHTS = {
  WR: WR_WEIGHTS,
  // TODO: Add other positions as needed
  // RB: RB_WEIGHTS,
  // QB: QB_WEIGHTS,
  // TE: TE_WEIGHTS,
  // K: K_WEIGHTS,
} as const;
