-- Create a function to calculate fantasy points using the new stat structure
-- This function uses league-specific modifiers to calculate points

CREATE OR REPLACE FUNCTION calculate_fantasy_points(
  p_player_id UUID,
  p_season_year INT,
  p_week INT,
  p_league_id UUID
) RETURNS NUMERIC AS $$
DECLARE
  total_points NUMERIC := 0;
  stat_modifier NUMERIC;
BEGIN
  -- Calculate points for each stat using league-specific modifiers
  -- Passing
  SELECT COALESCE(SUM(ps.passing_yards * lsm.value), 0) INTO stat_modifier
  FROM player_stats ps
  JOIN stat_definitions sd ON sd.player_stats_column = 'passing_yards'
  JOIN league_stat_modifiers lsm ON lsm.stat_id = sd.stat_id
  WHERE ps.player_id = p_player_id
    AND ps.season_year = p_season_year
    AND ps.week = p_week
    AND lsm.league_id = p_league_id;
  total_points := total_points + COALESCE(stat_modifier, 0);

  SELECT COALESCE(SUM(ps.passing_touchdowns * lsm.value), 0) INTO stat_modifier
  FROM player_stats ps
  JOIN stat_definitions sd ON sd.player_stats_column = 'passing_touchdowns'
  JOIN league_stat_modifiers lsm ON lsm.stat_id = sd.stat_id
  WHERE ps.player_id = p_player_id
    AND ps.season_year = p_season_year
    AND ps.week = p_week
    AND lsm.league_id = p_league_id;
  total_points := total_points + COALESCE(stat_modifier, 0);

  SELECT COALESCE(SUM(ps.interceptions * lsm.value), 0) INTO stat_modifier
  FROM player_stats ps
  JOIN stat_definitions sd ON sd.player_stats_column = 'interceptions'
  JOIN league_stat_modifiers lsm ON lsm.stat_id = sd.stat_id
  WHERE ps.player_id = p_player_id
    AND ps.season_year = p_season_year
    AND ps.week = p_week
    AND lsm.league_id = p_league_id;
  total_points := total_points + COALESCE(stat_modifier, 0);

  -- Rushing
  SELECT COALESCE(SUM(ps.rushing_yards * lsm.value), 0) INTO stat_modifier
  FROM player_stats ps
  JOIN stat_definitions sd ON sd.player_stats_column = 'rushing_yards'
  JOIN league_stat_modifiers lsm ON lsm.stat_id = sd.stat_id
  WHERE ps.player_id = p_player_id
    AND ps.season_year = p_season_year
    AND ps.week = p_week
    AND lsm.league_id = p_league_id;
  total_points := total_points + COALESCE(stat_modifier, 0);

  SELECT COALESCE(SUM(ps.rushing_touchdowns * lsm.value), 0) INTO stat_modifier
  FROM player_stats ps
  JOIN stat_definitions sd ON sd.player_stats_column = 'rushing_touchdowns'
  JOIN league_stat_modifiers lsm ON lsm.stat_id = sd.stat_id
  WHERE ps.player_id = p_player_id
    AND ps.season_year = p_season_year
    AND ps.week = p_week
    AND lsm.league_id = p_league_id;
  total_points := total_points + COALESCE(stat_modifier, 0);

  SELECT COALESCE(SUM(ps.fumbles_lost * lsm.value), 0) INTO stat_modifier
  FROM player_stats ps
  JOIN stat_definitions sd ON sd.player_stats_column = 'fumbles_lost'
  JOIN league_stat_modifiers lsm ON lsm.stat_id = sd.stat_id
  WHERE ps.player_id = p_player_id
    AND ps.season_year = p_season_year
    AND ps.week = p_week
    AND lsm.league_id = p_league_id;
  total_points := total_points + COALESCE(stat_modifier, 0);

  -- Receiving
  SELECT COALESCE(SUM(ps.receptions * lsm.value), 0) INTO stat_modifier
  FROM player_stats ps
  JOIN stat_definitions sd ON sd.player_stats_column = 'receptions'
  JOIN league_stat_modifiers lsm ON lsm.stat_id = sd.stat_id
  WHERE ps.player_id = p_player_id
    AND ps.season_year = p_season_year
    AND ps.week = p_week
    AND lsm.league_id = p_league_id;
  total_points := total_points + COALESCE(stat_modifier, 0);

  SELECT COALESCE(SUM(ps.receiving_yards * lsm.value), 0) INTO stat_modifier
  FROM player_stats ps
  JOIN stat_definitions sd ON sd.player_stats_column = 'receiving_yards'
  JOIN league_stat_modifiers lsm ON lsm.stat_id = sd.stat_id
  WHERE ps.player_id = p_player_id
    AND ps.season_year = p_season_year
    AND ps.week = p_week
    AND lsm.league_id = p_league_id;
  total_points := total_points + COALESCE(stat_modifier, 0);

  SELECT COALESCE(SUM(ps.receiving_touchdowns * lsm.value), 0) INTO stat_modifier
  FROM player_stats ps
  JOIN stat_definitions sd ON sd.player_stats_column = 'receiving_touchdowns'
  JOIN league_stat_modifiers lsm ON lsm.stat_id = sd.stat_id
  WHERE ps.player_id = p_player_id
    AND ps.season_year = p_season_year
    AND ps.week = p_week
    AND lsm.league_id = p_league_id;
  total_points := total_points + COALESCE(stat_modifier, 0);

  -- Return touchdowns
  SELECT COALESCE(SUM(ps.return_touchdowns * lsm.value), 0) INTO stat_modifier
  FROM player_stats ps
  JOIN stat_definitions sd ON sd.player_stats_column = 'return_touchdowns'
  JOIN league_stat_modifiers lsm ON lsm.stat_id = sd.stat_id
  WHERE ps.player_id = p_player_id
    AND ps.season_year = p_season_year
    AND ps.week = p_week
    AND lsm.league_id = p_league_id;
  total_points := total_points + COALESCE(stat_modifier, 0);

  -- Two point conversions
  SELECT COALESCE(SUM(ps.two_point_conversions * lsm.value), 0) INTO stat_modifier
  FROM player_stats ps
  JOIN stat_definitions sd ON sd.player_stats_column = 'two_point_conversions'
  JOIN league_stat_modifiers lsm ON lsm.stat_id = sd.stat_id
  WHERE ps.player_id = p_player_id
    AND ps.season_year = p_season_year
    AND ps.week = p_week
    AND lsm.league_id = p_league_id;
  total_points := total_points + COALESCE(stat_modifier, 0);

  -- Offensive fumble return TD
  SELECT COALESCE(SUM(ps.offensive_fumble_return_td * lsm.value), 0) INTO stat_modifier
  FROM player_stats ps
  JOIN stat_definitions sd ON sd.player_stats_column = 'offensive_fumble_return_td'
  JOIN league_stat_modifiers lsm ON lsm.stat_id = sd.stat_id
  WHERE ps.player_id = p_player_id
    AND ps.season_year = p_season_year
    AND ps.week = p_week
    AND lsm.league_id = p_league_id;
  total_points := total_points + COALESCE(stat_modifier, 0);

  -- Kicking stats
  SELECT COALESCE(SUM(ps.fg_made_0_19 * lsm.value), 0) INTO stat_modifier
  FROM player_stats ps
  JOIN stat_definitions sd ON sd.player_stats_column = 'fg_made_0_19'
  JOIN league_stat_modifiers lsm ON lsm.stat_id = sd.stat_id
  WHERE ps.player_id = p_player_id
    AND ps.season_year = p_season_year
    AND ps.week = p_week
    AND lsm.league_id = p_league_id;
  total_points := total_points + COALESCE(stat_modifier, 0);

  SELECT COALESCE(SUM(ps.fg_made_20_29 * lsm.value), 0) INTO stat_modifier
  FROM player_stats ps
  JOIN stat_definitions sd ON sd.player_stats_column = 'fg_made_20_29'
  JOIN league_stat_modifiers lsm ON lsm.stat_id = sd.stat_id
  WHERE ps.player_id = p_player_id
    AND ps.season_year = p_season_year
    AND ps.week = p_week
    AND lsm.league_id = p_league_id;
  total_points := total_points + COALESCE(stat_modifier, 0);

  SELECT COALESCE(SUM(ps.fg_made_30_39 * lsm.value), 0) INTO stat_modifier
  FROM player_stats ps
  JOIN stat_definitions sd ON sd.player_stats_column = 'fg_made_30_39'
  JOIN league_stat_modifiers lsm ON lsm.stat_id = sd.stat_id
  WHERE ps.player_id = p_player_id
    AND ps.season_year = p_season_year
    AND ps.week = p_week
    AND lsm.league_id = p_league_id;
  total_points := total_points + COALESCE(stat_modifier, 0);

  SELECT COALESCE(SUM(ps.fg_made_40_49 * lsm.value), 0) INTO stat_modifier
  FROM player_stats ps
  JOIN stat_definitions sd ON sd.player_stats_column = 'fg_made_40_49'
  JOIN league_stat_modifiers lsm ON lsm.stat_id = sd.stat_id
  WHERE ps.player_id = p_player_id
    AND ps.season_year = p_season_year
    AND ps.week = p_week
    AND lsm.league_id = p_league_id;
  total_points := total_points + COALESCE(stat_modifier, 0);

  SELECT COALESCE(SUM(ps.fg_made_50_plus * lsm.value), 0) INTO stat_modifier
  FROM player_stats ps
  JOIN stat_definitions sd ON sd.player_stats_column = 'fg_made_50_plus'
  JOIN league_stat_modifiers lsm ON lsm.stat_id = sd.stat_id
  WHERE ps.player_id = p_player_id
    AND ps.season_year = p_season_year
    AND ps.week = p_week
    AND lsm.league_id = p_league_id;
  total_points := total_points + COALESCE(stat_modifier, 0);

  SELECT COALESCE(SUM(ps.fg_missed_0_19 * lsm.value), 0) INTO stat_modifier
  FROM player_stats ps
  JOIN stat_definitions sd ON sd.player_stats_column = 'fg_missed_0_19'
  JOIN league_stat_modifiers lsm ON lsm.stat_id = sd.stat_id
  WHERE ps.player_id = p_player_id
    AND ps.season_year = p_season_year
    AND ps.week = p_week
    AND lsm.league_id = p_league_id;
  total_points := total_points + COALESCE(stat_modifier, 0);

  SELECT COALESCE(SUM(ps.fg_missed_20_29 * lsm.value), 0) INTO stat_modifier
  FROM player_stats ps
  JOIN stat_definitions sd ON sd.player_stats_column = 'fg_missed_20_29'
  JOIN league_stat_modifiers lsm ON lsm.stat_id = sd.stat_id
  WHERE ps.player_id = p_player_id
    AND ps.season_year = p_season_year
    AND ps.week = p_week
    AND lsm.league_id = p_league_id;
  total_points := total_points + COALESCE(stat_modifier, 0);

  SELECT COALESCE(SUM(ps.pat_made * lsm.value), 0) INTO stat_modifier
  FROM player_stats ps
  JOIN stat_definitions sd ON sd.player_stats_column = 'pat_made'
  JOIN league_stat_modifiers lsm ON lsm.stat_id = sd.stat_id
  WHERE ps.player_id = p_player_id
    AND ps.season_year = p_season_year
    AND ps.week = p_week
    AND lsm.league_id = p_league_id;
  total_points := total_points + COALESCE(stat_modifier, 0);

  SELECT COALESCE(SUM(ps.pat_missed * lsm.value), 0) INTO stat_modifier
  FROM player_stats ps
  JOIN stat_definitions sd ON sd.player_stats_column = 'pat_missed'
  JOIN league_stat_modifiers lsm ON lsm.stat_id = sd.stat_id
  WHERE ps.player_id = p_player_id
    AND ps.season_year = p_season_year
    AND ps.week = p_week
    AND lsm.league_id = p_league_id;
  total_points := total_points + COALESCE(stat_modifier, 0);

  -- Defense stats
  SELECT COALESCE(SUM(ps.points_allowed * lsm.value), 0) INTO stat_modifier
  FROM player_stats ps
  JOIN stat_definitions sd ON sd.player_stats_column = 'points_allowed'
  JOIN league_stat_modifiers lsm ON lsm.stat_id = sd.stat_id
  WHERE ps.player_id = p_player_id
    AND ps.season_year = p_season_year
    AND ps.week = p_week
    AND lsm.league_id = p_league_id;
  total_points := total_points + COALESCE(stat_modifier, 0);

  SELECT COALESCE(SUM(ps.sacks * lsm.value), 0) INTO stat_modifier
  FROM player_stats ps
  JOIN stat_definitions sd ON sd.player_stats_column = 'sacks'
  JOIN league_stat_modifiers lsm ON lsm.stat_id = sd.stat_id
  WHERE ps.player_id = p_player_id
    AND ps.season_year = p_season_year
    AND ps.week = p_week
    AND lsm.league_id = p_league_id;
  total_points := total_points + COALESCE(stat_modifier, 0);

  SELECT COALESCE(SUM(ps.defensive_int * lsm.value), 0) INTO stat_modifier
  FROM player_stats ps
  JOIN stat_definitions sd ON sd.player_stats_column = 'defensive_int'
  JOIN league_stat_modifiers lsm ON lsm.stat_id = sd.stat_id
  WHERE ps.player_id = p_player_id
    AND ps.season_year = p_season_year
    AND ps.week = p_week
    AND lsm.league_id = p_league_id;
  total_points := total_points + COALESCE(stat_modifier, 0);

  SELECT COALESCE(SUM(ps.fumble_recoveries * lsm.value), 0) INTO stat_modifier
  FROM player_stats ps
  JOIN stat_definitions sd ON sd.player_stats_column = 'fumble_recoveries'
  JOIN league_stat_modifiers lsm ON lsm.stat_id = sd.stat_id
  WHERE ps.player_id = p_player_id
    AND ps.season_year = p_season_year
    AND ps.week = p_week
    AND lsm.league_id = p_league_id;
  total_points := total_points + COALESCE(stat_modifier, 0);

  SELECT COALESCE(SUM(ps.defensive_touchdowns * lsm.value), 0) INTO stat_modifier
  FROM player_stats ps
  JOIN stat_definitions sd ON sd.player_stats_column = 'defensive_touchdowns'
  JOIN league_stat_modifiers lsm ON lsm.stat_id = sd.stat_id
  WHERE ps.player_id = p_player_id
    AND ps.season_year = p_season_year
    AND ps.week = p_week
    AND lsm.league_id = p_league_id;
  total_points := total_points + COALESCE(stat_modifier, 0);

  SELECT COALESCE(SUM(ps.safeties * lsm.value), 0) INTO stat_modifier
  FROM player_stats ps
  JOIN stat_definitions sd ON sd.player_stats_column = 'safeties'
  JOIN league_stat_modifiers lsm ON lsm.stat_id = sd.stat_id
  WHERE ps.player_id = p_player_id
    AND ps.season_year = p_season_year
    AND ps.week = p_week
    AND lsm.league_id = p_league_id;
  total_points := total_points + COALESCE(stat_modifier, 0);

  SELECT COALESCE(SUM(ps.block_kicks * lsm.value), 0) INTO stat_modifier
  FROM player_stats ps
  JOIN stat_definitions sd ON sd.player_stats_column = 'block_kicks'
  JOIN league_stat_modifiers lsm ON lsm.stat_id = sd.stat_id
  WHERE ps.player_id = p_player_id
    AND ps.season_year = p_season_year
    AND ps.week = p_week
    AND lsm.league_id = p_league_id;
  total_points := total_points + COALESCE(stat_modifier, 0);

  RETURN total_points;
END;
$$ LANGUAGE plpgsql;

-- Add comment
COMMENT ON FUNCTION calculate_fantasy_points IS 'Calculates fantasy points for a player using league-specific modifiers';
