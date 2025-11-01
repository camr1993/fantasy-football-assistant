-- Add efficiency metrics columns to player_stats table
-- These are league-agnostic metrics calculated from raw stats

ALTER TABLE player_stats
ADD COLUMN IF NOT EXISTS targets_per_game NUMERIC,
ADD COLUMN IF NOT EXISTS catch_rate NUMERIC,
ADD COLUMN IF NOT EXISTS yards_per_target NUMERIC,
ADD COLUMN IF NOT EXISTS targets_per_game_3wk_avg NUMERIC,
ADD COLUMN IF NOT EXISTS catch_rate_3wk_avg NUMERIC,
ADD COLUMN IF NOT EXISTS yards_per_target_3wk_avg NUMERIC,
ADD COLUMN IF NOT EXISTS targets_per_game_3wk_avg_norm NUMERIC,
ADD COLUMN IF NOT EXISTS catch_rate_3wk_avg_norm NUMERIC,
ADD COLUMN IF NOT EXISTS yards_per_target_3wk_avg_norm NUMERIC;

-- Add comments for documentation
COMMENT ON COLUMN player_stats.targets_per_game IS 'Targets per game for this week (calculated from targets stat)';
COMMENT ON COLUMN player_stats.catch_rate IS 'Receptions divided by targets (0-1 scale)';
COMMENT ON COLUMN player_stats.yards_per_target IS 'Receiving yards divided by targets';
COMMENT ON COLUMN player_stats.targets_per_game_3wk_avg IS '3-week rolling average of targets per game';
COMMENT ON COLUMN player_stats.catch_rate_3wk_avg IS '3-week rolling average of catch rate (0-1 scale)';
COMMENT ON COLUMN player_stats.yards_per_target_3wk_avg IS '3-week rolling average of yards per target';
COMMENT ON COLUMN player_stats.targets_per_game_3wk_avg_norm IS 'Globally normalized 3-week rolling average of targets per game (0-1 scale, normalized across all WRs)';
COMMENT ON COLUMN player_stats.catch_rate_3wk_avg_norm IS 'Globally normalized 3-week rolling average of catch rate (0-1 scale, normalized across all WRs)';
COMMENT ON COLUMN player_stats.yards_per_target_3wk_avg_norm IS 'Globally normalized 3-week rolling average of yards per target (0-1 scale, normalized across all WRs)';

-- Create index for efficiency metrics queries
CREATE INDEX IF NOT EXISTS idx_player_stats_player_season_week_efficiency
  ON player_stats(player_id, season_year, week)
  WHERE targets_per_game IS NOT NULL OR catch_rate IS NOT NULL OR yards_per_target IS NOT NULL;

