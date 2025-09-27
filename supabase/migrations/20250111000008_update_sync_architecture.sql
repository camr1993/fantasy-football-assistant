-- Update sync architecture to support different cadences and better tracking

-- Make user_id nullable in teams table for teams where user hasn't logged in
ALTER TABLE teams ALTER COLUMN user_id DROP NOT NULL;

-- Add sync tracking tables
CREATE TABLE sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type TEXT NOT NULL, -- 'weekly_players', 'daily_injuries', 'user_login', 'transactions'
  league_id UUID REFERENCES leagues(id),
  user_id UUID REFERENCES user_profiles(id),
  status TEXT NOT NULL, -- 'started', 'completed', 'failed'
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  records_processed INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add last sync timestamps to leagues (only for transaction sync)
ALTER TABLE leagues ADD COLUMN last_transaction_sync TIMESTAMPTZ;

-- Add last sync timestamps to players
ALTER TABLE players ADD COLUMN last_updated TIMESTAMPTZ DEFAULT NOW();

-- Add last sync timestamps to player_injuries
ALTER TABLE player_injuries ADD COLUMN last_updated TIMESTAMPTZ DEFAULT NOW();

-- Add transaction tracking to waiver_wire
ALTER TABLE waiver_wire ADD COLUMN transaction_id TEXT;
ALTER TABLE waiver_wire ADD COLUMN transaction_date TIMESTAMPTZ;
ALTER TABLE waiver_wire ADD COLUMN last_updated TIMESTAMPTZ DEFAULT NOW();

-- Add indexes for better performance
CREATE INDEX idx_sync_logs_type ON sync_logs(sync_type);
CREATE INDEX idx_sync_logs_league_id ON sync_logs(league_id);
CREATE INDEX idx_sync_logs_user_id ON sync_logs(user_id);
CREATE INDEX idx_sync_logs_status ON sync_logs(status);
CREATE INDEX idx_leagues_last_transaction_sync ON leagues(last_transaction_sync);
CREATE INDEX idx_players_last_updated ON players(last_updated);
CREATE INDEX idx_player_injuries_last_updated ON player_injuries(last_updated);
CREATE INDEX idx_waiver_wire_transaction_date ON waiver_wire(transaction_date);

-- Add function to log sync operations
CREATE OR REPLACE FUNCTION log_sync_operation(
  p_sync_type TEXT,
  p_status TEXT,
  p_league_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL,
  p_records_processed INT DEFAULT 0
)
RETURNS UUID AS $$
DECLARE
  sync_log_id UUID;
BEGIN
  INSERT INTO sync_logs (sync_type, league_id, user_id, status, error_message, records_processed)
  VALUES (p_sync_type, p_league_id, p_user_id, p_status, p_error_message, p_records_processed)
  RETURNING id INTO sync_log_id;

  -- Update completed_at if status is completed or failed
  IF p_status IN ('completed', 'failed') THEN
    UPDATE sync_logs
    SET completed_at = NOW()
    WHERE id = sync_log_id;
  END IF;

  RETURN sync_log_id;
END;
$$ LANGUAGE plpgsql;
