-- Add bye_weeks field to players table
-- Using INTEGER[] to store multiple bye weeks as an array of integers

ALTER TABLE players ADD COLUMN bye_weeks INTEGER[];

-- Add index for efficient querying of bye weeks
CREATE INDEX idx_players_bye_weeks ON players USING GIN (bye_weeks);

-- Add comment for documentation
COMMENT ON COLUMN players.bye_weeks IS 'Array of bye weeks for the player (e.g., [12, 13] for weeks 12 and 13)';
