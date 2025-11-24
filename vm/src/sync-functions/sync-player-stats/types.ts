export interface PlayerStatsData {
  player?: Array<unknown>;
}

export interface WREfficiencyMetricsInput {
  receptions: number;
  targets: number;
  receivingYards: number;
}

export interface WREfficiencyMetricsResult {
  targets_per_game: number | null;
  catch_rate: number | null;
  yards_per_target: number | null;
}

export interface RBEfficiencyMetricsInput {
  rushingAttempts: number;
  targets: number;
  rushingTouchdowns: number;
  receivingTouchdowns: number;
  receptions: number;
  receivingYards: number;
  rushingYards: number;
}

export interface RBEfficiencyMetricsResult {
  weighted_opportunity: number | null;
  touchdown_production: number | null;
  receiving_profile: number | null;
  yards_per_touch: number | null;
}

export interface TEEfficiencyMetricsInput {
  targets: number;
  receivingYards: number;
  receivingTouchdowns: number;
}

export interface TEEfficiencyMetricsResult {
  targets_per_game: number | null;
  yards_per_target: number | null;
  receiving_touchdowns: number | null;
}

export interface QBEfficiencyMetricsInput {
  passingTouchdowns: number;
  passingYards: number;
  passesAttempted: number;
  interceptions: number;
  fumblesLost: number;
  rushingYards: number;
  rushingTouchdowns: number;
}

export interface QBEfficiencyMetricsResult {
  passing_efficiency: number | null;
  turnovers: number | null;
  rushing_upside: number | null;
}

export interface KEfficiencyMetricsInput {
  fgMade0_19: number;
  fgMade20_29: number;
  fgMade30_39: number;
  fgMade40_49: number;
  fgMade50Plus: number;
  fgMissed0_19: number;
  fgMissed20_29: number;
  fgMissed30_39: number;
  fgMissed40_49: number;
  fgMissed50Plus: number;
  patMissed: number;
}

export interface KEfficiencyMetricsResult {
  fg_profile: number | null;
  fg_pat_misses: number | null;
  fg_attempts: number | null;
}
