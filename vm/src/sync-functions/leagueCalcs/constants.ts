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

// Weighted scoring configuration for RBs
export const RB_WEIGHTS = {
  recent_mean: 0.3, // w_1: Recent mean fantasy points
  volatility: -0.07, // w_2: Volatility (negative)
  weighted_opportunity: 0.3, // w_3: Weighted Opportunity (carries + targets)
  touchdown_production: 0.16, // w_4: Touchdown production (rush_tds + rec_tds)
  receiving_profile: 0.1, // w_5: Receiving profile (receptions + receiving_yards)
  efficiency: 0.06, // w_6: Efficiency (yards per carry / yards per target)
  opponent_difficulty: 0.05, // w_7: Matchup / opponent rush defense metric
} as const;

// Position-specific weight configurations
export const POSITION_WEIGHTS = {
  WR: WR_WEIGHTS,
  RB: RB_WEIGHTS,
  // TODO: Add other positions as needed
  // QB: QB_WEIGHTS,
  // TE: TE_WEIGHTS,
  // K: K_WEIGHTS,
} as const;
