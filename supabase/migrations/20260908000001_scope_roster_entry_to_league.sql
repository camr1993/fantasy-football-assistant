-- Scope roster entries to a league instead of globally to a player.
--
-- roster_entry previously carried UNIQUE(player_id), which allowed a player to
-- occupy exactly one row across every team, league and season. Because the
-- roster syncs upsert with onConflict: 'player_id', syncing one league would
-- MOVE a shared player's row rather than insert a new one - silently dropping
-- him from the other league's roster. Yahoo issues a new league key each
-- season, so league_id also carries the season and no separate column is
-- needed.

ALTER TABLE roster_entry
  ADD COLUMN IF NOT EXISTS league_id UUID REFERENCES leagues(id) ON DELETE CASCADE;

-- Backfill from the owning team
UPDATE roster_entry re
SET league_id = t.league_id
FROM teams t
WHERE re.team_id = t.id
  AND re.league_id IS NULL;

-- Drop entries whose team no longer exists; they are unreachable either way
DELETE FROM roster_entry WHERE league_id IS NULL;

ALTER TABLE roster_entry ALTER COLUMN league_id SET NOT NULL;

-- Replace the global player constraint with a per-league one. This still
-- prevents duplicates within a team and additionally prevents the same player
-- being rostered by two teams in the same league.
ALTER TABLE roster_entry DROP CONSTRAINT IF EXISTS roster_entry_player_id_key;

ALTER TABLE roster_entry
  ADD CONSTRAINT roster_entry_league_id_player_id_key UNIQUE(league_id, player_id);

CREATE INDEX IF NOT EXISTS idx_roster_entry_league_id ON roster_entry(league_id);

COMMENT ON COLUMN roster_entry.league_id IS
  'Denormalized from teams.league_id so a player can be rostered once per league (and therefore once per season)';
