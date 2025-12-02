-- Update player_injuries table to track all players (1 row per player)
-- Drop created_at, add updated_at, and change unique constraint to player_id only

-- Drop the old unique constraint on (player_id, created_at)
ALTER TABLE player_injuries DROP CONSTRAINT IF EXISTS player_injuries_player_id_created_at_key;

-- Drop created_at column
ALTER TABLE player_injuries DROP COLUMN IF EXISTS created_at;

-- Add updated_at column
ALTER TABLE player_injuries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add unique constraint on player_id only (one row per player)
ALTER TABLE player_injuries ADD CONSTRAINT player_injuries_player_id_key UNIQUE (player_id);

-- Update index to include updated_at for better query performance
DROP INDEX IF EXISTS idx_player_injuries_created_at;
CREATE INDEX IF NOT EXISTS idx_player_injuries_updated_at ON player_injuries(updated_at);

-- Add comment for documentation
COMMENT ON TABLE player_injuries IS 'Tracks current injury status for all players (1 row per player)';
COMMENT ON COLUMN player_injuries.updated_at IS 'Timestamp of when the injury status was last updated';
COMMENT ON COLUMN player_injuries.status IS 'Current injury status (e.g., O, IR, PUP-R, D, SUSP, NFI-R, IR-R, NA for healthy)';

