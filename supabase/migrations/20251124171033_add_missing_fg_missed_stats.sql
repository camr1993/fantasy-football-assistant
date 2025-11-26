-- Add missing FG missed stat columns to player_stats table
-- These stats were missing: fg_missed_30_39, fg_missed_40_49, fg_missed_50_plus

ALTER TABLE player_stats
ADD COLUMN IF NOT EXISTS fg_missed_30_39 INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS fg_missed_40_49 INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS fg_missed_50_plus INT DEFAULT 0;

-- Add stat definitions for the new FG missed stats
INSERT INTO stat_definitions (stat_id, name, player_stats_column, category)
VALUES
  (26, 'Field Goals Missed 30-39', 'fg_missed_30_39', 'kicking'),
  (27, 'Field Goals Missed 40-49', 'fg_missed_40_49', 'kicking'),
  (28, 'Field Goals Missed 50+', 'fg_missed_50_plus', 'kicking')
ON CONFLICT (stat_id) DO UPDATE
SET
  name = EXCLUDED.name,
  player_stats_column = EXCLUDED.player_stats_column,
  category = EXCLUDED.category,
  updated_at = NOW();

-- Update the comment for fg_pat_misses to reflect all missed FG ranges
COMMENT ON COLUMN player_stats.fg_pat_misses IS 'FG/PAT misses: fg_missed_0_19 + fg_missed_20_29 + fg_missed_30_39 + fg_missed_40_49 + fg_missed_50_plus + pat_missed';

-- Update the comment for fg_attempts to reflect all missed FG ranges
COMMENT ON COLUMN player_stats.fg_attempts IS 'Total FG attempts: sum of all FG made and missed (all distance ranges)';

