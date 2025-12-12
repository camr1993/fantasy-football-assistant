/**
 * Constants and configuration for league calculations
 */

// Configuration for recent statistics calculation
export const RECENT_WEEKS = 3; // Number of recent weeks to include in mean/std calculations

// Weighted scoring configuration for WRs
export const WR_WEIGHTS = {
  recent_mean: 0.5, // big driver: production (z-score)
  volatility: -0.04, // small penalty (z-score, clip ±2)
  targets_per_game: 0.28, // volume still very important (min-max)
  yards_per_target: 0.12, // explosiveness (min-max)
  catch_rate: 0.06, // efficiency (min-max)
  opponent_difficulty: 0.08, // matchup (min-max)
} as const;

// Weighted scoring configuration for RBs
export const RB_WEIGHTS = {
  recent_mean: 0.3, // baseline production (z-score)
  volatility: -0.04, // smaller penalty (z-score, clip ±2)
  weighted_opportunity: 0.36, // workload (rushes + target value) — increased
  touchdown_production: 0.18, // TD upside important for RBs
  receiving_profile: 0.08, // receiving work (receptions + yards)
  efficiency: 0.06, // YPC / YPT efficiency
  opponent_difficulty: 0.06, // matchup vs run defense
} as const;

// Weighted scoring configuration for TEs
export const TE_WEIGHTS = {
  recent_mean: 0.36, // production (z-score)
  volatility: -0.08, // TE usage can be spotty — keep stronger penalty but clip ±2
  targets_per_game: 0.3, // target share matters a lot
  receiving_touchdowns: 0.2, // TE TD upside is meaningful
  yards_per_target: 0.12, // efficiency / matchup help
  opponent_difficulty: 0.1, // matchup importance
} as const;

// Weighted scoring configuration for QBs
export const QB_WEIGHTS = {
  recent_mean: 0.5, // baseline production (z-score)
  volatility: -0.05, // modest penalty (z-score, clip ±2)
  passing_efficiency: 0.45, // heavier: TD rate & yards/att are key
  turnovers: -0.15, // big negative for INTs/fumbles
  rushing_upside: 0.15, // dual-threat value still useful
  opponent_difficulty: 0.1, // matchup vs pass defense
} as const;

// Weighted scoring configuration for Ks
export const K_WEIGHTS = {
  recent_mean: 0.65, // overall production (z-score)
  volatility: -0.1, // keep stronger penalty (clip ±2)
  fg_profile: 0.4, // attempts & distance profile
  fg_pat_misses: -0.1, // misses are negative signal
  fg_attempts: 0.15, // team opportunity
  opponent_difficulty: 0.1, // weather / defense / stadium
} as const;

// Weighted scoring configuration for DEFs
export const DEF_WEIGHTS = {
  recent_mean: 0.3, // baseline (z-score)
  volatility: -0.04, // small penalty (z-score, clip ±2)
  sacks_per_game: 0.28, // strong stable predictor
  turnovers_forced: 0.26, // game-changing plays
  dst_tds: 0.1, // TD ceilings matter
  points_allowed: -0.1, // negative is better being low
  yards_allowed: -0.07, // negative is better being low
  blocked_kicks: 0.03, // small bonus
  safeties: 0.02, // rare but valuable
  opponent_difficulty: 0.22, // opponent offense matters a lot
} as const;

// Position-specific weight configurations
export const POSITION_WEIGHTS = {
  WR: WR_WEIGHTS,
  RB: RB_WEIGHTS,
  TE: TE_WEIGHTS,
  QB: QB_WEIGHTS,
  K: K_WEIGHTS,
  DEF: DEF_WEIGHTS,
} as const;
