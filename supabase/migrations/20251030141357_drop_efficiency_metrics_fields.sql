-- Drop efficiency metrics fields if they exist

ALTER TABLE league_calcs
DROP COLUMN IF EXISTS targets_per_game_3wk_avg,
DROP COLUMN IF EXISTS catch_rate_3wk_avg,
DROP COLUMN IF EXISTS yards_per_target_3wk_avg,
DROP COLUMN IF EXISTS targets_per_game_3wk_avg_norm,
DROP COLUMN IF EXISTS catch_rate_3wk_avg_norm,
DROP COLUMN IF EXISTS yards_per_target_3wk_avg_norm;

