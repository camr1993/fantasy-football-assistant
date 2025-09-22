-- Rename userProfiles table to user_profiles for consistency
ALTER TABLE userProfiles RENAME TO user_profiles;

-- Update foreign key references in teams table
-- (PostgreSQL will automatically update the constraint name)
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_user_id_fkey;
ALTER TABLE teams ADD CONSTRAINT teams_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES user_profiles(id);

-- Update foreign key references in recommendations table
ALTER TABLE recommendations DROP CONSTRAINT IF EXISTS recommendations_user_id_fkey;
ALTER TABLE recommendations ADD CONSTRAINT recommendations_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES user_profiles(id);

-- Index names don't need to be changed since they reference the column, not the table name
