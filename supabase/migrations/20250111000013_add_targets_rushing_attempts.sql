-- Add targets and rushing_attempts columns to player_stats table
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS targets INTEGER DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS rushing_attempts INTEGER DEFAULT 0;

-- Add stat definitions for targets and rushing attempts
INSERT INTO stat_definitions (stat_id, name, player_stats_column, category) VALUES
(78, 'Targets', 'targets', 'Receiving'),
(8, 'Rushing Attempts', 'rushing_attempts', 'Rushing')
ON CONFLICT (stat_id) DO UPDATE SET
  name = EXCLUDED.name,
  player_stats_column = EXCLUDED.player_stats_column,
  category = EXCLUDED.category,
  updated_at = NOW();

-- Add index for the new columns if needed
CREATE INDEX IF NOT EXISTS idx_player_stats_targets ON player_stats(targets);
CREATE INDEX IF NOT EXISTS idx_player_stats_rushing_attempts ON player_stats(rushing_attempts);
