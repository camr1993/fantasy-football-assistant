export interface WaiverWirePlayer {
  position: string;
  player_id: string;
  name: string;
  team: string;
  yahoo_player_id: string;
  weighted_score: number;
  league_id: string;
  league_name: string;
}

export interface RecommendationConfidence {
  level: 1 | 2 | 3;
  label: string;
}

export interface WaiverWireRecommendation {
  waiver_player_id: string;
  waiver_yahoo_player_id: string;
  waiver_player_name: string;
  waiver_player_team: string;
  waiver_player_position: string;
  waiver_weighted_score: number;
  waiver_injury_status?: string;
  rostered_player_id: string;
  rostered_yahoo_player_id: string;
  rostered_player_name: string;
  rostered_player_team: string;
  rostered_weighted_score: number;
  rostered_injury_status?: string;
  league_id: string;
  league_name: string;
  team_id: string;
  team_name: string;
  recommendation: 'ADD';
  reason: string;
  confidence: RecommendationConfidence;
}

export interface RosteredPlayer {
  player_id: string;
}

export interface InjuredPlayer {
  player_id: string;
}

export interface ByePlayer {
  id: string;
}

export interface LeagueCalcWithPlayer {
  player_id: string;
  weighted_score: number;
  players: {
    id: string;
    name: string;
    position: string;
    team: string;
    yahoo_player_id: string;
  };
}

export interface WaiverWireRpcResult {
  position: string;
  player_id: string;
  name: string;
  team: string;
  yahoo_player_id: string;
  weighted_score: number;
  rank: number;
}

export interface RosterEntryWithPlayer {
  player_id: string;
  slot: string;
  players: {
    id: string;
    name: string;
    position: string;
    team: string;
    yahoo_player_id: string;
  } | null;
  teams: {
    id: string;
    name: string;
  } | null;
}

export interface LeagueCalcScore {
  player_id: string;
  weighted_score: number;
  fantasy_points: number;
  recent_mean: number | null;
  recent_std: number | null;
}

export interface NormalizedStats {
  player_id: string;
  recent_mean_norm: number | null;
  recent_std_norm: number | null;
  // QB
  passing_efficiency_3wk_avg_norm: number | null;
  turnovers_3wk_avg_norm: number | null;
  rushing_upside_3wk_avg_norm: number | null;
  // WR/TE
  targets_per_game_3wk_avg_norm: number | null;
  catch_rate_3wk_avg_norm: number | null;
  yards_per_target_3wk_avg_norm: number | null;
  // RB
  weighted_opportunity_3wk_avg_norm: number | null;
  touchdown_production_3wk_avg_norm: number | null;
  receiving_profile_3wk_avg_norm: number | null;
  yards_per_touch_3wk_avg_norm: number | null;
  // TE
  receiving_touchdowns_3wk_avg_norm: number | null;
  // K
  fg_profile_3wk_avg_norm: number | null;
  fg_pat_misses_3wk_avg_norm: number | null;
  fg_attempts_3wk_avg_norm: number | null;
  // DEF
  sacks_per_game_3wk_avg_norm: number | null;
  turnovers_forced_3wk_avg_norm: number | null;
  dst_tds_3wk_avg_norm: number | null;
  points_allowed_3wk_avg_norm: number | null;
  yards_allowed_3wk_avg_norm: number | null;
  block_kicks_3wk_avg_norm: number | null;
  safeties_3wk_avg_norm: number | null;
}

export interface RosteredPlayerWithScore {
  player_id: string;
  yahoo_player_id: string;
  name: string;
  position: string;
  team: string;
  slot: string;
  weighted_score: number | null;
  fantasy_points: number | null;
  recent_mean: number | null;
  recent_std: number | null;
  team_id: string;
  team_name: string;
  normalizedStats?: NormalizedStats;
}

export interface WaiverPlayerWithStats extends WaiverWirePlayer {
  normalizedStats?: NormalizedStats;
}

