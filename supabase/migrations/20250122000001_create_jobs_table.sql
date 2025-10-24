-- Create jobs table for VM job management
CREATE TABLE IF NOT EXISTS jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  week INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create historical jobs table for completed jobs
CREATE TABLE IF NOT EXISTS job_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  week INTEGER,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_jobs_status_created ON jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_name ON jobs(name);
CREATE INDEX IF NOT EXISTS idx_job_history_job_id ON job_history(job_id);
CREATE INDEX IF NOT EXISTS idx_job_history_name ON job_history(name);

-- Create function to move completed jobs to history
CREATE OR REPLACE FUNCTION move_job_to_history()
RETURNS TRIGGER AS $$
BEGIN
  -- Only move jobs that are completed or failed
  IF NEW.status IN ('completed', 'failed') THEN
    INSERT INTO job_history (
      job_id,
      name,
      status,
      week,
      started_at,
      completed_at,
      error_message
    ) VALUES (
      NEW.id,
      NEW.name,
      NEW.status,
      NEW.week,
      OLD.created_at, -- Use created_at as started_at approximation
      NEW.updated_at,
      CASE WHEN NEW.status = 'failed' THEN 'Job failed' ELSE NULL END
    );

    -- Delete the job from the main table
    DELETE FROM jobs WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically move completed jobs to history
DROP TRIGGER IF EXISTS trigger_move_job_to_history ON jobs;
CREATE TRIGGER trigger_move_job_to_history
  AFTER UPDATE ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION move_job_to_history();
