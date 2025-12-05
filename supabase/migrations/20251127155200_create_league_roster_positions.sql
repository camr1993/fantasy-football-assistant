-- Create league_roster_positions table to store roster position requirements per league
-- This allows each league to have different starting lineup requirements

CREATE TABLE league_roster_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE NOT NULL,
  position TEXT NOT NULL, -- e.g., "QB", "RB", "WR", "TE", "W/R/T", "K", "DEF", "BN"
  count INT NOT NULL, -- Number of starting slots for this position
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(league_id, position)
);

-- Create index for efficient querying
CREATE INDEX idx_league_roster_positions_league_id ON league_roster_positions(league_id);

-- Add comments for documentation
COMMENT ON TABLE league_roster_positions IS 'Stores roster position requirements for each league (e.g., 2 RB, 3 WR, 1 FLEX)';
COMMENT ON COLUMN league_roster_positions.position IS 'Position abbreviation (QB, RB, WR, TE, W/R/T, K, DEF, BN)';
COMMENT ON COLUMN league_roster_positions.count IS 'Number of starting slots required for this position';

