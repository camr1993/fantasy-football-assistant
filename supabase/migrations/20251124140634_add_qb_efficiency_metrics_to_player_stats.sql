-- Add QB efficiency metrics columns to player_stats table
-- These are league-agnostic metrics calculated from raw stats

ALTER TABLE player_stats
ADD COLUMN IF NOT EXISTS passing_efficiency NUMERIC,
ADD COLUMN IF NOT EXISTS turnovers NUMERIC,
ADD COLUMN IF NOT EXISTS rushing_upside NUMERIC,
ADD COLUMN IF NOT EXISTS passing_efficiency_3wk_avg NUMERIC,
ADD COLUMN IF NOT EXISTS turnovers_3wk_avg NUMERIC,
ADD COLUMN IF NOT EXISTS rushing_upside_3wk_avg NUMERIC,
ADD COLUMN IF NOT EXISTS passing_efficiency_3wk_avg_norm NUMERIC,
ADD COLUMN IF NOT EXISTS turnovers_3wk_avg_norm NUMERIC,
ADD COLUMN IF NOT EXISTS rushing_upside_3wk_avg_norm NUMERIC;

-- Add comments for documentation
COMMENT ON COLUMN player_stats.passing_efficiency IS 'Passing efficiency: passing_touchdowns + (passing_yards / passes_attempted)';
COMMENT ON COLUMN player_stats.turnovers IS 'Turnovers: interceptions + fumbles_lost';
COMMENT ON COLUMN player_stats.rushing_upside IS 'Rushing upside: rushing_yards + (6 × rushing_touchdowns)';
COMMENT ON COLUMN player_stats.passing_efficiency_3wk_avg IS '3-week rolling average of passing efficiency';
COMMENT ON COLUMN player_stats.turnovers_3wk_avg IS '3-week rolling average of turnovers';
COMMENT ON COLUMN player_stats.rushing_upside_3wk_avg IS '3-week rolling average of rushing upside';
COMMENT ON COLUMN player_stats.passing_efficiency_3wk_avg_norm IS 'Globally normalized 3-week rolling average of passing efficiency (0-1 scale, normalized across all QBs)';
COMMENT ON COLUMN player_stats.turnovers_3wk_avg_norm IS 'Globally normalized 3-week rolling average of turnovers (0-1 scale, normalized across all QBs)';
COMMENT ON COLUMN player_stats.rushing_upside_3wk_avg_norm IS 'Globally normalized 3-week rolling average of rushing upside (0-1 scale, normalized across all QBs)';

