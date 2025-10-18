-- Add rolling 3-week average fields to defense_points_against table

ALTER TABLE defense_points_against
ADD COLUMN IF NOT EXISTS qb_rolling_3_week_avg NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS rb_rolling_3_week_avg NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS wr_rolling_3_week_avg NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS te_rolling_3_week_avg NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS k_rolling_3_week_avg NUMERIC DEFAULT 0;

-- Add comments for documentation
COMMENT ON COLUMN defense_points_against.qb_rolling_3_week_avg IS 'Rolling 3-week average of fantasy points allowed to QB position';
COMMENT ON COLUMN defense_points_against.rb_rolling_3_week_avg IS 'Rolling 3-week average of fantasy points allowed to RB position';
COMMENT ON COLUMN defense_points_against.wr_rolling_3_week_avg IS 'Rolling 3-week average of fantasy points allowed to WR position';
COMMENT ON COLUMN defense_points_against.te_rolling_3_week_avg IS 'Rolling 3-week average of fantasy points allowed to TE position';
COMMENT ON COLUMN defense_points_against.k_rolling_3_week_avg IS 'Rolling 3-week average of fantasy points allowed to K position';
