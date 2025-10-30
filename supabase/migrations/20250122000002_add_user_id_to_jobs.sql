-- Add user_id column to jobs table for user-specific jobs
ALTER TABLE jobs ADD COLUMN user_id UUID REFERENCES user_profiles(id);

-- Add index for efficient querying by user_id
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);

-- Update job_history table to include user_id as well
ALTER TABLE job_history ADD COLUMN user_id UUID REFERENCES user_profiles(id);

-- Update the move_job_to_history function to include user_id
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
      started_at,
      completed_at,
      error_message
    ) VALUES (
      NEW.id,
      NEW.name,
      NEW.status,
      NEW.week,
      NEW.user_id,
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
