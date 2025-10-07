-- Update player_injuries unique constraint to allow multiple records per player over time
-- This enables historical injury tracking where the same player can have multiple injury records

-- Drop the old unique constraint first
ALTER TABLE player_injuries DROP CONSTRAINT IF EXISTS player_injuries_player_id_season_year_week_report_date_key;
ALTER TABLE player_injuries DROP CONSTRAINT IF EXISTS player_injuries_player_id_key;

-- Add new unique constraint on player_id and created_at (allows multiple records per player)
ALTER TABLE player_injuries ADD CONSTRAINT player_injuries_player_id_created_at_key UNIQUE (player_id, created_at);
