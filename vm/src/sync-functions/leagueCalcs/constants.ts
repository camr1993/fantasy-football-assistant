/**
 * Constants and configuration for league calculations
 */

// Configuration for recent statistics calculation
export const RECENT_WEEKS = 3; // Number of recent weeks to include in mean/std calculations

export interface WeightConfig {
  weight: number;
  label: string;
}

// Weighted scoring configuration for WRs
export const WR_WEIGHTS = {
  recent_mean: { weight: 0.5, label: 'Recent Production' }, // big driver: production (z-score)
  volatility: { weight: -0.04, label: 'Consistency' }, // small penalty (z-score, clip ±2)
  targets_per_game: { weight: 0.28, label: 'Target Volume' }, // volume still very important (min-max)
  yards_per_target: { weight: 0.12, label: 'Yards per Target' }, // explosiveness (min-max)
  catch_rate: { weight: 0.06, label: 'Catch Rate' }, // efficiency (min-max)
  opponent_difficulty: { weight: 0.08, label: 'Matchup' }, // matchup (min-max)
} as const;

// Weighted scoring configuration for RBs
export const RB_WEIGHTS = {
  recent_mean: { weight: 0.3, label: 'Recent Production' }, // baseline production (z-score)
  volatility: { weight: -0.04, label: 'Consistency' }, // smaller penalty (z-score, clip ±2)
  weighted_opportunity: {
    weight: 0.36,
    label: 'Workload (rushing attempts + targets)',
  }, // workload (rushes + target value) — increased
  touchdown_production: {
    weight: 0.18,
    label: 'TD Production (rushing touchdowns + receiving touchdowns)',
  }, // TD upside important for RBs
  receiving_profile: {
    weight: 0.08,
    label: 'Receiving Work (receptions + receiving yards)',
  }, // receiving work (receptions + receiving yards)
  efficiency: { weight: 0.06, label: 'Efficiency' }, // YPC / YPT efficiency
  opponent_difficulty: { weight: 0.06, label: 'Matchup' }, // matchup vs run defense
} as const;

// Weighted scoring configuration for TEs
export const TE_WEIGHTS = {
  recent_mean: { weight: 0.36, label: 'Recent Production' }, // production (z-score)
  volatility: { weight: -0.08, label: 'Consistency' }, // TE usage can be spotty — keep stronger penalty but clip ±2
  targets_per_game: { weight: 0.3, label: 'Target Volume' }, // target share matters a lot
  receiving_touchdowns: { weight: 0.2, label: 'Receiving TDs' }, // TE TD upside is meaningful
  yards_per_target: { weight: 0.12, label: 'Yards per Target' }, // efficiency / matchup help
  opponent_difficulty: { weight: 0.1, label: 'Matchup' }, // matchup importance
} as const;

// Weighted scoring configuration for QBs
export const QB_WEIGHTS = {
  recent_mean: { weight: 0.5, label: 'Recent Production' }, // baseline production (z-score)
  volatility: { weight: -0.05, label: 'Consistency' }, // modest penalty (z-score, clip ±2)
  passing_efficiency: { weight: 0.45, label: 'Passing Efficiency' }, // heavier: TD rate & yards/att are key
  turnovers: { weight: -0.15, label: 'Turnover Avoidance' }, // big negative for INTs/fumbles
  rushing_upside: {
    weight: 0.15,
    label: 'Rushing Upside (rushing yards + 6 × rushing touchdowns)',
  }, // dual-threat value still useful
  opponent_difficulty: { weight: 0.1, label: 'Matchup' }, // matchup vs pass defense
} as const;

// Weighted scoring configuration for Ks
export const K_WEIGHTS = {
  recent_mean: { weight: 0.65, label: 'Recent Production' }, // overall production (z-score)
  volatility: { weight: -0.1, label: 'Consistency' }, // keep stronger penalty (clip ±2)
  fg_profile: {
    weight: 0.4,
    label: 'FG Profile (fgs weighted by distance)',
  }, // attempts & distance profile
  fg_pat_misses: { weight: -0.1, label: 'Accuracy' }, // misses are negative signal
  fg_attempts: { weight: 0.15, label: 'Opportunities' }, // team opportunity
  opponent_difficulty: { weight: 0.1, label: 'Matchup' }, // weather / defense / stadium
} as const;

// Weighted scoring configuration for DEFs
export const DEF_WEIGHTS = {
  recent_mean: { weight: 0.3, label: 'Recent Production' }, // baseline (z-score)
  volatility: { weight: -0.04, label: 'Consistency' }, // small penalty (z-score, clip ±2)
  sacks_per_game: { weight: 0.28, label: 'Sack Rate' }, // strong stable predictor
  turnovers_forced: { weight: 0.26, label: 'Takeaways' }, // game-changing plays
  dst_tds: { weight: 0.1, label: 'Defensive TDs' }, // TD ceilings matter
  points_allowed: { weight: -0.1, label: 'Points Allowed' }, // negative is better being low
  yards_allowed: { weight: -0.07, label: 'Yards Allowed' }, // negative is better being low
  blocked_kicks: { weight: 0.03, label: 'Blocked Kicks' }, // small bonus
  safeties: { weight: 0.02, label: 'Safeties' }, // rare but valuable
  opponent_difficulty: { weight: 0.22, label: 'Matchup' }, // opponent offense matters a lot
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

export type Position = keyof typeof POSITION_WEIGHTS;
