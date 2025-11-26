-- Create SQL function to calculate 3-week rolling averages for QB efficiency metrics
-- Uses the most recent 3 weeks where the player actually played (not necessarily consecutive weeks)
-- This ensures accurate averages when players skip weeks (e.g., injuries, byes)

CREATE OR REPLACE FUNCTION calculate_qb_efficiency_3wk_avg(
  p_season_year INT,
  p_week INT,
  p_start_week INT
)
RETURNS VOID AS $$
BEGIN
  -- Update all player_stats records for the current week with their 3-week rolling averages
  UPDATE player_stats ps_current
  SET
    passing_efficiency_3wk_avg = avg_data.passing_efficiency_3wk_avg,
    turnovers_3wk_avg = avg_data.turnovers_3wk_avg,
    rushing_upside_3wk_avg = avg_data.rushing_upside_3wk_avg
  FROM (
    SELECT
      ps.player_id,
      ps.season_year,
      ps.week,
      -- Calculate averages from the most recent 3 weeks where the player played
      AVG(recent_weeks.passing_efficiency) FILTER (WHERE recent_weeks.passing_efficiency IS NOT NULL) AS passing_efficiency_3wk_avg,
      AVG(recent_weeks.turnovers) FILTER (WHERE recent_weeks.turnovers IS NOT NULL) AS turnovers_3wk_avg,
      AVG(recent_weeks.rushing_upside) FILTER (WHERE recent_weeks.rushing_upside IS NOT NULL) AS rushing_upside_3wk_avg
    FROM player_stats ps
    -- Get the most recent 3 weeks where the player played (up to and including current week)
    CROSS JOIN LATERAL (
      SELECT
        ps_window.passing_efficiency,
        ps_window.turnovers,
        ps_window.rushing_upside
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

-- Add comment for documentation
COMMENT ON FUNCTION calculate_qb_efficiency_3wk_avg IS 'Calculates 3-week rolling averages for QB efficiency metrics (passing_efficiency, turnovers, rushing_upside) for all players in a given week. Only includes weeks where the player actually played (played = true), using the most recent 3 weeks where the player played up to and including the current week.';

