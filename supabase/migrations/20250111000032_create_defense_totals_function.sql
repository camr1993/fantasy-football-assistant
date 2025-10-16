-- Create function to calculate defense points against by position
-- This function calculates weekly fantasy points scored against a defense by position
-- Uses league_calcs table for accurate league-specific fantasy points

CREATE OR REPLACE FUNCTION get_defense_totals_by_position(
  p_league_id UUID,
  p_season_year INT,
  p_defense_player_id UUID,
  p_week INT
) RETURNS TABLE(
  position TEXT,
  total_points NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH position_fantasy_points AS (
    SELECT
      p.position,
      COALESCE(SUM(lc.fantasy_points), 0) as total_points
    FROM players p
    INNER JOIN player_stats ps ON ps.player_id = p.id
    INNER JOIN league_calcs lc ON lc.player_id = p.id
      AND lc.season_year = ps.season_year
      AND lc.week = ps.week
      AND lc.league_id = p_league_id
    WHERE ps.season_year = p_season_year
      AND ps.opponent_defense_player_id = p_defense_player_id
      AND ps.source = 'actual'
      AND ps.played = true
      AND ps.week = p_week
      AND p.position IN ('QB', 'RB', 'WR', 'TE', 'K')
    GROUP BY p.position
  )
  SELECT
    pfp.position,
    pfp.total_points
  FROM position_fantasy_points pfp
  ORDER BY pfp.position;
END;
$$ LANGUAGE plpgsql;

-- Add comment
COMMENT ON FUNCTION get_defense_totals_by_position IS 'Calculates weekly fantasy points scored against a defense player by position (QB, RB, WR, TE, K) using league-specific scoring from league_calcs table';
