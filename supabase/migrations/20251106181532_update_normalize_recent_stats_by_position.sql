-- Update normalize_recent_stats_bulk to normalize within position groups
-- Previously normalized across all players, now normalizes WR vs WR, RB vs RB, etc.

CREATE OR REPLACE FUNCTION normalize_recent_stats_bulk(
  p_league_id UUID,
  p_season_year INT,
  p_week INT
)
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  -- Calculate normalized values using window functions for min/max per position
  WITH stats_with_minmax AS (
    SELECT
      lc.player_id,
      lc.recent_mean,
      lc.recent_std,
      p.position,
      -- Calculate min/max per position using PARTITION BY
      MIN(lc.recent_mean) OVER (PARTITION BY p.position) AS recent_mean_min,
      MAX(lc.recent_mean) OVER (PARTITION BY p.position) AS recent_mean_max,
      MIN(lc.recent_std) OVER (PARTITION BY p.position) AS recent_std_min,
      MAX(lc.recent_std) OVER (PARTITION BY p.position) AS recent_std_max
    FROM league_calcs lc
    INNER JOIN players p ON lc.player_id = p.id
    WHERE lc.league_id = p_league_id
      AND lc.season_year = p_season_year
      AND lc.week = p_week
      AND lc.recent_mean IS NOT NULL
      AND lc.recent_std IS NOT NULL
      AND p.position IS NOT NULL
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

COMMENT ON FUNCTION normalize_recent_stats_bulk IS 'Bulk normalizes recent_mean and recent_std for all players in a league using SQL window functions, grouped by position (WR vs WR, RB vs RB, etc.)';

