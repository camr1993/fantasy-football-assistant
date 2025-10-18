-- Drop the old non-position specific ODI columns

ALTER TABLE defense_points_against
DROP COLUMN IF EXISTS odi,
DROP COLUMN IF EXISTS normalized_odi;
