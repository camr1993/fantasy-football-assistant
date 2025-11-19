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
