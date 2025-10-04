-- Update player_stats table to have individual stat fields instead of JSONB
-- This creates a master table that's not tied to any specific league

-- First, create the new stat_definitions table
CREATE TABLE stat_definitions (
  stat_id INT PRIMARY KEY,              -- Yahoo's ID (e.g. 4 = passing yards)
  name TEXT NOT NULL,                   -- e.g. "Passing Yards"
  player_stats_column TEXT,            -- e.g. "passing_yards" (nullable for advanced stats)
  category TEXT NOT NULL,              -- e.g. "passing", "rushing", "receiving", "kicking", "defense"
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create the league_stat_modifiers table for league-specific scoring
CREATE TABLE league_stat_modifiers (
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
  stat_id INT REFERENCES stat_definitions(stat_id) ON DELETE CASCADE,
  value NUMERIC NOT NULL,  -- e.g. 0.04 points per passing yard
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(league_id, stat_id)
);

-- Add new stat columns to player_stats table
-- Passing
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS passing_yards INT DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS passing_touchdowns INT DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS interceptions INT DEFAULT 0;

-- Rushing
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS rushing_yards INT DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS rushing_touchdowns INT DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS fumbles_lost INT DEFAULT 0;

-- Receiving
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS receptions INT DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS receiving_yards INT DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS receiving_touchdowns INT DEFAULT 0;

-- Returns
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS return_touchdowns INT DEFAULT 0;

-- Misc
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS two_point_conversions INT DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS offensive_fumble_return_td INT DEFAULT 0;

-- Kicking
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS fg_made_0_19 INT DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS fg_made_20_29 INT DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS fg_made_30_39 INT DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS fg_made_40_49 INT DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS fg_made_50_plus INT DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS fg_missed_0_19 INT DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS fg_missed_20_29 INT DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS pat_made INT DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS pat_missed INT DEFAULT 0;

-- Defense
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS points_allowed INT DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS sacks INT DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS defensive_int INT DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS fumble_recoveries INT DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS defensive_touchdowns INT DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS safeties INT DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS block_kicks INT DEFAULT 0;

-- Points Allowed Ranges (mutually exclusive)
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS points_allowed_0 INT DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS points_allowed_1_6 INT DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS points_allowed_7_13 INT DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS points_allowed_14_20 INT DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS points_allowed_21_27 INT DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS points_allowed_28_34 INT DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS points_allowed_35_plus INT DEFAULT 0;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_player_stats_player_season_week
  ON player_stats(player_id, season_year, week);

CREATE INDEX IF NOT EXISTS idx_league_stat_modifiers_league_id
  ON league_stat_modifiers(league_id);

CREATE INDEX IF NOT EXISTS idx_league_stat_modifiers_stat_id
  ON league_stat_modifiers(stat_id);

-- Add comments for documentation
COMMENT ON TABLE stat_definitions IS 'Master table mapping Yahoo stat IDs to database columns';
COMMENT ON TABLE league_stat_modifiers IS 'League-specific scoring modifiers for each stat';
COMMENT ON TABLE player_stats IS 'Master player stats table with individual stat columns (not league-specific)';

COMMENT ON COLUMN stat_definitions.stat_id IS 'Yahoo Fantasy Sports stat ID';
COMMENT ON COLUMN stat_definitions.player_stats_column IS 'Corresponding column name in player_stats table';
COMMENT ON COLUMN league_stat_modifiers.value IS 'Points per unit of this stat for this league';
