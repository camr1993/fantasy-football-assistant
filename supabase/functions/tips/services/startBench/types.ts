export interface StartBenchRecommendation {
  player_id: string;
  yahoo_player_id: string;
  name: string;
  position: string;
  team: string;
  slot: string;
  weighted_score: number;
  league_id: string;
  league_name: string;
  team_id: string;
  team_name: string;
  recommendation: 'START' | 'BENCH';
  reason: string;
}

export interface RosterEntryResponse {
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
    league_id: string;
  } | null;
}

export interface RosterScore {
  player_id: string;
  weighted_score: number;
  fantasy_points: number;
  recent_mean: number | null;
  recent_std: number | null;
}

export interface PlayerStatsData {
  player_id: string;
  // Passing
  passing_yards: number;
  passing_touchdowns: number;
  interceptions: number;
  // Rushing
  rushing_yards: number;
  rushing_attempts: number;
  rushing_touchdowns: number;
  // Receiving
  receptions: number;
  receiving_yards: number;
  receiving_touchdowns: number;
  targets: number;
  // Efficiency metrics (3-week averages)
  targets_per_game_3wk_avg: number | null;
  catch_rate_3wk_avg: number | null;
  yards_per_target_3wk_avg: number | null;
  yards_per_touch_3wk_avg: number | null;
  passing_efficiency_3wk_avg: number | null;
  turnovers_3wk_avg: number | null;
  rushing_upside_3wk_avg: number | null;
}

export interface NormalizedStatsData {
  player_id: string;
  // From league_calcs
  recent_mean_norm: number | null;
  recent_std_norm: number | null;
  // QB normalized
  passing_efficiency_3wk_avg_norm: number | null;
  turnovers_3wk_avg_norm: number | null;
  rushing_upside_3wk_avg_norm: number | null;
  // WR/TE normalized
  targets_per_game_3wk_avg_norm: number | null;
  catch_rate_3wk_avg_norm: number | null;
  yards_per_target_3wk_avg_norm: number | null;
  // RB normalized
  weighted_opportunity_3wk_avg_norm: number | null;
  touchdown_production_3wk_avg_norm: number | null;
  receiving_profile_3wk_avg_norm: number | null;
  yards_per_touch_3wk_avg_norm: number | null;
  // TE normalized
  receiving_touchdowns_3wk_avg_norm: number | null;
  // K normalized
  fg_profile_3wk_avg_norm: number | null;
  fg_pat_misses_3wk_avg_norm: number | null;
  fg_attempts_3wk_avg_norm: number | null;
  // DEF normalized
  sacks_per_game_3wk_avg_norm: number | null;
  turnovers_forced_3wk_avg_norm: number | null;
  dst_tds_3wk_avg_norm: number | null;
  points_allowed_3wk_avg_norm: number | null;
  yards_allowed_3wk_avg_norm: number | null;
  block_kicks_3wk_avg_norm: number | null;
  safeties_3wk_avg_norm: number | null;
}

export interface PlayerGroup {
  player_id: string;
  yahoo_player_id: string;
  name: string;
  position: string;
  team: string;
  slot: string;
  weighted_score: number;
  fantasy_points: number;
  league_id: string;
  league_name: string;
  team_id: string;
  team_name: string;
  stats?: PlayerStatsData;
  normalizedStats?: NormalizedStatsData;
}
