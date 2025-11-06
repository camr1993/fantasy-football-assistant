export interface PlayerStatsData {
  player?: Array<unknown>;
}

export interface EfficiencyMetricsInput {
  receptions: number;
  targets: number;
  receivingYards: number;
}

export interface EfficiencyMetricsResult {
  targets_per_game: number | null;
  catch_rate: number | null;
  yards_per_target: number | null;
}

