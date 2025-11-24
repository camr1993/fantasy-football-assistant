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
