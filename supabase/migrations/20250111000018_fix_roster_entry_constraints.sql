-- Fix roster_entry table constraints to only prevent player_id duplicates
-- Players can only be on one team, but teams can have multiple players in same slot (e.g., multiple bench players)

-- Drop the existing unique constraint on team_id and slot
ALTER TABLE roster_entry DROP CONSTRAINT IF EXISTS roster_entry_team_id_slot_key;

-- Add unique constraint only on player_id (a player can only be on one team)
ALTER TABLE roster_entry ADD CONSTRAINT roster_entry_player_id_key UNIQUE(player_id);

-- Create index on team_id and slot for better query performance (but not unique)
CREATE INDEX IF NOT EXISTS idx_roster_entry_team_slot ON roster_entry(team_id, slot);
