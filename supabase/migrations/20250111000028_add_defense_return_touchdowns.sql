-- Add defense_return_touchdowns stat definition and column
-- stat_id 73: defense_return_touchdowns (DEF)

-- Add new column to player_stats table
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS defense_return_touchdowns INTEGER DEFAULT 0;

-- Add stat definition for the new stat
INSERT INTO stat_definitions (stat_id, name, player_stats_column, category) VALUES
(73, 'Defense Return Touchdowns', 'defense_return_touchdowns', 'defense')
ON CONFLICT (stat_id) DO UPDATE SET
  name = EXCLUDED.name,
  player_stats_column = EXCLUDED.player_stats_column,
  category = EXCLUDED.category,
  updated_at = NOW();

-- Add index for the new column
CREATE INDEX IF NOT EXISTS idx_player_stats_defense_return_touchdowns ON player_stats(defense_return_touchdowns);

-- Add default league modifiers for the new stat (0 points by default)
INSERT INTO league_stat_modifiers (league_id, stat_id, value)
SELECT
  l.id as league_id,
  sd.stat_id,
  0.0 as value  -- Default to 0 points
FROM leagues l
CROSS JOIN stat_definitions sd
WHERE sd.stat_id = 73
ON CONFLICT (league_id, stat_id) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();

-- Add comment for documentation
COMMENT ON COLUMN player_stats.defense_return_touchdowns IS 'Defense return touchdowns (stat_id 73)';
