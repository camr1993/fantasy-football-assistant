-- Add run_time column to jobs table to track execution time
ALTER TABLE jobs ADD COLUMN run_time INTEGER;

-- Add run_time to job_history table
ALTER TABLE job_history ADD COLUMN run_time INTEGER;

-- Update the move_job_to_history function to include run_time
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
      run_time,
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
      NEW.run_time,
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
