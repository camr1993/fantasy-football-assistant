-- Add 3-week rolling averages for efficiency metrics to league_calcs table

ALTER TABLE league_calcs
ADD COLUMN IF NOT EXISTS targets_per_game_3wk_avg NUMERIC,
ADD COLUMN IF NOT EXISTS catch_rate_3wk_avg NUMERIC,
ADD COLUMN IF NOT EXISTS yards_per_target_3wk_avg NUMERIC;

-- Add comments for documentation
COMMENT ON COLUMN league_calcs.targets_per_game_3wk_avg IS '3-week rolling average of targets per game for the player';
COMMENT ON COLUMN league_calcs.catch_rate_3wk_avg IS '3-week rolling average of catch rate (receptions divided by targets, 0-1 scale)';
COMMENT ON COLUMN league_calcs.yards_per_target_3wk_avg IS '3-week rolling average of yards per target';

