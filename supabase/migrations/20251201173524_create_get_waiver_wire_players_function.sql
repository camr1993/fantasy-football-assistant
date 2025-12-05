-- Create function to get top available waiver wire players for a league
-- Returns top 3 players per position based on weighted_score
-- Excludes rostered players, injured players, and players on bye next week

CREATE OR REPLACE FUNCTION get_waiver_wire_players(
  p_league_id UUID,
  p_season_year INT,
  p_current_week INT,
  p_next_week INT
)
RETURNS TABLE (
  "position" TEXT,
  player_id UUID,
  name TEXT,
  team TEXT,
  yahoo_player_id TEXT,
  weighted_score NUMERIC,
  rank BIGINT
) AS $$
BEGIN
  RETURN QUERY
  WITH league_teams AS (
    SELECT DISTINCT t.id as team_id
    FROM teams t
    WHERE t.league_id = p_league_id
  ),
  rostered_players AS (
    SELECT DISTINCT re.player_id
    FROM roster_entry re
    INNER JOIN league_teams lt ON re.team_id = lt.team_id
  ),
  injured_players AS (
    SELECT DISTINCT pi.player_id
    FROM player_injuries pi
    WHERE pi.status IN ('O', 'IR', 'PUP-R', 'D', 'SUSP', 'NFI-R', 'IR-R')
  ),
  bye_week_players AS (
    SELECT p.id as player_id
    FROM players p
    WHERE p.bye_week = p_next_week
  ),
  available_players AS (
    SELECT
      lc.player_id,
      lc.weighted_score,
      p.name,
      p.position,
      p.team,
      p.yahoo_player_id
    FROM league_calcs lc
    INNER JOIN players p ON lc.player_id = p.id
    WHERE lc.league_id = p_league_id
      AND lc.season_year = p_season_year
      AND lc.week = p_current_week
      AND lc.weighted_score IS NOT NULL
      AND p.position IS NOT NULL
      AND p.position != ''
      AND NOT EXISTS (SELECT 1 FROM rostered_players rp WHERE rp.player_id = lc.player_id)
      AND NOT EXISTS (SELECT 1 FROM injured_players ip WHERE ip.player_id = lc.player_id)
      AND NOT EXISTS (SELECT 1 FROM bye_week_players bp WHERE bp.player_id = lc.player_id)
  ),
  ranked_players AS (
    SELECT
      ap.position,
      ap.player_id,
      ap.name,
      ap.team,
      ap.yahoo_player_id,
      ap.weighted_score,
      ROW_NUMBER() OVER (PARTITION BY ap.position ORDER BY ap.weighted_score DESC) as rank
    FROM available_players ap
  )
  SELECT
    rp.position as "position",
    rp.player_id,
    rp.name,
    rp.team,
    rp.yahoo_player_id,
    rp.weighted_score,
    rp.rank
  FROM ranked_players rp
  WHERE rp.rank <= 3
  ORDER BY rp.position, rp.weighted_score DESC;
END;
$$ LANGUAGE plpgsql;

-- Add comment for documentation
COMMENT ON FUNCTION get_waiver_wire_players IS 'Returns top 3 available waiver wire players per position for a league, excluding rostered, injured, and bye week players';

