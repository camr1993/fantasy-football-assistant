-- Re-add efficiency metrics fields to league_calcs table

-- Add 3-week rolling averages for efficiency metrics
ALTER TABLE league_calcs
ADD COLUMN targets_per_game_3wk_avg NUMERIC,
ADD COLUMN catch_rate_3wk_avg NUMERIC,
ADD COLUMN yards_per_target_3wk_avg NUMERIC;

-- Add normalized 3-week rolling averages for efficiency metrics
ALTER TABLE league_calcs
ADD COLUMN targets_per_game_3wk_avg_norm NUMERIC,
ADD COLUMN catch_rate_3wk_avg_norm NUMERIC,
ADD COLUMN yards_per_target_3wk_avg_norm NUMERIC;

-- Add comments for documentation
COMMENT ON COLUMN league_calcs.targets_per_game_3wk_avg IS '3-week rolling average of targets per game for the player';
COMMENT ON COLUMN league_calcs.catch_rate_3wk_avg IS '3-week rolling average of catch rate (receptions divided by targets, 0-1 scale)';
COMMENT ON COLUMN league_calcs.yards_per_target_3wk_avg IS '3-week rolling average of yards per target';
COMMENT ON COLUMN league_calcs.targets_per_game_3wk_avg_norm IS 'Normalized 3-week rolling average of targets per game (0-1 scale using min-max scaling)';
COMMENT ON COLUMN league_calcs.catch_rate_3wk_avg_norm IS 'Normalized 3-week rolling average of catch rate (0-1 scale using min-max scaling)';
COMMENT ON COLUMN league_calcs.yards_per_target_3wk_avg_norm IS 'Normalized 3-week rolling average of yards per target (0-1 scale using min-max scaling)';

