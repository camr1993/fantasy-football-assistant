-- Drop the points column from player_stats table
-- Points will now be calculated and stored in the league_calcs table

ALTER TABLE player_stats DROP COLUMN IF EXISTS points;

-- Add comment
COMMENT ON TABLE player_stats IS 'Raw player statistics (league-agnostic). Fantasy points are calculated and stored in league_calcs table.';

