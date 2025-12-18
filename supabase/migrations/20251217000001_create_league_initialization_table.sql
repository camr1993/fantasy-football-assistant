-- Create league_initialization table to track first-time user setup progress
CREATE TABLE IF NOT EXISTS league_initialization (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'ready', 'error')),
  total_jobs INTEGER NOT NULL DEFAULT 0,
  completed_jobs INTEGER NOT NULL DEFAULT 0,
  current_step TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(league_id, user_id)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_league_initialization_user_id ON league_initialization(user_id);
CREATE INDEX IF NOT EXISTS idx_league_initialization_status ON league_initialization(status);
CREATE INDEX IF NOT EXISTS idx_league_initialization_league_user ON league_initialization(league_id, user_id);

-- Create function to update completed_jobs count when jobs complete
-- This is triggered by job completion and updates the initialization status
CREATE OR REPLACE FUNCTION update_league_initialization_progress()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  v_job_name TEXT;
  v_init_record RECORD;
BEGIN
  -- Only process jobs that just completed
  IF NEW.status = 'completed' AND OLD.status = 'running' THEN
    v_user_id := NEW.user_id;
    v_job_name := NEW.name;

    -- Check if this is a league initialization related job
    IF v_user_id IS NOT NULL AND v_job_name IN (
      'fantasy-points-calc-all-weeks',
      'sync-defense-points-against-all-weeks',
      'sync-team-offensive-stats-all-weeks',
      'league-calcs-all-weeks'
    ) THEN
      -- Update progress for all initialization records for this user
      UPDATE league_initialization
      SET
        completed_jobs = completed_jobs + 1,
        current_step = CASE
          WHEN v_job_name = 'fantasy-points-calc-all-weeks' THEN 'Fantasy points calculated'
          WHEN v_job_name = 'sync-defense-points-against-all-weeks' THEN 'Defense stats processed'
          WHEN v_job_name = 'sync-team-offensive-stats-all-weeks' THEN 'Team offensive stats processed'
          WHEN v_job_name = 'league-calcs-all-weeks' THEN 'League calculations complete'
          ELSE current_step
        END,
        updated_at = NOW()
      WHERE user_id = v_user_id AND status = 'in_progress';

      -- Check if all jobs are complete and update status to 'ready'
      FOR v_init_record IN
        SELECT id, completed_jobs, total_jobs
        FROM league_initialization
        WHERE user_id = v_user_id AND status = 'in_progress'
      LOOP
        IF v_init_record.completed_jobs >= v_init_record.total_jobs THEN
          UPDATE league_initialization
          SET status = 'ready', current_step = 'All data ready!', updated_at = NOW()
          WHERE id = v_init_record.id;
        END IF;
      END LOOP;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on jobs table (runs before the move_job_to_history trigger)
DROP TRIGGER IF EXISTS trigger_update_league_initialization_progress ON jobs;
CREATE TRIGGER trigger_update_league_initialization_progress
  BEFORE UPDATE ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_league_initialization_progress();

-- Add comment for documentation
COMMENT ON TABLE league_initialization IS 'Tracks the initialization progress for first-time users in a league. Used to show loading progress while data is being synced.';

