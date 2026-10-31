-- Return the most recent week that has a full slate of calculated scores.
--
-- Tips previously used MAX(week) from league_calcs. During a live week that is
-- the in-progress week, which only holds scores for players whose game has
-- already kicked off - so on a Friday a user setting their lineup saw almost
-- no recommendations, exactly when they need them most.
--
-- Completeness is judged by comparing a week's scored-row count against the
-- median of the weeks before it. Real weeks land within ~10-15% of that median
-- even when several teams are on bye, while an in-progress week is far below
-- it, so the 0.5 threshold sits in a wide gap:
--
--   2025 w1-w17 : ratios 0.89 - 1.08  (complete)
--   2026 w7     : ratio  0.86         (complete, bye-heavy)
--   2026 w8     : ratio  0.06         (in progress)
--
-- Week 1 has no prior weeks to compare against, so it always qualifies.

CREATE OR REPLACE FUNCTION get_last_complete_week(p_season_year INT)
RETURNS INT AS $$
DECLARE
  v_week INT;
BEGIN
  WITH weekly AS (
    SELECT lc.week, COUNT(*)::NUMERIC AS scored_rows
    FROM league_calcs lc
    WHERE lc.season_year = p_season_year
      AND lc.weighted_score IS NOT NULL
    GROUP BY lc.week
  ),
  with_prior_median AS (
    SELECT
      w.week,
      w.scored_rows,
      (
        SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY earlier.scored_rows)
        FROM weekly earlier
        WHERE earlier.week < w.week
      ) AS prior_median
    FROM weekly w
  )
  SELECT MAX(week) INTO v_week
  FROM with_prior_median
  WHERE prior_median IS NULL
     OR scored_rows >= 0.5 * prior_median;

  RETURN v_week;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_last_complete_week IS
  'Most recent week in league_calcs with a full slate of scores, so tips do not key off a week still in progress';
