-- Drop efficiency metrics columns from league_calcs table
-- These are now stored in player_stats (league-agnostic) and calculated once
-- Normalized values are also stored in player_stats (globally normalized across all WRs)

ALTER TABLE league_calcs
DROP COLUMN IF EXISTS targets_per_game,
DROP COLUMN IF EXISTS catch_rate,
DROP COLUMN IF EXISTS yards_per_target,
DROP COLUMN IF EXISTS targets_per_game_3wk_avg,
DROP COLUMN IF EXISTS catch_rate_3wk_avg,
DROP COLUMN IF EXISTS yards_per_target_3wk_avg,
DROP COLUMN IF EXISTS targets_per_game_3wk_avg_norm,
DROP COLUMN IF EXISTS catch_rate_3wk_avg_norm,
DROP COLUMN IF EXISTS yards_per_target_3wk_avg_norm;

