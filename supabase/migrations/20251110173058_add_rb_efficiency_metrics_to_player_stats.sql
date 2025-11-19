-- Add RB efficiency metrics columns to player_stats table
-- These are league-agnostic metrics calculated from raw stats

ALTER TABLE player_stats
ADD COLUMN IF NOT EXISTS weighted_opportunity NUMERIC,
ADD COLUMN IF NOT EXISTS touchdown_production NUMERIC,
ADD COLUMN IF NOT EXISTS receiving_profile NUMERIC,
ADD COLUMN IF NOT EXISTS yards_per_carry NUMERIC,
ADD COLUMN IF NOT EXISTS yards_per_target_rb NUMERIC,
ADD COLUMN IF NOT EXISTS weighted_opportunity_3wk_avg NUMERIC,
ADD COLUMN IF NOT EXISTS touchdown_production_3wk_avg NUMERIC,
ADD COLUMN IF NOT EXISTS receiving_profile_3wk_avg NUMERIC,
ADD COLUMN IF NOT EXISTS yards_per_carry_3wk_avg NUMERIC,
ADD COLUMN IF NOT EXISTS yards_per_target_rb_3wk_avg NUMERIC,
ADD COLUMN IF NOT EXISTS weighted_opportunity_3wk_avg_norm NUMERIC,
ADD COLUMN IF NOT EXISTS touchdown_production_3wk_avg_norm NUMERIC,
ADD COLUMN IF NOT EXISTS receiving_profile_3wk_avg_norm NUMERIC,
ADD COLUMN IF NOT EXISTS yards_per_carry_3wk_avg_norm NUMERIC,
ADD COLUMN IF NOT EXISTS yards_per_target_rb_3wk_avg_norm NUMERIC;

-- Add comments for documentation
COMMENT ON COLUMN player_stats.weighted_opportunity IS 'Weighted opportunity: rushing_attempts + targets (for RB)';
COMMENT ON COLUMN player_stats.touchdown_production IS 'Touchdown production: rushing_touchdowns + receiving_touchdowns (for RB)';
COMMENT ON COLUMN player_stats.receiving_profile IS 'Receiving profile: receptions + receiving_yards (for RB)';
COMMENT ON COLUMN player_stats.yards_per_carry IS 'Rushing yards divided by rushing attempts (guard divide-by-zero)';
COMMENT ON COLUMN player_stats.yards_per_target_rb IS 'Receiving yards divided by targets (for RB, guard divide-by-zero)';
COMMENT ON COLUMN player_stats.weighted_opportunity_3wk_avg IS '3-week rolling average of weighted opportunity';
COMMENT ON COLUMN player_stats.touchdown_production_3wk_avg IS '3-week rolling average of touchdown production';
COMMENT ON COLUMN player_stats.receiving_profile_3wk_avg IS '3-week rolling average of receiving profile';
COMMENT ON COLUMN player_stats.yards_per_carry_3wk_avg IS '3-week rolling average of yards per carry';
COMMENT ON COLUMN player_stats.yards_per_target_rb_3wk_avg IS '3-week rolling average of yards per target (for RB)';
COMMENT ON COLUMN player_stats.weighted_opportunity_3wk_avg_norm IS 'Globally normalized 3-week rolling average of weighted opportunity (0-1 scale, normalized across all RBs)';
COMMENT ON COLUMN player_stats.touchdown_production_3wk_avg_norm IS 'Globally normalized 3-week rolling average of touchdown production (0-1 scale, normalized across all RBs)';
COMMENT ON COLUMN player_stats.receiving_profile_3wk_avg_norm IS 'Globally normalized 3-week rolling average of receiving profile (0-1 scale, normalized across all RBs)';
COMMENT ON COLUMN player_stats.yards_per_carry_3wk_avg_norm IS 'Globally normalized 3-week rolling average of yards per carry (0-1 scale, normalized across all RBs)';
COMMENT ON COLUMN player_stats.yards_per_target_rb_3wk_avg_norm IS 'Globally normalized 3-week rolling average of yards per target (0-1 scale, normalized across all RBs)';

-- Create index for RB efficiency metrics queries
CREATE INDEX IF NOT EXISTS idx_player_stats_player_season_week_rb_efficiency
  ON player_stats(player_id, season_year, week)
  WHERE weighted_opportunity IS NOT NULL OR touchdown_production IS NOT NULL OR receiving_profile IS NOT NULL OR yards_per_carry IS NOT NULL OR yards_per_target_rb IS NOT NULL;

