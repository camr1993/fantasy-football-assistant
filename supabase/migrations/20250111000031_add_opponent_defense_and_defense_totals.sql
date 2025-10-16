-- Add opponent_defense_player_id field to player_stats table
-- Create defense_season_totals table for tracking points allowed by position

-- Add opponent_defense_player_id field to player_stats table
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS opponent_defense_player_id UUID REFERENCES players(id);

-- Create defense_points_against table
CREATE TABLE defense_points_against (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  season_year INT NOT NULL,
  week INT NOT NULL,
  QB_pts_against NUMERIC DEFAULT 0,
  RB_pts_against NUMERIC DEFAULT 0,
  WR_pts_against NUMERIC DEFAULT 0,
  TE_pts_against NUMERIC DEFAULT 0,
  K_pts_against NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(league_id, player_id, season_year, week)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_player_stats_opponent_defense
  ON player_stats(opponent_defense_player_id);

CREATE INDEX IF NOT EXISTS idx_defense_points_against_league_player_season_week
  ON defense_points_against(league_id, player_id, season_year, week);

-- Add comments for documentation
COMMENT ON TABLE defense_points_against IS 'Tracks weekly fantasy points allowed by defense players against each position per league';
COMMENT ON COLUMN player_stats.opponent_defense_player_id IS 'The defense player that the current player faced';
COMMENT ON COLUMN defense_points_against.league_id IS 'Reference to the league this calculation is for';
COMMENT ON COLUMN defense_points_against.QB_pts_against IS 'Weekly fantasy points allowed to QB position';
COMMENT ON COLUMN defense_points_against.RB_pts_against IS 'Weekly fantasy points allowed to RB position';
COMMENT ON COLUMN defense_points_against.WR_pts_against IS 'Weekly fantasy points allowed to WR position';
COMMENT ON COLUMN defense_points_against.TE_pts_against IS 'Weekly fantasy points allowed to TE position';
COMMENT ON COLUMN defense_points_against.K_pts_against IS 'Weekly fantasy points allowed to K position';
