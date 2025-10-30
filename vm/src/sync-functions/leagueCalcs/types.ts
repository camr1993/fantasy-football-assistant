/**
 * Type definitions for league calculations module
 */

export interface EfficiencyMetrics {
  targets_per_game: number;
  catch_rate: number;
  yards_per_target: number;
}

export interface EfficiencyMetrics3WeekAvg {
  targets_per_game_3wk_avg: number | null;
  catch_rate_3wk_avg: number | null;
  yards_per_target_3wk_avg: number | null;
}

export interface EfficiencyMetrics3WeekAvgNorm {
  targets_per_game_3wk_avg_norm: number | null;
  catch_rate_3wk_avg_norm: number | null;
  yards_per_target_3wk_avg_norm: number | null;
}

export interface RecentStats {
  recent_mean: number | null;
  recent_std: number | null;
}

export interface WeightedScoreResult {
  weighted_score: number | null;
  recent_mean: number | null;
  recent_std: number | null;
  targets_per_game_3wk_avg_norm: number | null;
  catch_rate_3wk_avg_norm: number | null;
  yards_per_target_3wk_avg_norm: number | null;
}

export interface PositionWeights {
  recent_mean: number;
  volatility: number;
  targets_per_game: number;
  catch_rate: number;
  yards_per_target: number;
  opponent_difficulty: number;
}

export interface LeagueCalcsResult {
  success: boolean;
  message: string;
  league_id?: string;
  season_year?: number;
  week?: number;
  updated_count?: number;
}
