-- Add receiving_touchdowns 3-week average columns to player_stats table
-- These are used for TE efficiency metrics

ALTER TABLE player_stats
ADD COLUMN IF NOT EXISTS receiving_touchdowns_3wk_avg NUMERIC,
ADD COLUMN IF NOT EXISTS receiving_touchdowns_3wk_avg_norm NUMERIC;

-- Add comments for documentation
COMMENT ON COLUMN player_stats.receiving_touchdowns_3wk_avg IS '3-week rolling average of receiving touchdowns (for TE efficiency metrics)';
COMMENT ON COLUMN player_stats.receiving_touchdowns_3wk_avg_norm IS 'Globally normalized 3-week rolling average of receiving touchdowns (0-1 scale, normalized across all TEs)';

-- Update calculate_efficiency_3wk_avg function to also calculate receiving_touchdowns_3wk_avg
-- This is used for both WR and TE efficiency metrics
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
    yards_per_target_3wk_avg = avg_data.yards_per_target_3wk_avg,
    receiving_touchdowns_3wk_avg = avg_data.receiving_touchdowns_3wk_avg
  FROM (
    SELECT
      ps.player_id,
      ps.season_year,
      ps.week,
      -- Calculate averages from the most recent 3 weeks where the player played
      AVG(recent_weeks.targets_per_game) FILTER (WHERE recent_weeks.targets_per_game IS NOT NULL) AS targets_per_game_3wk_avg,
      AVG(recent_weeks.catch_rate) FILTER (WHERE recent_weeks.catch_rate IS NOT NULL) AS catch_rate_3wk_avg,
      AVG(recent_weeks.yards_per_target) FILTER (WHERE recent_weeks.yards_per_target IS NOT NULL) AS yards_per_target_3wk_avg,
      AVG(recent_weeks.receiving_touchdowns) FILTER (WHERE recent_weeks.receiving_touchdowns IS NOT NULL) AS receiving_touchdowns_3wk_avg
    FROM player_stats ps
    -- Get the most recent 3 weeks where the player played (up to and including current week)
    CROSS JOIN LATERAL (
      SELECT
        ps_window.targets_per_game,
        ps_window.catch_rate,
        ps_window.yards_per_target,
        ps_window.receiving_touchdowns
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
COMMENT ON FUNCTION calculate_efficiency_3wk_avg IS 'Calculates 3-week rolling averages for efficiency metrics (targets_per_game, catch_rate, yards_per_target, receiving_touchdowns) for all players in a given week. Only includes weeks where the player actually played (played = true), using the most recent 3 weeks where the player played up to and including the current week.';

