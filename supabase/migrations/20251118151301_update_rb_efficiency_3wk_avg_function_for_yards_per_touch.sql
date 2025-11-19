-- Update calculate_rb_efficiency_3wk_avg function to use yards_per_touch instead of yards_per_carry and yards_per_target_rb
-- Uses the most recent 3 weeks where the player actually played (not necessarily consecutive weeks)
-- This ensures accurate averages when players skip weeks (e.g., injuries, byes)

CREATE OR REPLACE FUNCTION calculate_rb_efficiency_3wk_avg(
  p_season_year INT,
  p_week INT,
  p_start_week INT
)
RETURNS VOID AS $$
BEGIN
  -- Update all player_stats records for the current week with their 3-week rolling averages
  UPDATE player_stats ps_current
  SET
    weighted_opportunity_3wk_avg = avg_data.weighted_opportunity_3wk_avg,
    touchdown_production_3wk_avg = avg_data.touchdown_production_3wk_avg,
    receiving_profile_3wk_avg = avg_data.receiving_profile_3wk_avg,
    yards_per_touch_3wk_avg = avg_data.yards_per_touch_3wk_avg
  FROM (
    SELECT
      ps.player_id,
      ps.season_year,
      ps.week,
      -- Calculate averages from the most recent 3 weeks where the player played
      AVG(recent_weeks.weighted_opportunity) FILTER (WHERE recent_weeks.weighted_opportunity IS NOT NULL) AS weighted_opportunity_3wk_avg,
      AVG(recent_weeks.touchdown_production) FILTER (WHERE recent_weeks.touchdown_production IS NOT NULL) AS touchdown_production_3wk_avg,
      AVG(recent_weeks.receiving_profile) FILTER (WHERE recent_weeks.receiving_profile IS NOT NULL) AS receiving_profile_3wk_avg,
      AVG(recent_weeks.yards_per_touch) FILTER (WHERE recent_weeks.yards_per_touch IS NOT NULL) AS yards_per_touch_3wk_avg
    FROM player_stats ps
    -- Get the most recent 3 weeks where the player played (up to and including current week)
    CROSS JOIN LATERAL (
      SELECT
        ps_window.weighted_opportunity,
        ps_window.touchdown_production,
        ps_window.receiving_profile,
        ps_window.yards_per_touch
      FROM player_stats ps_window
      WHERE ps_window.player_id = ps.player_id
        AND ps_window.season_year = ps.season_year
        AND ps_window.source = 'actual'
        AND ps_window.played = true
        AND ps_window.week <= ps.week
      ORDER BY ps_window.week DESC
      LIMIT 3
    ) recent_weeks
    WHERE ps.season_year = p_season_year
      AND ps.week = p_week
      AND ps.source = 'actual'
    GROUP BY ps.player_id, ps.season_year, ps.week
  ) avg_data
  WHERE ps_current.player_id = avg_data.player_id
    AND ps_current.season_year = avg_data.season_year
    AND ps_current.week = avg_data.week
    AND ps_current.source = 'actual';
END;
$$ LANGUAGE plpgsql;

-- Update comment for documentation
COMMENT ON FUNCTION calculate_rb_efficiency_3wk_avg IS 'Calculates 3-week rolling averages for RB efficiency metrics (weighted_opportunity, touchdown_production, receiving_profile, yards_per_touch) for all players in a given week. Only includes weeks where the player actually played (played = true), using the most recent 3 weeks where the player played up to and including the current week.';

