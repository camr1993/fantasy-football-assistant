-- Ensure the move_job_to_history function correctly includes run_time
-- This migration re-applies the function to ensure it has run_time support

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
      NEW.run_time,  -- Explicitly copy run_time from jobs table
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

-- Add comment
COMMENT ON FUNCTION move_job_to_history IS 'Moves completed or failed jobs to job_history table, including run_time';

