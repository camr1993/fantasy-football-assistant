-- Add K efficiency metrics columns to player_stats table
-- These are league-agnostic metrics calculated from raw stats

ALTER TABLE player_stats
ADD COLUMN IF NOT EXISTS fg_profile NUMERIC,
ADD COLUMN IF NOT EXISTS fg_pat_misses NUMERIC,
ADD COLUMN IF NOT EXISTS fg_attempts NUMERIC,
ADD COLUMN IF NOT EXISTS fg_profile_3wk_avg NUMERIC,
ADD COLUMN IF NOT EXISTS fg_pat_misses_3wk_avg NUMERIC,
ADD COLUMN IF NOT EXISTS fg_attempts_3wk_avg NUMERIC,
ADD COLUMN IF NOT EXISTS fg_profile_3wk_avg_norm NUMERIC,
ADD COLUMN IF NOT EXISTS fg_pat_misses_3wk_avg_norm NUMERIC,
ADD COLUMN IF NOT EXISTS fg_attempts_3wk_avg_norm NUMERIC;

-- Add comments for documentation
COMMENT ON COLUMN player_stats.fg_profile IS 'FG profile: 3×(FG50+) + 2×(FG40-49) + 1×(FG0-39)';
COMMENT ON COLUMN player_stats.fg_pat_misses IS 'FG/PAT misses: fg_missed_0_19 + fg_missed_20_29 + pat_missed';
COMMENT ON COLUMN player_stats.fg_attempts IS 'Total FG attempts: sum of all FG made and missed';
COMMENT ON COLUMN player_stats.fg_profile_3wk_avg IS '3-week rolling average of FG profile';
COMMENT ON COLUMN player_stats.fg_pat_misses_3wk_avg IS '3-week rolling average of FG/PAT misses';
COMMENT ON COLUMN player_stats.fg_attempts_3wk_avg IS '3-week rolling average of FG attempts';
COMMENT ON COLUMN player_stats.fg_profile_3wk_avg_norm IS 'Globally normalized 3-week rolling average of FG profile (0-1 scale, normalized across all Ks)';
COMMENT ON COLUMN player_stats.fg_pat_misses_3wk_avg_norm IS 'Globally normalized 3-week rolling average of FG/PAT misses (0-1 scale, normalized across all Ks)';
COMMENT ON COLUMN player_stats.fg_attempts_3wk_avg_norm IS 'Globally normalized 3-week rolling average of FG attempts (0-1 scale, normalized across all Ks)';

-- Create index for K efficiency metrics queries
CREATE INDEX IF NOT EXISTS idx_player_stats_player_season_week_k_efficiency
  ON player_stats(player_id, season_year, week)
  WHERE fg_profile IS NOT NULL OR fg_pat_misses IS NOT NULL OR fg_attempts IS NOT NULL;

