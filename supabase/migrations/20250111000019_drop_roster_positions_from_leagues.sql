-- Drop roster_positions field from leagues table
-- This field was storing JSONB data for roster position requirements but is no longer needed

ALTER TABLE leagues DROP COLUMN IF EXISTS roster_positions;
