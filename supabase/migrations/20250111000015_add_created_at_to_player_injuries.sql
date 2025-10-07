-- Add created_at field to player_injuries table
-- This ensures the table has the proper timestamp field for tracking when injury records were created

-- Add created_at column if it doesn't exist
ALTER TABLE player_injuries ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Add index for better performance on created_at queries
CREATE INDEX IF NOT EXISTS idx_player_injuries_created_at ON player_injuries(created_at);
