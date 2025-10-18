-- Add ODI (Opponent Difficulty Index) fields to defense_points_against table

ALTER TABLE defense_points_against
ADD COLUMN IF NOT EXISTS odi NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS normalized_odi NUMERIC DEFAULT 0;

-- Add comments for documentation
COMMENT ON COLUMN defense_points_against.odi IS 'Opponent Difficulty Index: team rolling average / league average rolling average for the week';
COMMENT ON COLUMN defense_points_against.normalized_odi IS 'Normalized ODI (0-1): (team_odi - min_odi) / (max_odi - min_odi) for the league and week';
