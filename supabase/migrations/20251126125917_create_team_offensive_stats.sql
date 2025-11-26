-- Create team_offensive_stats table to track offensive fantasy points per NFL team
-- This is used to calculate offensive difficulty index for DEF position evaluation

CREATE TABLE team_offensive_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
  nfl_team TEXT NOT NULL,  -- e.g., "KC", "BUF" (from players.team)
  season_year INT NOT NULL,
  week INT NOT NULL,
  offensive_fantasy_points NUMERIC DEFAULT 0,  -- Sum of all offensive players' fantasy points for this team/week
  offensive_fantasy_points_3wk_avg NUMERIC,  -- 3-week rolling average
  offensive_difficulty_index NUMERIC,  -- Normalized z-score value
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(league_id, nfl_team, season_year, week)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_team_offensive_stats_league_season_week
  ON team_offensive_stats(league_id, season_year, week);

CREATE INDEX IF NOT EXISTS idx_team_offensive_stats_nfl_team
  ON team_offensive_stats(nfl_team);

CREATE INDEX IF NOT EXISTS idx_team_offensive_stats_league_team_season_week
  ON team_offensive_stats(league_id, nfl_team, season_year, week);

-- Add comments for documentation
COMMENT ON TABLE team_offensive_stats IS 'Tracks weekly offensive fantasy points per NFL team per league, used for calculating offensive difficulty index for DEF position';
COMMENT ON COLUMN team_offensive_stats.nfl_team IS 'NFL team abbreviation (e.g., KC, BUF) from players.team';
COMMENT ON COLUMN team_offensive_stats.offensive_fantasy_points IS 'Sum of fantasy points from all offensive players (QB, RB, WR, TE, K) for this NFL team in this week';
COMMENT ON COLUMN team_offensive_stats.offensive_fantasy_points_3wk_avg IS '3-week rolling average of offensive fantasy points';
COMMENT ON COLUMN team_offensive_stats.offensive_difficulty_index IS 'Z-score normalized offensive difficulty index (higher = harder to defend against)';

-- Function to calculate weekly offensive fantasy points per team
CREATE OR REPLACE FUNCTION calculate_team_offensive_points(
  p_league_id UUID,
  p_season_year INT,
  p_week INT
)
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  -- Calculate and upsert offensive fantasy points per NFL team
  INSERT INTO team_offensive_stats (
    league_id,
    nfl_team,
    season_year,
    week,
    offensive_fantasy_points,
    updated_at
  )
  SELECT
    p_league_id as league_id,
    p.team as nfl_team,
    p_season_year as season_year,
    p_week as week,
    COALESCE(SUM(lc.fantasy_points), 0) as offensive_fantasy_points,
    NOW() as updated_at
  FROM players p
  INNER JOIN league_calcs lc
    ON lc.player_id = p.id
    AND lc.league_id = p_league_id
    AND lc.season_year = p_season_year
    AND lc.week = p_week
  INNER JOIN player_stats ps
    ON ps.player_id = p.id
    AND ps.season_year = p_season_year
    AND ps.week = p_week
    AND ps.source = 'actual'
    AND ps.played = true
  WHERE p.team IS NOT NULL
    AND p.position IN ('QB', 'RB', 'WR', 'TE', 'K')  -- Offensive positions only, exclude DEF
  GROUP BY p.team
  ON CONFLICT (league_id, nfl_team, season_year, week)
  DO UPDATE SET
    offensive_fantasy_points = EXCLUDED.offensive_fantasy_points,
    updated_at = EXCLUDED.updated_at;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_team_offensive_points IS 'Calculates and stores weekly offensive fantasy points per NFL team for a given league, week, and season';

-- Function to calculate 3-week rolling averages for offensive points
CREATE OR REPLACE FUNCTION calculate_team_offensive_3wk_avg(
  p_league_id UUID,
  p_season_year INT,
  p_week INT
)
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  -- Update all team_offensive_stats records for the current week with their 3-week rolling averages
  UPDATE team_offensive_stats tos_current
  SET
    offensive_fantasy_points_3wk_avg = avg_data.offensive_fantasy_points_3wk_avg,
    updated_at = NOW()
  FROM (
    SELECT
      tos.league_id,
      tos.nfl_team,
      tos.season_year,
      tos.week,
      -- Calculate average for the 3-week window ending at this week
      AVG(tos_window.offensive_fantasy_points) FILTER (
        WHERE tos_window.offensive_fantasy_points IS NOT NULL
      ) AS offensive_fantasy_points_3wk_avg
    FROM team_offensive_stats tos
    -- Join with the 3-week window of data
    INNER JOIN team_offensive_stats tos_window
      ON tos_window.league_id = tos.league_id
      AND tos_window.nfl_team = tos.nfl_team
      AND tos_window.season_year = tos.season_year
      AND tos_window.week >= GREATEST(1, tos.week - 2)
      AND tos_window.week <= tos.week
    WHERE tos.league_id = p_league_id
      AND tos.season_year = p_season_year
      AND tos.week = p_week
    GROUP BY tos.league_id, tos.nfl_team, tos.season_year, tos.week
  ) avg_data
  WHERE tos_current.league_id = avg_data.league_id
    AND tos_current.nfl_team = avg_data.nfl_team
    AND tos_current.season_year = avg_data.season_year
    AND tos_current.week = avg_data.week;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_team_offensive_3wk_avg IS 'Calculates 3-week rolling averages for offensive fantasy points per NFL team';

-- Function to normalize offensive difficulty index using z-scores
CREATE OR REPLACE FUNCTION normalize_offensive_difficulty_index(
  p_league_id UUID,
  p_season_year INT,
  p_week INT
)
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  -- Calculate normalized values using z-score: (x - mean) / std
  WITH stats_with_aggregates AS (
    SELECT
      tos.league_id,
      tos.nfl_team,
      tos.season_year,
      tos.week,
      tos.offensive_fantasy_points_3wk_avg,
      -- Calculate mean and std for z-score normalization
      AVG(tos.offensive_fantasy_points_3wk_avg) OVER (
        PARTITION BY tos.league_id, tos.season_year, tos.week
      ) AS avg_mean,
      STDDEV(tos.offensive_fantasy_points_3wk_avg) OVER (
        PARTITION BY tos.league_id, tos.season_year, tos.week
      ) AS avg_stddev
    FROM team_offensive_stats tos
    WHERE tos.league_id = p_league_id
      AND tos.season_year = p_season_year
      AND tos.week = p_week
      AND tos.offensive_fantasy_points_3wk_avg IS NOT NULL
  ),
  normalized_stats AS (
    SELECT
      league_id,
      nfl_team,
      season_year,
      week,
      -- Normalize using z-score: (x - mean) / std
      CASE
        WHEN avg_stddev > 0 THEN
          ROUND(
            ((offensive_fantasy_points_3wk_avg - avg_mean)::NUMERIC / avg_stddev)::NUMERIC,
            3
          )
        ELSE 0
      END AS offensive_difficulty_index
    FROM stats_with_aggregates
  )
  UPDATE team_offensive_stats tos
  SET
    offensive_difficulty_index = ns.offensive_difficulty_index,
    updated_at = NOW()
  FROM normalized_stats ns
  WHERE tos.league_id = ns.league_id
    AND tos.nfl_team = ns.nfl_team
    AND tos.season_year = ns.season_year
    AND tos.week = ns.week;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION normalize_offensive_difficulty_index IS 'Normalizes offensive difficulty index using z-score normalization (x - mean) / std for all teams in a league for a given week';

