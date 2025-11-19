/**
 * Type definitions for league calculations module
 */

export interface RecentStats {
  recent_mean: number | null;
  recent_std: number | null;
}

export interface LeagueCalcsResult {
  success: boolean;
  message: string;
  league_id?: string;
  season_year?: number;
  week?: number;
  updated_count?: number;
}
