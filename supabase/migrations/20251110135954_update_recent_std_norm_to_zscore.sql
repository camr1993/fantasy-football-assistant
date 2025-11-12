-- Update normalize_recent_stats_bulk to use z-score normalization for recent_std_norm
-- recent_mean_norm continues to use min-max normalization
-- recent_std_norm now uses z-score normalization: (x - mean) / std
-- Both normalizations are done within position groups (WR vs WR, RB vs RB, etc.)

CREATE OR REPLACE FUNCTION normalize_recent_stats_bulk(
  p_league_id UUID,
  p_season_year INT,
  p_week INT
)
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  -- Calculate normalized values using window functions per position
  WITH stats_with_aggregates AS (
    SELECT
      lc.player_id,
      lc.recent_mean,
      lc.recent_std,
      p.position,
      -- Calculate min/max per position for recent_mean (min-max normalization)
      MIN(lc.recent_mean) OVER (PARTITION BY p.position) AS recent_mean_min,
      MAX(lc.recent_mean) OVER (PARTITION BY p.position) AS recent_mean_max,
      -- Calculate mean and std per position for recent_std (z-score normalization)
      AVG(lc.recent_std) OVER (PARTITION BY p.position) AS recent_std_mean,
      STDDEV(lc.recent_std) OVER (PARTITION BY p.position) AS recent_std_stddev
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
      -- Normalize recent_mean: (x - min) / (max - min) - min-max normalization
      CASE
        WHEN recent_mean_max > recent_mean_min THEN
          ROUND(
            ((recent_mean - recent_mean_min)::NUMERIC /
             (recent_mean_max - recent_mean_min))::NUMERIC,
            3
          )
        ELSE 0
      END AS recent_mean_norm,
      -- Normalize recent_std: (x - mean) / std - z-score normalization
      CASE
        WHEN recent_std_stddev > 0 THEN
          ROUND(
            ((recent_std - recent_std_mean)::NUMERIC / recent_std_stddev)::NUMERIC,
            3
          )
        ELSE 0
      END AS recent_std_norm
    FROM stats_with_aggregates
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

COMMENT ON FUNCTION normalize_recent_stats_bulk IS 'Bulk normalizes recent_mean (min-max) and recent_std (z-score) for all players in a league using SQL window functions, grouped by position (WR vs WR, RB vs RB, etc.)';

