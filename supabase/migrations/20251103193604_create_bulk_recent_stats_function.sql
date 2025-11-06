-- Create SQL function to bulk calculate recent stats (mean and std) for all players in a league
-- Uses window functions to calculate rolling averages efficiently

CREATE OR REPLACE FUNCTION calculate_recent_stats_bulk(
  p_league_id UUID,
  p_season_year INT,
  p_week INT,
  p_recent_weeks INT DEFAULT 3
)
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
  start_week INT;
BEGIN
  start_week := GREATEST(1, p_week - p_recent_weeks + 1);

  -- Calculate mean and std for all players using aggregation
  WITH recent_stats AS (
    SELECT
      lc_current.player_id,
      -- Calculate mean over recent weeks
      AVG(lc_recent.fantasy_points) AS recent_mean,
      -- Calculate standard deviation over recent weeks
      STDDEV(lc_recent.fantasy_points) AS recent_std
    FROM league_calcs lc_current
    -- Join with recent weeks data for the same player
    INNER JOIN league_calcs lc_recent
      ON lc_recent.league_id = lc_current.league_id
      AND lc_recent.player_id = lc_current.player_id
      AND lc_recent.season_year = lc_current.season_year
      AND lc_recent.week >= start_week
      AND lc_recent.week <= p_week
      AND lc_recent.fantasy_points IS NOT NULL
    WHERE lc_current.league_id = p_league_id
      AND lc_current.season_year = p_season_year
      AND lc_current.week = p_week
      AND lc_current.fantasy_points IS NOT NULL
    GROUP BY lc_current.player_id
  ),
  stats_with_rounding AS (
    SELECT
      player_id,
      ROUND(recent_mean::NUMERIC, 2) AS recent_mean,
      ROUND(recent_std::NUMERIC, 2) AS recent_std
    FROM recent_stats
  )
  UPDATE league_calcs lc
  SET
    recent_mean = swr.recent_mean,
    recent_std = swr.recent_std,
    updated_at = NOW()
  FROM stats_with_rounding swr
  WHERE lc.league_id = p_league_id
    AND lc.player_id = swr.player_id
    AND lc.season_year = p_season_year
    AND lc.week = p_week;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_recent_stats_bulk IS 'Bulk calculates recent mean and std for all players in a league using SQL window functions';

