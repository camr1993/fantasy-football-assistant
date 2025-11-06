-- Create SQL function to bulk update weighted scores for multiple players
-- Uses UPDATE FROM with VALUES for efficient bulk updates

CREATE OR REPLACE FUNCTION bulk_update_weighted_scores(
  p_league_id UUID,
  p_season_year INT,
  p_week INT,
  p_updates JSONB
)
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  -- Update all records in one statement using UPDATE FROM with VALUES
  -- p_updates should be an array of objects: [{"player_id": "...", "weighted_score": ..., "recent_mean_norm": ..., "recent_std_norm": ...}, ...]

  WITH update_data AS (
    SELECT
      (elem->>'player_id')::UUID AS player_id,
      (elem->>'weighted_score')::NUMERIC AS weighted_score,
      (elem->>'recent_mean_norm')::NUMERIC AS recent_mean_norm,
      (elem->>'recent_std_norm')::NUMERIC AS recent_std_norm
    FROM jsonb_array_elements(p_updates) AS elem
  )
  UPDATE league_calcs lc
  SET
    weighted_score = ud.weighted_score,
    recent_mean_norm = ud.recent_mean_norm,
    recent_std_norm = ud.recent_std_norm,
    updated_at = NOW()
  FROM update_data ud
  WHERE lc.league_id = p_league_id
    AND lc.player_id = ud.player_id
    AND lc.season_year = p_season_year
    AND lc.week = p_week;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION bulk_update_weighted_scores IS 'Bulk updates weighted scores for multiple players using JSONB array';

