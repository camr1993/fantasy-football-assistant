-- Add position-specific ODI fields to defense_points_against table

ALTER TABLE defense_points_against
ADD COLUMN IF NOT EXISTS qb_odi NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS rb_odi NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS wr_odi NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS te_odi NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS k_odi NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS qb_normalized_odi NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS rb_normalized_odi NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS wr_normalized_odi NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS te_normalized_odi NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS k_normalized_odi NUMERIC DEFAULT 0;

-- Add comments for documentation
COMMENT ON COLUMN defense_points_against.qb_odi IS 'QB ODI: team QB rolling avg / league QB rolling avg';
COMMENT ON COLUMN defense_points_against.rb_odi IS 'RB ODI: team RB rolling avg / league RB rolling avg';
COMMENT ON COLUMN defense_points_against.wr_odi IS 'WR ODI: team WR rolling avg / league WR rolling avg';
COMMENT ON COLUMN defense_points_against.te_odi IS 'TE ODI: team TE rolling avg / league TE rolling avg';
COMMENT ON COLUMN defense_points_against.k_odi IS 'K ODI: team K rolling avg / league K rolling avg';
COMMENT ON COLUMN defense_points_against.qb_normalized_odi IS 'Normalized QB ODI (0-1)';
COMMENT ON COLUMN defense_points_against.rb_normalized_odi IS 'Normalized RB ODI (0-1)';
COMMENT ON COLUMN defense_points_against.wr_normalized_odi IS 'Normalized WR ODI (0-1)';
COMMENT ON COLUMN defense_points_against.te_normalized_odi IS 'Normalized TE ODI (0-1)';
COMMENT ON COLUMN defense_points_against.k_normalized_odi IS 'Normalized K ODI (0-1)';
