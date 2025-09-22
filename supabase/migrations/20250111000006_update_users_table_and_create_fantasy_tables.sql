-- Create a user profiles table to extend auth.users with fantasy-specific data
-- Drop existing users table if it exists
DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE userProfiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create leagues table
CREATE TABLE leagues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yahoo_league_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  season_year INT NOT NULL,
  scoring_type TEXT, -- PPR, half-PPR, standard
  roster_positions JSONB, -- e.g. { "QB": 1, "RB": 2, "WR": 2, "FLEX": 1, "K": 1, "DEF": 1 }
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create teams table
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
  yahoo_team_id TEXT NOT NULL,
  user_id UUID REFERENCES userProfiles(id),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create players table
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yahoo_player_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  team TEXT, -- e.g. "KC"
  position TEXT, -- e.g. "RB"
  status TEXT, -- Active, IR, FA, etc.
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create player_stats table
CREATE TABLE player_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  season_year INT NOT NULL,
  week INT NOT NULL,
  source TEXT NOT NULL, -- 'actual' or 'projected'
  points NUMERIC NOT NULL,
  stats JSONB, -- raw stats (yards, receptions, etc.)
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(player_id, season_year, week, source)
);

-- Create roster_entry table
CREATE TABLE roster_entry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id),
  season_year INT NOT NULL,
  week INT NOT NULL,
  slot TEXT, -- QB, RB, WR, FLEX, BENCH, IR, etc.
  UNIQUE(team_id, season_year, week, slot)
);

-- Create waiver_wire table
CREATE TABLE waiver_wire (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id),
  week INT NOT NULL,
  available BOOLEAN NOT NULL,
  added_to_team_id UUID REFERENCES teams(id),
  dropped_from_team_id UUID REFERENCES teams(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create player_injuries table
CREATE TABLE player_injuries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  season_year INT NOT NULL,
  week INT NOT NULL,
  status TEXT NOT NULL,     -- "Questionable", "Out", "IR", "Healthy"
  notes TEXT,               -- extra detail from Yahoo API
  report_date DATE NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(player_id, season_year, week, report_date)
);

-- Create recommendations table
CREATE TABLE recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES userProfiles(id),
  league_id UUID REFERENCES leagues(id),
  week INT NOT NULL,
  category TEXT NOT NULL, -- 'lineup', 'waiver', 'trade', etc.
  message TEXT NOT NULL, -- human-readable tip
  data JSONB, -- supporting data (e.g. "bench WR_X for WR_Y, proj 15.3 vs 9.2")
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX idx_teams_league_id ON teams(league_id);
CREATE INDEX idx_teams_user_id ON teams(user_id);
CREATE INDEX idx_teams_yahoo_team_id ON teams(yahoo_team_id);
CREATE INDEX idx_players_yahoo_player_id ON players(yahoo_player_id);
CREATE INDEX idx_players_position ON players(position);
CREATE INDEX idx_player_stats_player_id ON player_stats(player_id);
CREATE INDEX idx_player_stats_season_week ON player_stats(season_year, week);
CREATE INDEX idx_roster_entry_team_id ON roster_entry(team_id);
CREATE INDEX idx_roster_entry_player_id ON roster_entry(player_id);
CREATE INDEX idx_waiver_wire_league_id ON waiver_wire(league_id);
CREATE INDEX idx_waiver_wire_player_id ON waiver_wire(player_id);
CREATE INDEX idx_player_injuries_player_id ON player_injuries(player_id);
CREATE INDEX idx_player_injuries_season_week ON player_injuries(season_year, week);
CREATE INDEX idx_recommendations_user_id ON recommendations(user_id);
CREATE INDEX idx_recommendations_league_id ON recommendations(league_id);
