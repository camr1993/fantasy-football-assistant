-- Create SQL function to calculate 3-week rolling averages for K efficiency metrics
-- Uses the most recent 3 weeks where the player actually played (not necessarily consecutive weeks)
-- This ensures accurate averages when players skip weeks (e.g., injuries, byes)

CREATE OR REPLACE FUNCTION calculate_k_efficiency_3wk_avg(
  p_season_year INT,
  p_week INT,
  p_start_week INT
)
RETURNS VOID AS $$
BEGIN
  -- Update all player_stats records for the current week with their 3-week rolling averages
  UPDATE player_stats ps_current
  SET
    fg_profile_3wk_avg = avg_data.fg_profile_3wk_avg,
    fg_pat_misses_3wk_avg = avg_data.fg_pat_misses_3wk_avg,
    fg_attempts_3wk_avg = avg_data.fg_attempts_3wk_avg
  FROM (
    SELECT
      ps.player_id,
      ps.season_year,
      ps.week,
      -- Calculate averages from the most recent 3 weeks where the player played
      AVG(recent_weeks.fg_profile) FILTER (WHERE recent_weeks.fg_profile IS NOT NULL) AS fg_profile_3wk_avg,
      AVG(recent_weeks.fg_pat_misses) FILTER (WHERE recent_weeks.fg_pat_misses IS NOT NULL) AS fg_pat_misses_3wk_avg,
      AVG(recent_weeks.fg_attempts) FILTER (WHERE recent_weeks.fg_attempts IS NOT NULL) AS fg_attempts_3wk_avg
    FROM player_stats ps
    -- Get the most recent 3 weeks where the player played (up to and including current week)
    CROSS JOIN LATERAL (
      SELECT
        ps_window.fg_profile,
        ps_window.fg_pat_misses,
        ps_window.fg_attempts
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
COMMENT ON FUNCTION calculate_k_efficiency_3wk_avg IS 'Calculates 3-week rolling averages for K efficiency metrics (fg_profile, fg_pat_misses, fg_attempts) for all players in a given week. Only includes weeks where the player actually played (played = true), using the most recent 3 weeks where the player played up to and including the current week.';

