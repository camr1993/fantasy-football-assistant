-- Update defense_return_touchdowns stat_id from 73 to 49
-- This corrects the stat_id to match Yahoo's actual stat ID

-- First, check if stat_id 49 already exists and handle it
-- If stat_id 49 exists, we need to delete it first or merge the data
DO $$
BEGIN
    -- Check if stat_id 49 already exists
    IF EXISTS (SELECT 1 FROM stat_definitions WHERE stat_id = 49) THEN
        -- Delete any existing stat_id 49 records (they shouldn't exist for this stat)
        DELETE FROM league_stat_modifiers WHERE stat_id = 49;
        DELETE FROM stat_definitions WHERE stat_id = 49;
    END IF;
END $$;

-- Create the new stat_id 49 record in stat_definitions
INSERT INTO stat_definitions (stat_id, name, player_stats_column, category, created_at, updated_at)
SELECT 49, name, player_stats_column, category, created_at, NOW()
FROM stat_definitions
WHERE stat_id = 73 AND player_stats_column = 'defense_return_touchdowns';

-- Now update the league_stat_modifiers table to use the new stat_id
UPDATE league_stat_modifiers
SET stat_id = 49, updated_at = NOW()
WHERE stat_id = 73;

-- Finally, delete the old stat_id 73 record from stat_definitions
DELETE FROM stat_definitions
WHERE stat_id = 73 AND player_stats_column = 'defense_return_touchdowns';

-- Add comment for documentation
COMMENT ON COLUMN player_stats.defense_return_touchdowns IS 'Defense return touchdowns (stat_id 49)';
