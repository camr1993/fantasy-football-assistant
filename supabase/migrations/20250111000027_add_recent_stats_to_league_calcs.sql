-- Add recent_mean and recent_std columns to league_calcs table
-- These will store rolling statistics for recent weeks

ALTER TABLE league_calcs
ADD COLUMN recent_mean NUMERIC,
ADD COLUMN recent_std NUMERIC;

-- Add comments for documentation
COMMENT ON COLUMN league_calcs.recent_mean IS 'Rolling mean of fantasy points over recent weeks (including current week)';
COMMENT ON COLUMN league_calcs.recent_std IS 'Rolling standard deviation of fantasy points over recent weeks (including current week)';
