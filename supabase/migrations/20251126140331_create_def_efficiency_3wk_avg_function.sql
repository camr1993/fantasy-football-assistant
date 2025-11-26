-- Create SQL function to calculate 3-week rolling averages for DEF efficiency metrics
-- Uses the most recent 3 weeks where the player actually played (not necessarily consecutive weeks)
-- This ensures accurate averages when players skip weeks (e.g., injuries, byes)

CREATE OR REPLACE FUNCTION calculate_def_efficiency_3wk_avg(
  p_season_year INT,
  p_week INT,
  p_start_week INT
)
RETURNS VOID AS $$
BEGIN
  -- Update all player_stats records for the current week with their 3-week rolling averages
  UPDATE player_stats ps_current
  SET
    sacks_per_game_3wk_avg = avg_data.sacks_per_game_3wk_avg,
    turnovers_forced_3wk_avg = avg_data.turnovers_forced_3wk_avg,
    dst_tds_3wk_avg = avg_data.dst_tds_3wk_avg,
    points_allowed_3wk_avg = avg_data.points_allowed_3wk_avg,
    yards_allowed_3wk_avg = avg_data.yards_allowed_3wk_avg,
    blocked_kicks_3wk_avg = avg_data.blocked_kicks_3wk_avg,
    safeties_3wk_avg = avg_data.safeties_3wk_avg
  FROM (
    SELECT
      ps.player_id,
      ps.season_year,
      ps.week,
      -- Calculate averages from the most recent 3 weeks where the player played
      AVG(recent_weeks.sacks_per_game) FILTER (WHERE recent_weeks.sacks_per_game IS NOT NULL) AS sacks_per_game_3wk_avg,
      AVG(recent_weeks.turnovers_forced) FILTER (WHERE recent_weeks.turnovers_forced IS NOT NULL) AS turnovers_forced_3wk_avg,
      AVG(recent_weeks.dst_tds) FILTER (WHERE recent_weeks.dst_tds IS NOT NULL) AS dst_tds_3wk_avg,
      AVG(recent_weeks.points_allowed) FILTER (WHERE recent_weeks.points_allowed IS NOT NULL) AS points_allowed_3wk_avg,
      AVG(recent_weeks.yards_allowed) FILTER (WHERE recent_weeks.yards_allowed IS NOT NULL) AS yards_allowed_3wk_avg,
      AVG(recent_weeks.blocked_kicks) FILTER (WHERE recent_weeks.blocked_kicks IS NOT NULL) AS blocked_kicks_3wk_avg,
      AVG(recent_weeks.safeties) FILTER (WHERE recent_weeks.safeties IS NOT NULL) AS safeties_3wk_avg
    FROM player_stats ps
    -- Get the most recent 3 weeks where the player played (up to and including current week)
    CROSS JOIN LATERAL (
      SELECT
        ps_window.sacks_per_game,
        ps_window.turnovers_forced,
        ps_window.dst_tds,
        ps_window.points_allowed,
        ps_window.yards_allowed,
        ps_window.blocked_kicks,
        ps_window.safeties
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
COMMENT ON FUNCTION calculate_def_efficiency_3wk_avg IS 'Calculates 3-week rolling averages for DEF efficiency metrics (sacks_per_game, turnovers_forced, dst_tds, points_allowed, yards_allowed, blocked_kicks, safeties) for all players in a given week. Only includes weeks where the player actually played (played = true), using the most recent 3 weeks where the player played up to and including the current week.';

