-- Replace yards_per_carry and yards_per_target_rb with yards_per_touch
-- Drop old efficiency metric columns
ALTER TABLE player_stats
DROP COLUMN IF EXISTS yards_per_carry,
DROP COLUMN IF EXISTS yards_per_target_rb,
DROP COLUMN IF EXISTS yards_per_carry_3wk_avg,
DROP COLUMN IF EXISTS yards_per_target_rb_3wk_avg,
DROP COLUMN IF EXISTS yards_per_carry_3wk_avg_norm,
DROP COLUMN IF EXISTS yards_per_target_rb_3wk_avg_norm;

-- Add new yards_per_touch column and its 3-week avg and normalized versions
ALTER TABLE player_stats
ADD COLUMN IF NOT EXISTS yards_per_touch NUMERIC,
ADD COLUMN IF NOT EXISTS yards_per_touch_3wk_avg NUMERIC,
ADD COLUMN IF NOT EXISTS yards_per_touch_3wk_avg_norm NUMERIC;

-- Add comments for documentation
COMMENT ON COLUMN player_stats.yards_per_touch IS 'Yards per touch: (rushing_yards + receiving_yards) / (rushing_attempts + targets) (guard divide-by-zero)';
COMMENT ON COLUMN player_stats.yards_per_touch_3wk_avg IS '3-week rolling average of yards per touch';
COMMENT ON COLUMN player_stats.yards_per_touch_3wk_avg_norm IS 'Globally normalized 3-week rolling average of yards per touch (0-1 scale, normalized across all RBs)';

-- Update index for RB efficiency metrics queries
DROP INDEX IF EXISTS idx_player_stats_player_season_week_rb_efficiency;
CREATE INDEX IF NOT EXISTS idx_player_stats_player_season_week_rb_efficiency
  ON player_stats(player_id, season_year, week)
  WHERE weighted_opportunity IS NOT NULL OR touchdown_production IS NOT NULL OR receiving_profile IS NOT NULL OR yards_per_touch IS NOT NULL;

