-- Create a function to recalculate fantasy points for all leagues and weeks
-- This is useful for maintenance or when league modifiers change

CREATE OR REPLACE FUNCTION recalculate_all_fantasy_points(
  p_season_year INT DEFAULT NULL,
  p_week INT DEFAULT NULL
) RETURNS TABLE(
  league_id UUID,
  season_year INT,
  week INT,
  updated_count INTEGER
) AS $$
DECLARE
  league_record RECORD;
  current_season INT;
  current_week INT;
  result_count INTEGER;
BEGIN
  -- Use provided season/year or current values
  current_season := COALESCE(p_season_year, EXTRACT(YEAR FROM NOW())::INT);

  -- Loop through all leagues
  FOR league_record IN
    SELECT DISTINCT l.id as league_id, l.season_year
    FROM leagues l
    WHERE l.season_year = current_season
  LOOP
    -- If specific week provided, calculate only that week
    IF p_week IS NOT NULL THEN
      current_week := p_week;
      -- Call the calculate_weekly_fantasy_points function
      SELECT calculate_weekly_fantasy_points(
        league_record.league_id,
        league_record.season_year,
        current_week
      ) INTO result_count;

      -- Return the result
      league_id := league_record.league_id;
      season_year := league_record.season_year;
      week := current_week;
      updated_count := result_count;
      RETURN NEXT;
    ELSE
      -- Calculate points for each week in the season (1-18 for NFL)
      FOR current_week IN 1..18 LOOP
        -- Call the calculate_weekly_fantasy_points function
        SELECT calculate_weekly_fantasy_points(
          league_record.league_id,
          league_record.season_year,
          current_week
        ) INTO result_count;

        -- Return the result
        league_id := league_record.league_id;
        season_year := league_record.season_year;
        week := current_week;
        updated_count := result_count;
        RETURN NEXT;
      END LOOP;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Add comment
COMMENT ON FUNCTION recalculate_all_fantasy_points IS 'Recalculates fantasy points for all leagues and weeks, useful for maintenance when league modifiers change';
