-- Add new stat definitions and columns for:
-- stat_id 69: total_yards_given_up (DEF)
-- stat_id 1: passes_attempted (passing)
-- stat_id 2: passes_completed (passing)
-- stat_id 0: played (boolean - whether player played)

-- Add new columns to player_stats table
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS total_yards_given_up INTEGER DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS passes_attempted INTEGER DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS passes_completed INTEGER DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS played BOOLEAN DEFAULT false;

-- Add stat definitions for the new stats
INSERT INTO stat_definitions (stat_id, name, player_stats_column, category) VALUES
(69, 'Total Yards Given Up', 'total_yards_given_up', 'defense'),
(1, 'Passes Attempted', 'passes_attempted', 'passing'),
(2, 'Passes Completed', 'passes_completed', 'passing'),
(0, 'Played', 'played', 'misc')
ON CONFLICT (stat_id) DO UPDATE SET
  name = EXCLUDED.name,
  player_stats_column = EXCLUDED.player_stats_column,
  category = EXCLUDED.category,
  updated_at = NOW();

-- Add indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_player_stats_total_yards_given_up ON player_stats(total_yards_given_up);
CREATE INDEX IF NOT EXISTS idx_player_stats_passes_attempted ON player_stats(passes_attempted);
CREATE INDEX IF NOT EXISTS idx_player_stats_passes_completed ON player_stats(passes_completed);
CREATE INDEX IF NOT EXISTS idx_player_stats_played ON player_stats(played);

-- Add default league modifiers for the new stats
INSERT INTO league_stat_modifiers (league_id, stat_id, value)
SELECT
  l.id as league_id,
  sd.stat_id,
  CASE sd.stat_id
    WHEN 69 THEN 0.0    -- Total yards given up (defense) - typically not scored directly
    WHEN 1 THEN 0.0     -- Passes attempted - typically not scored directly
    WHEN 2 THEN 0.0     -- Passes completed - typically not scored directly
    WHEN 0 THEN 0.0     -- Played - not a scoring stat
    ELSE 0.0
  END as value
FROM leagues l
CROSS JOIN stat_definitions sd
WHERE sd.stat_id IN (69, 1, 2, 0)
ON CONFLICT (league_id, stat_id) DO NOTHING;
