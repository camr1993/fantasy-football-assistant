-- Add DEF efficiency metrics columns to player_stats table
-- These are league-agnostic metrics calculated from raw stats

ALTER TABLE player_stats
ADD COLUMN IF NOT EXISTS sacks_per_game NUMERIC,
ADD COLUMN IF NOT EXISTS turnovers_forced NUMERIC,
ADD COLUMN IF NOT EXISTS dst_tds NUMERIC,
ADD COLUMN IF NOT EXISTS yards_allowed NUMERIC,
ADD COLUMN IF NOT EXISTS sacks_per_game_3wk_avg NUMERIC,
ADD COLUMN IF NOT EXISTS turnovers_forced_3wk_avg NUMERIC,
ADD COLUMN IF NOT EXISTS dst_tds_3wk_avg NUMERIC,
ADD COLUMN IF NOT EXISTS points_allowed_3wk_avg NUMERIC,
ADD COLUMN IF NOT EXISTS yards_allowed_3wk_avg NUMERIC,
ADD COLUMN IF NOT EXISTS blocked_kicks_3wk_avg NUMERIC,
ADD COLUMN IF NOT EXISTS safeties_3wk_avg NUMERIC,
ADD COLUMN IF NOT EXISTS sacks_per_game_3wk_avg_norm NUMERIC,
ADD COLUMN IF NOT EXISTS turnovers_forced_3wk_avg_norm NUMERIC,
ADD COLUMN IF NOT EXISTS dst_tds_3wk_avg_norm NUMERIC,
ADD COLUMN IF NOT EXISTS points_allowed_3wk_avg_norm NUMERIC,
ADD COLUMN IF NOT EXISTS yards_allowed_3wk_avg_norm NUMERIC,
ADD COLUMN IF NOT EXISTS blocked_kicks_3wk_avg_norm NUMERIC,
ADD COLUMN IF NOT EXISTS safeties_3wk_avg_norm NUMERIC;

-- Add comments for documentation
COMMENT ON COLUMN player_stats.sacks_per_game IS 'Sacks per game for this week (calculated from sacks stat)';
COMMENT ON COLUMN player_stats.turnovers_forced IS 'Turnovers forced: defensive_int + fumble_recoveries';
COMMENT ON COLUMN player_stats.dst_tds IS 'DST TDs: defensive_touchdowns + defense_return_touchdowns';
COMMENT ON COLUMN player_stats.yards_allowed IS 'Total yards allowed (from total_yards_given_up stat)';
COMMENT ON COLUMN player_stats.sacks_per_game_3wk_avg IS '3-week rolling average of sacks per game';
COMMENT ON COLUMN player_stats.turnovers_forced_3wk_avg IS '3-week rolling average of turnovers forced';
COMMENT ON COLUMN player_stats.dst_tds_3wk_avg IS '3-week rolling average of DST TDs';
COMMENT ON COLUMN player_stats.points_allowed_3wk_avg IS '3-week rolling average of points allowed';
COMMENT ON COLUMN player_stats.yards_allowed_3wk_avg IS '3-week rolling average of yards allowed';
COMMENT ON COLUMN player_stats.blocked_kicks_3wk_avg IS '3-week rolling average of blocked kicks';
COMMENT ON COLUMN player_stats.safeties_3wk_avg IS '3-week rolling average of safeties';
COMMENT ON COLUMN player_stats.sacks_per_game_3wk_avg_norm IS 'Globally normalized 3-week rolling average of sacks per game (0-1 scale, normalized across all DEFs)';
COMMENT ON COLUMN player_stats.turnovers_forced_3wk_avg_norm IS 'Globally normalized 3-week rolling average of turnovers forced (0-1 scale, normalized across all DEFs)';
COMMENT ON COLUMN player_stats.dst_tds_3wk_avg_norm IS 'Globally normalized 3-week rolling average of DST TDs (0-1 scale, normalized across all DEFs)';
COMMENT ON COLUMN player_stats.points_allowed_3wk_avg_norm IS 'Globally normalized 3-week rolling average of points allowed (0-1 scale, normalized across all DEFs)';
COMMENT ON COLUMN player_stats.yards_allowed_3wk_avg_norm IS 'Globally normalized 3-week rolling average of yards allowed (0-1 scale, normalized across all DEFs)';
COMMENT ON COLUMN player_stats.blocked_kicks_3wk_avg_norm IS 'Globally normalized 3-week rolling average of blocked kicks (0-1 scale, normalized across all DEFs)';
COMMENT ON COLUMN player_stats.safeties_3wk_avg_norm IS 'Globally normalized 3-week rolling average of safeties (0-1 scale, normalized across all DEFs)';

