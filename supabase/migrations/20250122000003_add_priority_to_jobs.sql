-- Add priority column to jobs table for job prioritization
ALTER TABLE jobs ADD COLUMN priority INTEGER DEFAULT 100;

-- Add index for efficient querying by priority
CREATE INDEX IF NOT EXISTS idx_jobs_priority ON jobs(priority);

-- Update job_history table to include priority as well
ALTER TABLE job_history ADD COLUMN priority INTEGER;

-- Create index for job_history priority
CREATE INDEX IF NOT EXISTS idx_job_history_priority ON job_history(priority);

-- Update the move_job_to_history function to include priority
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
      user_id,
      priority,
      started_at,
      completed_at,
      error_message
    ) VALUES (
      NEW.id,
      NEW.name,
      NEW.status,
      NEW.week,
      NEW.user_id,
      NEW.priority,
      OLD.created_at, -- Use created_at as started_at approximation
      NEW.updated_at,
      NEW.error_message
    );

    -- Delete the job from the main table
    DELETE FROM jobs WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
