-- Create nfl_matchups table
CREATE TABLE nfl_matchups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  season INT NOT NULL,
  week INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(home_team, away_team, season, week)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_nfl_matchups_season_week
  ON nfl_matchups(season, week);

CREATE INDEX IF NOT EXISTS idx_nfl_matchups_home_team
  ON nfl_matchups(home_team);

CREATE INDEX IF NOT EXISTS idx_nfl_matchups_away_team
  ON nfl_matchups(away_team);

-- Add comments for documentation
COMMENT ON TABLE nfl_matchups IS 'Stores NFL game matchups by week and season';
COMMENT ON COLUMN nfl_matchups.home_team IS 'Home team abbreviation (e.g., CIN, PIT)';
COMMENT ON COLUMN nfl_matchups.away_team IS 'Away team abbreviation (e.g., CIN, PIT)';
COMMENT ON COLUMN nfl_matchups.season IS 'NFL season year (e.g., 2025)';
COMMENT ON COLUMN nfl_matchups.week IS 'NFL week number (1-18)';
