// Tips Response Types

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
}

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
  injury_status?: string;
}

export interface UserTeamInfo {
  team_id: string;
  team_name: string;
  league_id: string;
  yahoo_league_id: string;
  league_name: string;
  roster_url: string;
}

export interface TipsResponse {
  waiver_wire: Record<string, WaiverWirePlayer[]>;
  waiver_wire_recommendations: WaiverWireRecommendation[];
  start_bench_recommendations: StartBenchRecommendation[];
  user_teams: UserTeamInfo[];
  current_week: number;
  next_week: number;
  season_year: number;
}

// Player recommendations indexed by Yahoo player ID (the numeric part)
export interface PlayerRecommendations {
  startBench?: StartBenchRecommendation;
  waiverUpgrades?: WaiverWireRecommendation[];
}

export type PlayerRecommendationsMap = Record<string, PlayerRecommendations>;
