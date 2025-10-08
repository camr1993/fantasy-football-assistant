-- Update roster_entry table to remove season_year and week, add updated_at
-- This treats roster_entry as a snapshot of current roster rather than historical data

-- Drop the unique constraint that includes season_year and week
ALTER TABLE roster_entry DROP CONSTRAINT IF EXISTS roster_entry_team_id_season_year_week_slot_key;

-- Drop the columns we no longer need
ALTER TABLE roster_entry DROP COLUMN IF EXISTS season_year;
ALTER TABLE roster_entry DROP COLUMN IF EXISTS week;

-- Add updated_at column
ALTER TABLE roster_entry ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create new unique constraint for team_id and slot (since we're treating as current snapshot)
ALTER TABLE roster_entry ADD CONSTRAINT roster_entry_team_id_slot_key UNIQUE(team_id, slot);

-- Update the index to reflect the new structure
DROP INDEX IF EXISTS idx_roster_entry_team_id;
CREATE INDEX idx_roster_entry_team_id ON roster_entry(team_id);
CREATE INDEX idx_roster_entry_updated_at ON roster_entry(updated_at);
