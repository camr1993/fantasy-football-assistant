-- Update injury architecture to separate status from players table
-- and simplify player_injuries table structure

-- Drop status field from players table
ALTER TABLE players DROP COLUMN IF EXISTS status;

-- Drop all fields from player_injuries except id, player_id, status, created_at
-- First, drop the foreign key constraint
ALTER TABLE player_injuries DROP CONSTRAINT IF EXISTS player_injuries_player_id_fkey;

-- Drop all columns except the ones we want to keep
ALTER TABLE player_injuries DROP COLUMN IF EXISTS season_year;
ALTER TABLE player_injuries DROP COLUMN IF EXISTS week;
ALTER TABLE player_injuries DROP COLUMN IF EXISTS notes;
ALTER TABLE player_injuries DROP COLUMN IF EXISTS report_date;
ALTER TABLE player_injuries DROP COLUMN IF EXISTS updated_at;
ALTER TABLE player_injuries DROP COLUMN IF EXISTS last_updated;

-- Re-add the foreign key constraint
ALTER TABLE player_injuries
ADD CONSTRAINT player_injuries_player_id_fkey
FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE;

-- Update the unique constraint to just be on player_id since we're tracking current status
-- Drop the old unique constraint first
ALTER TABLE player_injuries DROP CONSTRAINT IF EXISTS player_injuries_player_id_season_year_week_report_date_key;

-- Add new unique constraint on player_id only (one injury record per player)
ALTER TABLE player_injuries ADD CONSTRAINT player_injuries_player_id_key UNIQUE (player_id);

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_player_injuries_player_id ON player_injuries(player_id);
CREATE INDEX IF NOT EXISTS idx_player_injuries_status ON player_injuries(status);
