-- Update calculate_efficiency_3wk_avg function to only include weeks where player played
-- Uses the most recent 3 weeks where the player actually played (not necessarily consecutive weeks)
-- This ensures accurate averages when players skip weeks (e.g., injuries, byes)

CREATE OR REPLACE FUNCTION calculate_efficiency_3wk_avg(
  p_season_year INT,
  p_week INT,
  p_start_week INT
)
RETURNS VOID AS $$
BEGIN
  -- Update all player_stats records for the current week with their 3-week rolling averages
  UPDATE player_stats ps_current
  SET
    targets_per_game_3wk_avg = avg_data.targets_per_game_3wk_avg,
    catch_rate_3wk_avg = avg_data.catch_rate_3wk_avg,
    yards_per_target_3wk_avg = avg_data.yards_per_target_3wk_avg
  FROM (
    SELECT
      ps.player_id,
      ps.season_year,
      ps.week,
      -- Calculate averages from the most recent 3 weeks where the player played
      AVG(recent_weeks.targets_per_game) FILTER (WHERE recent_weeks.targets_per_game IS NOT NULL) AS targets_per_game_3wk_avg,
      AVG(recent_weeks.catch_rate) FILTER (WHERE recent_weeks.catch_rate IS NOT NULL) AS catch_rate_3wk_avg,
      AVG(recent_weeks.yards_per_target) FILTER (WHERE recent_weeks.yards_per_target IS NOT NULL) AS yards_per_target_3wk_avg
    FROM player_stats ps
    -- Get the most recent 3 weeks where the player played (up to and including current week)
    CROSS JOIN LATERAL (
      SELECT
        ps_window.targets_per_game,
        ps_window.catch_rate,
        ps_window.yards_per_target
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
COMMENT ON FUNCTION calculate_efficiency_3wk_avg IS 'Calculates 3-week rolling averages for efficiency metrics (targets_per_game, catch_rate, yards_per_target) for all players in a given week. Only includes weeks where the player actually played (played = true), using the most recent 3 weeks where the player played up to and including the current week.';

