-- Change bye_weeks array to single bye_week integer field
-- Drop the existing bye_weeks array column and its index
ALTER TABLE players DROP COLUMN IF EXISTS bye_weeks;
DROP INDEX IF EXISTS idx_players_bye_weeks;

-- Add new bye_week integer column
ALTER TABLE players ADD COLUMN bye_week INTEGER;

-- Add index for efficient querying of bye week
CREATE INDEX idx_players_bye_week ON players (bye_week);

-- Add comment for documentation
COMMENT ON COLUMN players.bye_week IS 'Single bye week for the player (e.g., 12 for week 12)';
