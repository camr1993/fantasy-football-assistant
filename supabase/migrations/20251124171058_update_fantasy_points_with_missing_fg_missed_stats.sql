-- Update calculate_weekly_fantasy_points function to include missing FG missed stats
-- Adds fg_missed_30_39, fg_missed_40_49, and fg_missed_50_plus

CREATE OR REPLACE FUNCTION calculate_weekly_fantasy_points(
  p_league_id UUID,
  p_season_year INT,
  p_week INT
) RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  -- Use UPSERT to insert or update fantasy points in league_calcs table
  WITH calculated_points AS (
    SELECT
      p_league_id as league_id,
      ps.player_id,
      p_season_year as season_year,
      p_week as week,
      -- Calculate total points by summing all stat values * their modifiers
      COALESCE(
        -- Passing stats
        (ps.passing_yards * COALESCE(lsm_py.value, 0)) +
        (ps.passing_touchdowns * COALESCE(lsm_pt.value, 0)) +
        (ps.interceptions * COALESCE(lsm_int.value, 0)) +
        (ps.passes_attempted * COALESCE(lsm_pa.value, 0)) +
        (ps.passes_completed * COALESCE(lsm_pc.value, 0)) +

        -- Rushing stats
        (ps.rushing_yards * COALESCE(lsm_ry.value, 0)) +
        (ps.rushing_touchdowns * COALESCE(lsm_rt.value, 0)) +
        (ps.fumbles_lost * COALESCE(lsm_fl.value, 0)) +

        -- Receiving stats
        (ps.receptions * COALESCE(lsm_rec.value, 0)) +
        (ps.receiving_yards * COALESCE(lsm_recy.value, 0)) +
        (ps.receiving_touchdowns * COALESCE(lsm_ret.value, 0)) +

        -- Return touchdowns
        (ps.return_touchdowns * COALESCE(lsm_ret_td.value, 0)) +

        -- Misc stats
        (ps.two_point_conversions * COALESCE(lsm_2pt.value, 0)) +
        (ps.offensive_fumble_return_td * COALESCE(lsm_ofrtd.value, 0)) +

        -- Kicking stats
        (ps.fg_made_0_19 * COALESCE(lsm_fg019.value, 0)) +
        (ps.fg_made_20_29 * COALESCE(lsm_fg2029.value, 0)) +
        (ps.fg_made_30_39 * COALESCE(lsm_fg3039.value, 0)) +
        (ps.fg_made_40_49 * COALESCE(lsm_fg4049.value, 0)) +
        (ps.fg_made_50_plus * COALESCE(lsm_fg50.value, 0)) +
        (ps.fg_missed_0_19 * COALESCE(lsm_fgm019.value, 0)) +
        (ps.fg_missed_20_29 * COALESCE(lsm_fgm2029.value, 0)) +
        (ps.fg_missed_30_39 * COALESCE(lsm_fgm3039.value, 0)) +
        (ps.fg_missed_40_49 * COALESCE(lsm_fgm4049.value, 0)) +
        (ps.fg_missed_50_plus * COALESCE(lsm_fgm50.value, 0)) +
        (ps.pat_made * COALESCE(lsm_pat.value, 0)) +
        (ps.pat_missed * COALESCE(lsm_patm.value, 0)) +

        -- Defense stats
        (ps.points_allowed * COALESCE(lsm_pa_def.value, 0)) +
        (ps.sacks * COALESCE(lsm_sacks.value, 0)) +
        (ps.defensive_int * COALESCE(lsm_dint.value, 0)) +
        (ps.fumble_recoveries * COALESCE(lsm_fr.value, 0)) +
        (ps.defensive_touchdowns * COALESCE(lsm_dtd.value, 0)) +
        (ps.defense_return_touchdowns * COALESCE(lsm_drtd.value, 0)) +
        (ps.safeties * COALESCE(lsm_saf.value, 0)) +
        (ps.block_kicks * COALESCE(lsm_bk.value, 0)) +
        (ps.total_yards_given_up * COALESCE(lsm_tygu.value, 0)) +

        -- Points allowed ranges (mutually exclusive)
        (ps.points_allowed_0 * COALESCE(lsm_pa0.value, 0)) +
        (ps.points_allowed_1_6 * COALESCE(lsm_pa16.value, 0)) +
        (ps.points_allowed_7_13 * COALESCE(lsm_pa713.value, 0)) +
        (ps.points_allowed_14_20 * COALESCE(lsm_pa1420.value, 0)) +
        (ps.points_allowed_21_27 * COALESCE(lsm_pa2127.value, 0)) +
        (ps.points_allowed_28_34 * COALESCE(lsm_pa2834.value, 0)) +
        (ps.points_allowed_35_plus * COALESCE(lsm_pa35.value, 0)),
        0
      ) as fantasy_points
    FROM player_stats ps
    -- Join with league modifiers for each stat
    LEFT JOIN stat_definitions sd_py ON sd_py.player_stats_column = 'passing_yards'
    LEFT JOIN league_stat_modifiers lsm_py ON lsm_py.stat_id = sd_py.stat_id AND lsm_py.league_id = p_league_id

    LEFT JOIN stat_definitions sd_pt ON sd_pt.player_stats_column = 'passing_touchdowns'
    LEFT JOIN league_stat_modifiers lsm_pt ON lsm_pt.stat_id = sd_pt.stat_id AND lsm_pt.league_id = p_league_id

    LEFT JOIN stat_definitions sd_int ON sd_int.player_stats_column = 'interceptions'
    LEFT JOIN league_stat_modifiers lsm_int ON lsm_int.stat_id = sd_int.stat_id AND lsm_int.league_id = p_league_id

    LEFT JOIN stat_definitions sd_pa ON sd_pa.player_stats_column = 'passes_attempted'
    LEFT JOIN league_stat_modifiers lsm_pa ON lsm_pa.stat_id = sd_pa.stat_id AND lsm_pa.league_id = p_league_id

    LEFT JOIN stat_definitions sd_pc ON sd_pc.player_stats_column = 'passes_completed'
    LEFT JOIN league_stat_modifiers lsm_pc ON lsm_pc.stat_id = sd_pc.stat_id AND lsm_pc.league_id = p_league_id

    LEFT JOIN stat_definitions sd_ry ON sd_ry.player_stats_column = 'rushing_yards'
    LEFT JOIN league_stat_modifiers lsm_ry ON lsm_ry.stat_id = sd_ry.stat_id AND lsm_ry.league_id = p_league_id

    LEFT JOIN stat_definitions sd_rt ON sd_rt.player_stats_column = 'rushing_touchdowns'
    LEFT JOIN league_stat_modifiers lsm_rt ON lsm_rt.stat_id = sd_rt.stat_id AND lsm_rt.league_id = p_league_id

    LEFT JOIN stat_definitions sd_fl ON sd_fl.player_stats_column = 'fumbles_lost'
    LEFT JOIN league_stat_modifiers lsm_fl ON lsm_fl.stat_id = sd_fl.stat_id AND lsm_fl.league_id = p_league_id

    LEFT JOIN stat_definitions sd_rec ON sd_rec.player_stats_column = 'receptions'
    LEFT JOIN league_stat_modifiers lsm_rec ON lsm_rec.stat_id = sd_rec.stat_id AND lsm_rec.league_id = p_league_id

    LEFT JOIN stat_definitions sd_recy ON sd_recy.player_stats_column = 'receiving_yards'
    LEFT JOIN league_stat_modifiers lsm_recy ON lsm_recy.stat_id = sd_recy.stat_id AND lsm_recy.league_id = p_league_id

    LEFT JOIN stat_definitions sd_ret ON sd_ret.player_stats_column = 'receiving_touchdowns'
    LEFT JOIN league_stat_modifiers lsm_ret ON lsm_ret.stat_id = sd_ret.stat_id AND lsm_ret.league_id = p_league_id

    LEFT JOIN stat_definitions sd_ret_td ON sd_ret_td.player_stats_column = 'return_touchdowns'
    LEFT JOIN league_stat_modifiers lsm_ret_td ON lsm_ret_td.stat_id = sd_ret_td.stat_id AND lsm_ret_td.league_id = p_league_id

    LEFT JOIN stat_definitions sd_2pt ON sd_2pt.player_stats_column = 'two_point_conversions'
    LEFT JOIN league_stat_modifiers lsm_2pt ON lsm_2pt.stat_id = sd_2pt.stat_id AND lsm_2pt.league_id = p_league_id

    LEFT JOIN stat_definitions sd_ofrtd ON sd_ofrtd.player_stats_column = 'offensive_fumble_return_td'
    LEFT JOIN league_stat_modifiers lsm_ofrtd ON lsm_ofrtd.stat_id = sd_ofrtd.stat_id AND lsm_ofrtd.league_id = p_league_id

    LEFT JOIN stat_definitions sd_fg019 ON sd_fg019.player_stats_column = 'fg_made_0_19'
    LEFT JOIN league_stat_modifiers lsm_fg019 ON lsm_fg019.stat_id = sd_fg019.stat_id AND lsm_fg019.league_id = p_league_id

    LEFT JOIN stat_definitions sd_fg2029 ON sd_fg2029.player_stats_column = 'fg_made_20_29'
    LEFT JOIN league_stat_modifiers lsm_fg2029 ON lsm_fg2029.stat_id = sd_fg2029.stat_id AND lsm_fg2029.league_id = p_league_id

    LEFT JOIN stat_definitions sd_fg3039 ON sd_fg3039.player_stats_column = 'fg_made_30_39'
    LEFT JOIN league_stat_modifiers lsm_fg3039 ON lsm_fg3039.stat_id = sd_fg3039.stat_id AND lsm_fg3039.league_id = p_league_id

    LEFT JOIN stat_definitions sd_fg4049 ON sd_fg4049.player_stats_column = 'fg_made_40_49'
    LEFT JOIN league_stat_modifiers lsm_fg4049 ON lsm_fg4049.stat_id = sd_fg4049.stat_id AND lsm_fg4049.league_id = p_league_id

    LEFT JOIN stat_definitions sd_fg50 ON sd_fg50.player_stats_column = 'fg_made_50_plus'
    LEFT JOIN league_stat_modifiers lsm_fg50 ON lsm_fg50.stat_id = sd_fg50.stat_id AND lsm_fg50.league_id = p_league_id

    LEFT JOIN stat_definitions sd_fgm019 ON sd_fgm019.player_stats_column = 'fg_missed_0_19'
    LEFT JOIN league_stat_modifiers lsm_fgm019 ON lsm_fgm019.stat_id = sd_fgm019.stat_id AND lsm_fgm019.league_id = p_league_id

    LEFT JOIN stat_definitions sd_fgm2029 ON sd_fgm2029.player_stats_column = 'fg_missed_20_29'
    LEFT JOIN league_stat_modifiers lsm_fgm2029 ON lsm_fgm2029.stat_id = sd_fgm2029.stat_id AND lsm_fgm2029.league_id = p_league_id

    LEFT JOIN stat_definitions sd_fgm3039 ON sd_fgm3039.player_stats_column = 'fg_missed_30_39'
    LEFT JOIN league_stat_modifiers lsm_fgm3039 ON lsm_fgm3039.stat_id = sd_fgm3039.stat_id AND lsm_fgm3039.league_id = p_league_id

    LEFT JOIN stat_definitions sd_fgm4049 ON sd_fgm4049.player_stats_column = 'fg_missed_40_49'
    LEFT JOIN league_stat_modifiers lsm_fgm4049 ON lsm_fgm4049.stat_id = sd_fgm4049.stat_id AND lsm_fgm4049.league_id = p_league_id

    LEFT JOIN stat_definitions sd_fgm50 ON sd_fgm50.player_stats_column = 'fg_missed_50_plus'
    LEFT JOIN league_stat_modifiers lsm_fgm50 ON lsm_fgm50.stat_id = sd_fgm50.stat_id AND lsm_fgm50.league_id = p_league_id

    LEFT JOIN stat_definitions sd_pat ON sd_pat.player_stats_column = 'pat_made'
    LEFT JOIN league_stat_modifiers lsm_pat ON lsm_pat.stat_id = sd_pat.stat_id AND lsm_pat.league_id = p_league_id

    LEFT JOIN stat_definitions sd_patm ON sd_patm.player_stats_column = 'pat_missed'
    LEFT JOIN league_stat_modifiers lsm_patm ON lsm_patm.stat_id = sd_patm.stat_id AND lsm_patm.league_id = p_league_id

    LEFT JOIN stat_definitions sd_pa_def ON sd_pa_def.player_stats_column = 'points_allowed'
    LEFT JOIN league_stat_modifiers lsm_pa_def ON lsm_pa_def.stat_id = sd_pa_def.stat_id AND lsm_pa_def.league_id = p_league_id

    LEFT JOIN stat_definitions sd_sacks ON sd_sacks.player_stats_column = 'sacks'
    LEFT JOIN league_stat_modifiers lsm_sacks ON lsm_sacks.stat_id = sd_sacks.stat_id AND lsm_sacks.league_id = p_league_id

    LEFT JOIN stat_definitions sd_dint ON sd_dint.player_stats_column = 'defensive_int'
    LEFT JOIN league_stat_modifiers lsm_dint ON lsm_dint.stat_id = sd_dint.stat_id AND lsm_dint.league_id = p_league_id

    LEFT JOIN stat_definitions sd_fr ON sd_fr.player_stats_column = 'fumble_recoveries'
    LEFT JOIN league_stat_modifiers lsm_fr ON lsm_fr.stat_id = sd_fr.stat_id AND lsm_fr.league_id = p_league_id

    LEFT JOIN stat_definitions sd_dtd ON sd_dtd.player_stats_column = 'defensive_touchdowns'
    LEFT JOIN league_stat_modifiers lsm_dtd ON lsm_dtd.stat_id = sd_dtd.stat_id AND lsm_dtd.league_id = p_league_id

    LEFT JOIN stat_definitions sd_drtd ON sd_drtd.player_stats_column = 'defense_return_touchdowns'
    LEFT JOIN league_stat_modifiers lsm_drtd ON lsm_drtd.stat_id = sd_drtd.stat_id AND lsm_drtd.league_id = p_league_id

    LEFT JOIN stat_definitions sd_saf ON sd_saf.player_stats_column = 'safeties'
    LEFT JOIN league_stat_modifiers lsm_saf ON lsm_saf.stat_id = sd_saf.stat_id AND lsm_saf.league_id = p_league_id

    LEFT JOIN stat_definitions sd_bk ON sd_bk.player_stats_column = 'block_kicks'
    LEFT JOIN league_stat_modifiers lsm_bk ON lsm_bk.stat_id = sd_bk.stat_id AND lsm_bk.league_id = p_league_id

    LEFT JOIN stat_definitions sd_tygu ON sd_tygu.player_stats_column = 'total_yards_given_up'
    LEFT JOIN league_stat_modifiers lsm_tygu ON lsm_tygu.stat_id = sd_tygu.stat_id AND lsm_tygu.league_id = p_league_id

    LEFT JOIN stat_definitions sd_pa0 ON sd_pa0.player_stats_column = 'points_allowed_0'
    LEFT JOIN league_stat_modifiers lsm_pa0 ON lsm_pa0.stat_id = sd_pa0.stat_id AND lsm_pa0.league_id = p_league_id

    LEFT JOIN stat_definitions sd_pa16 ON sd_pa16.player_stats_column = 'points_allowed_1_6'
    LEFT JOIN league_stat_modifiers lsm_pa16 ON lsm_pa16.stat_id = sd_pa16.stat_id AND lsm_pa16.league_id = p_league_id

    LEFT JOIN stat_definitions sd_pa713 ON sd_pa713.player_stats_column = 'points_allowed_7_13'
    LEFT JOIN league_stat_modifiers lsm_pa713 ON lsm_pa713.stat_id = sd_pa713.stat_id AND lsm_pa713.league_id = p_league_id

    LEFT JOIN stat_definitions sd_pa1420 ON sd_pa1420.player_stats_column = 'points_allowed_14_20'
    LEFT JOIN league_stat_modifiers lsm_pa1420 ON lsm_pa1420.stat_id = sd_pa1420.stat_id AND lsm_pa1420.league_id = p_league_id

    LEFT JOIN stat_definitions sd_pa2127 ON sd_pa2127.player_stats_column = 'points_allowed_21_27'
    LEFT JOIN league_stat_modifiers lsm_pa2127 ON lsm_pa2127.stat_id = sd_pa2127.stat_id AND lsm_pa2127.league_id = p_league_id

    LEFT JOIN stat_definitions sd_pa2834 ON sd_pa2834.player_stats_column = 'points_allowed_28_34'
    LEFT JOIN league_stat_modifiers lsm_pa2834 ON lsm_pa2834.stat_id = sd_pa2834.stat_id AND lsm_pa2834.league_id = p_league_id

    LEFT JOIN stat_definitions sd_pa35 ON sd_pa35.player_stats_column = 'points_allowed_35_plus'
    LEFT JOIN league_stat_modifiers lsm_pa35 ON lsm_pa35.stat_id = sd_pa35.stat_id AND lsm_pa35.league_id = p_league_id

    WHERE ps.season_year = p_season_year
      AND ps.week = p_week
      AND ps.source = 'actual'
      AND ps.played = true
  )
  INSERT INTO league_calcs (league_id, player_id, season_year, week, fantasy_points, recent_mean, recent_std, updated_at)
  SELECT
    league_id,
    player_id,
    season_year,
    week,
    fantasy_points,
    -- Calculate recent mean (including current week)
    (
      SELECT AVG(lc2.fantasy_points)
      FROM league_calcs lc2
      WHERE lc2.league_id = calculated_points.league_id
        AND lc2.player_id = calculated_points.player_id
        AND lc2.season_year = calculated_points.season_year
        AND lc2.week <= calculated_points.week
        AND lc2.week > calculated_points.week - 3  -- Last 3 weeks including current
    ) as recent_mean,
    -- Calculate recent standard deviation (including current week)
    (
      SELECT STDDEV(lc2.fantasy_points)
      FROM league_calcs lc2
      WHERE lc2.league_id = calculated_points.league_id
        AND lc2.player_id = calculated_points.player_id
        AND lc2.season_year = calculated_points.season_year
        AND lc2.week <= calculated_points.week
        AND lc2.week > calculated_points.week - 3  -- Last 3 weeks including current
    ) as recent_std,
    NOW()
  FROM calculated_points
  ON CONFLICT (league_id, player_id, season_year, week)
  DO UPDATE SET
    fantasy_points = EXCLUDED.fantasy_points,
    recent_mean = EXCLUDED.recent_mean,
    recent_std = EXCLUDED.recent_std,
    updated_at = NOW();

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- Update comment
COMMENT ON FUNCTION calculate_weekly_fantasy_points IS 'Calculates and updates weekly fantasy points for all players in a league using league-specific modifiers, including all FG missed stats (0-19, 20-29, 30-39, 40-49, 50+)';

