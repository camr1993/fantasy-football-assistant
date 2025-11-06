-- Create SQL function to bulk normalize recent stats (mean and std) for all players in a league
-- Uses window functions to calculate min/max and normalize in one query

CREATE OR REPLACE FUNCTION normalize_recent_stats_bulk(
  p_league_id UUID,
  p_season_year INT,
  p_week INT
)
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  -- Calculate normalized values using window functions for min/max
  WITH stats_with_minmax AS (
    SELECT
      player_id,
      recent_mean,
      recent_std,
      MIN(recent_mean) OVER () AS recent_mean_min,
      MAX(recent_mean) OVER () AS recent_mean_max,
      MIN(recent_std) OVER () AS recent_std_min,
      MAX(recent_std) OVER () AS recent_std_max
    FROM league_calcs
    WHERE league_id = p_league_id
      AND season_year = p_season_year
      AND week = p_week
      AND recent_mean IS NOT NULL
      AND recent_std IS NOT NULL
  ),
  normalized_stats AS (
    SELECT
      player_id,
      -- Normalize recent_mean: (x - min) / (max - min)
      CASE
        WHEN recent_mean_max > recent_mean_min THEN
          ROUND(
            ((recent_mean - recent_mean_min)::NUMERIC /
             (recent_mean_max - recent_mean_min))::NUMERIC,
            3
          )
        ELSE 0
      END AS recent_mean_norm,
      -- Normalize recent_std: (x - min) / (max - min)
      CASE
        WHEN recent_std_max > recent_std_min THEN
          ROUND(
            ((recent_std - recent_std_min)::NUMERIC /
             (recent_std_max - recent_std_min))::NUMERIC,
            3
          )
        ELSE 0
      END AS recent_std_norm
    FROM stats_with_minmax
  )
  UPDATE league_calcs lc
  SET
    recent_mean_norm = ns.recent_mean_norm,
    recent_std_norm = ns.recent_std_norm,
    updated_at = NOW()
  FROM normalized_stats ns
  WHERE lc.league_id = p_league_id
    AND lc.player_id = ns.player_id
    AND lc.season_year = p_season_year
    AND lc.week = p_week;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION normalize_recent_stats_bulk IS 'Bulk normalizes recent_mean and recent_std for all players in a league using SQL window functions';

