-- Drop ODI columns from defense_points_against table
-- Add normalized rolling 3-week average columns using z-score normalization

-- Drop position-specific ODI columns
ALTER TABLE defense_points_against
DROP COLUMN IF EXISTS qb_odi,
DROP COLUMN IF EXISTS rb_odi,
DROP COLUMN IF EXISTS wr_odi,
DROP COLUMN IF EXISTS te_odi,
DROP COLUMN IF EXISTS k_odi,
DROP COLUMN IF EXISTS qb_normalized_odi,
DROP COLUMN IF EXISTS rb_normalized_odi,
DROP COLUMN IF EXISTS wr_normalized_odi,
DROP COLUMN IF EXISTS te_normalized_odi,
DROP COLUMN IF EXISTS k_normalized_odi;

-- Add normalized rolling 3-week average columns (z-score normalization)
ALTER TABLE defense_points_against
ADD COLUMN IF NOT EXISTS qb_rolling_3_wk_avg_norm NUMERIC,
ADD COLUMN IF NOT EXISTS rb_rolling_3_wk_avg_norm NUMERIC,
ADD COLUMN IF NOT EXISTS wr_rolling_3_wk_avg_norm NUMERIC,
ADD COLUMN IF NOT EXISTS te_rolling_3_wk_avg_norm NUMERIC,
ADD COLUMN IF NOT EXISTS k_rolling_3_wk_avg_norm NUMERIC;

-- Add comments for documentation
COMMENT ON COLUMN defense_points_against.qb_rolling_3_wk_avg_norm IS 'Z-score normalized QB rolling 3-week avg: (x - mean) / std across all defenses for the league/season/week';
COMMENT ON COLUMN defense_points_against.rb_rolling_3_wk_avg_norm IS 'Z-score normalized RB rolling 3-week avg: (x - mean) / std across all defenses for the league/season/week';
COMMENT ON COLUMN defense_points_against.wr_rolling_3_wk_avg_norm IS 'Z-score normalized WR rolling 3-week avg: (x - mean) / std across all defenses for the league/season/week';
COMMENT ON COLUMN defense_points_against.te_rolling_3_wk_avg_norm IS 'Z-score normalized TE rolling 3-week avg: (x - mean) / std across all defenses for the league/season/week';
COMMENT ON COLUMN defense_points_against.k_rolling_3_wk_avg_norm IS 'Z-score normalized K rolling 3-week avg: (x - mean) / std across all defenses for the league/season/week';

