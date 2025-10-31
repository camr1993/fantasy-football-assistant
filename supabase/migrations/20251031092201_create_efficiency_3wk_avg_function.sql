-- Create SQL function to calculate 3-week rolling averages for efficiency metrics
-- This is much more efficient than calculating in application code

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
      -- Calculate averages for the 3-week window ending at this week
      AVG(ps_window.targets_per_game) FILTER (WHERE ps_window.targets_per_game IS NOT NULL) AS targets_per_game_3wk_avg,
      AVG(ps_window.catch_rate) FILTER (WHERE ps_window.catch_rate IS NOT NULL) AS catch_rate_3wk_avg,
      AVG(ps_window.yards_per_target) FILTER (WHERE ps_window.yards_per_target IS NOT NULL) AS yards_per_target_3wk_avg
    FROM player_stats ps
    -- Join with the 3-week window of data
    INNER JOIN player_stats ps_window
      ON ps_window.player_id = ps.player_id
      AND ps_window.season_year = ps.season_year
      AND ps_window.source = 'actual'
      AND ps_window.week >= GREATEST(1, ps.week - 2)
      AND ps_window.week <= ps.week
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
COMMENT ON FUNCTION calculate_efficiency_3wk_avg IS 'Calculates 3-week rolling averages for efficiency metrics (targets_per_game, catch_rate, yards_per_target) for all players in a given week';

