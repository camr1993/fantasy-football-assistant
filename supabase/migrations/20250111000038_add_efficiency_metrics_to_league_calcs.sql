-- Add efficiency metrics to league_calcs table

ALTER TABLE league_calcs
ADD COLUMN IF NOT EXISTS targets_per_game NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS catch_rate NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS yards_per_target NUMERIC DEFAULT 0;

-- Add comments for documentation
COMMENT ON COLUMN league_calcs.targets_per_game IS 'Average targets per game for the player';
COMMENT ON COLUMN league_calcs.catch_rate IS 'Receptions divided by targets (0-1 scale)';
COMMENT ON COLUMN league_calcs.yards_per_target IS 'Receiving yards divided by targets';
