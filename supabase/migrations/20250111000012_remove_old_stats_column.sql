-- Remove the old stats JSONB field since we're now using individual columns
-- This migration removes the redundant stats field after the new individual columns have been added

ALTER TABLE player_stats DROP COLUMN IF EXISTS stats;

-- Add comment to document the change
COMMENT ON TABLE player_stats IS 'Player stats table with individual stat columns (stats JSONB field removed)';
