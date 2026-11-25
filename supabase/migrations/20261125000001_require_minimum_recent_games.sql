-- Require a minimum number of recent games before a player is scored.
--
-- recent_mean was written from however many games a player had, including a
-- single one. STDDEV of one sample is NULL, so normalize_recent_stats_bulk
-- skipped those rows entirely (it filters on recent_std IS NOT NULL) and they
-- kept a recent_mean_norm of 0. Since that column is a z-score, 0 does not
-- mean "no data" - it means exactly league average. A backup quarterback with
-- one start was therefore treated as an average starter on the single
-- heaviest factor (recent production, weight 0.50), and a flukishly clean
-- one-game sample on the lighter factors was enough to rank him over a real
-- starter.
--
-- The requirement scales with what is actually possible, so the opening week
-- still produces recommendations:
--
--   week 1   -> 1 game   (the window only holds one week)
--   week 2+  -> 2 games  (of the last three)
--
-- Players below the threshold have their recent stats, normalizations and
-- weighted score cleared, so downstream they look like a player with no
-- score - which the tips pipeline already handles by staying silent rather
-- than ranking them.

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
  min_games INT;
BEGIN
  start_week := GREATEST(1, p_week - p_recent_weeks + 1);

  -- Never ask for more games than the season has made available
  min_games := LEAST(2, p_week);

  WITH recent_stats AS (
    SELECT
      lc_current.player_id,
      AVG(lc_recent.fantasy_points) AS recent_mean,
      STDDEV(lc_recent.fantasy_points) AS recent_std,
      COUNT(lc_recent.fantasy_points) AS games_played
    FROM league_calcs lc_current
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
      games_played,
      CASE WHEN games_played >= min_games
        THEN ROUND(recent_mean::NUMERIC, 2)
      END AS recent_mean,
      CASE WHEN games_played >= min_games
        THEN ROUND(recent_std::NUMERIC, 2)
      END AS recent_std
    FROM recent_stats
  )
  UPDATE league_calcs lc
  SET
    recent_mean = swr.recent_mean,
    recent_std = swr.recent_std,
    -- Clear anything derived from a sample we are no longer willing to use,
    -- so a stale score from an earlier run cannot survive
    recent_mean_norm = CASE WHEN swr.recent_mean IS NULL THEN NULL ELSE lc.recent_mean_norm END,
    recent_std_norm  = CASE WHEN swr.recent_mean IS NULL THEN NULL ELSE lc.recent_std_norm END,
    weighted_score   = CASE WHEN swr.recent_mean IS NULL THEN NULL ELSE lc.weighted_score END,
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

COMMENT ON FUNCTION calculate_recent_stats_bulk IS
  'Rolling mean and standard deviation of recent fantasy points, left NULL for players below the minimum games threshold so they are not scored on a sample too small to mean anything';
