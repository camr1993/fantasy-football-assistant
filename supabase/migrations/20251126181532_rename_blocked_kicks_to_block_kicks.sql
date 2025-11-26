-- Rename blocked_kicks columns to block_kicks to match the existing raw stat column name
-- This migration fixes the column naming to be consistent with the block_kicks column

-- Rename the 3-week average column
ALTER TABLE player_stats
RENAME COLUMN blocked_kicks_3wk_avg TO block_kicks_3wk_avg;

-- Rename the normalized 3-week average column
ALTER TABLE player_stats
RENAME COLUMN blocked_kicks_3wk_avg_norm TO block_kicks_3wk_avg_norm;

-- Update comments
COMMENT ON COLUMN player_stats.block_kicks_3wk_avg IS '3-week rolling average of blocked kicks';
COMMENT ON COLUMN player_stats.block_kicks_3wk_avg_norm IS 'Globally normalized 3-week rolling average of blocked kicks (0-1 scale, normalized across all DEFs)';

-- Update the SQL function to use the correct column names
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
    block_kicks_3wk_avg = avg_data.block_kicks_3wk_avg,
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
      AVG(recent_weeks.block_kicks) FILTER (WHERE recent_weeks.block_kicks IS NOT NULL) AS block_kicks_3wk_avg,
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
        ps_window.block_kicks,
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

-- Update function comment
COMMENT ON FUNCTION calculate_def_efficiency_3wk_avg IS 'Calculates 3-week rolling averages for DEF efficiency metrics (sacks_per_game, turnovers_forced, dst_tds, points_allowed, yards_allowed, block_kicks, safeties) for all players in a given week. Only includes weeks where the player actually played (played = true), using the most recent 3 weeks where the player played up to and including the current week.';

