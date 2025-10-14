-- Create league_calcs table to store league-specific fantasy point calculations
-- This table stores calculated fantasy points for each player in each league for each week

CREATE TABLE league_calcs (
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  season_year INT NOT NULL,
  week INT NOT NULL,
  fantasy_points NUMERIC NOT NULL DEFAULT 0,
  weighted_score NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (league_id, player_id, season_year, week)
);

-- Create indexes for better query performance
CREATE INDEX idx_league_calcs_league_season_week ON league_calcs(league_id, season_year, week);
CREATE INDEX idx_league_calcs_player_season ON league_calcs(player_id, season_year);
CREATE INDEX idx_league_calcs_fantasy_points ON league_calcs(fantasy_points DESC);

-- Add comments for documentation
COMMENT ON TABLE league_calcs IS 'League-specific fantasy point calculations for each player per week';
COMMENT ON COLUMN league_calcs.fantasy_points IS 'Calculated fantasy points using league-specific scoring modifiers';
COMMENT ON COLUMN league_calcs.weighted_score IS 'Future use: weighted score based on opponent strength, etc.';
COMMENT ON COLUMN league_calcs.league_id IS 'Reference to the league this calculation is for';
COMMENT ON COLUMN league_calcs.player_id IS 'Reference to the player this calculation is for';
COMMENT ON COLUMN league_calcs.season_year IS 'NFL season year (e.g., 2024)';
COMMENT ON COLUMN league_calcs.week IS 'Week number (1-18)';

