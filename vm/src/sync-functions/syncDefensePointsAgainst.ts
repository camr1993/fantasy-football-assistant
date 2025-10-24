import { logger } from '../../../supabase/functions/utils/logger.ts';
import { supabase } from '../../../supabase/functions/utils/supabase.ts';
import { getMostRecentNFLWeek } from '../../../supabase/functions/utils/syncHelpers.ts';

interface DefensePointsAgainst {
  league_id: string;
  player_id: string;
  season_year: number;
  week: number;
  qb_pts_against: number;
  rb_pts_against: number;
  wr_pts_against: number;
  te_pts_against: number;
  k_pts_against: number;
  qb_rolling_3_week_avg: number;
  rb_rolling_3_week_avg: number;
  wr_rolling_3_week_avg: number;
  te_rolling_3_week_avg: number;
  k_rolling_3_week_avg: number;
  qb_odi: number;
  rb_odi: number;
  wr_odi: number;
  te_odi: number;
  k_odi: number;
  qb_normalized_odi: number;
  rb_normalized_odi: number;
  wr_normalized_odi: number;
  te_normalized_odi: number;
  k_normalized_odi: number;
}

/**
 * Sync defense points against for all defense players
 * Calculates weekly fantasy points allowed by position against each defense
 */
export async function syncDefensePointsAgainst(week?: number): Promise<number> {
  const currentYear = new Date().getFullYear();
  const currentWeek = week ?? getMostRecentNFLWeek();

  logger.info('Starting defense points against sync', {
    week: currentWeek,
    seasonYear: currentYear,
  });

  try {
    // Get all leagues for the current season
    const { data: leagues, error: leaguesError } = await supabase
      .from('leagues')
      .select('id, name, season_year')
      .eq('season_year', currentYear);

    if (leaguesError) {
      logger.error('Failed to fetch leagues', { error: leaguesError });
      throw new Error(`Failed to fetch leagues: ${leaguesError.message}`);
    }

    if (!leagues || leagues.length === 0) {
      logger.warn('No leagues found for current season');
      return 0;
    }

    logger.info(`Found ${leagues.length} leagues for season ${currentYear}`);

    // Get all defense players
    const { data: defensePlayers, error: defenseError } = await supabase
      .from('players')
      .select('id, position')
      .eq('position', 'DEF');

    if (defenseError) {
      logger.error('Failed to fetch defense players', { error: defenseError });
      throw new Error(
        `Failed to fetch defense players: ${defenseError.message}`
      );
    }

    if (!defensePlayers || defensePlayers.length === 0) {
      logger.warn('No defense players found');
      return 0;
    }

    logger.info(`Found ${defensePlayers.length} defense players`);

    let totalProcessed = 0;

    // Process each league
    for (const league of leagues) {
      logger.info('Processing league', {
        leagueId: league.id,
        leagueName: league.name,
      });

      // Process each defense player for this league
      for (const defensePlayer of defensePlayers) {
        try {
          const pointsAgainst = await calculateDefensePointsAgainst(
            league.id,
            defensePlayer.id,
            currentYear,
            currentWeek
          );

          if (pointsAgainst) {
            await upsertDefensePointsAgainst(pointsAgainst);
            totalProcessed++;
          }
        } catch (error) {
          logger.error('Failed to process defense player for league', {
            leagueId: league.id,
            playerId: defensePlayer.id,
            error: error instanceof Error ? error.message : String(error),
          });
          // Continue with other players even if one fails
        }
      }
    }

    logger.info('Completed defense points against sync', {
      totalProcessed,
      leaguesCount: leagues.length,
      defensePlayersCount: defensePlayers.length,
    });

    return totalProcessed;
  } catch (error) {
    logger.error('Defense points against sync failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Calculate rolling 3-week averages for a defense player
 */
async function calculateRollingAverages(
  leagueId: string,
  defensePlayerId: string,
  seasonYear: number,
  currentWeek: number,
  currentWeekData: DefensePointsAgainst
): Promise<{
  qb_rolling_3_week_avg: number;
  rb_rolling_3_week_avg: number;
  wr_rolling_3_week_avg: number;
  te_rolling_3_week_avg: number;
  k_rolling_3_week_avg: number;
}> {
  try {
    // Special case for week 1: rolling average is just the current week's data
    if (currentWeek === 1) {
      return {
        qb_rolling_3_week_avg: currentWeekData.qb_pts_against,
        rb_rolling_3_week_avg: currentWeekData.rb_pts_against,
        wr_rolling_3_week_avg: currentWeekData.wr_pts_against,
        te_rolling_3_week_avg: currentWeekData.te_pts_against,
        k_rolling_3_week_avg: currentWeekData.k_pts_against,
      };
    }

    // Get the previous weeks of data for this defense player
    // For week 2: week 1
    // For week 3+: weeks (currentWeek-2) to (currentWeek-1)
    const startWeek = Math.max(1, currentWeek - 2);
    const endWeek = currentWeek - 1;

    const { data: recentData, error } = await supabase
      .from('defense_points_against')
      .select(
        'week, qb_pts_against, rb_pts_against, wr_pts_against, te_pts_against, k_pts_against'
      )
      .eq('league_id', leagueId)
      .eq('player_id', defensePlayerId)
      .eq('season_year', seasonYear)
      .gte('week', startWeek)
      .lte('week', endWeek)
      .order('week', { ascending: true });

    if (error) {
      logger.error('Failed to fetch recent defense data for rolling average', {
        error,
        leagueId,
        defensePlayerId,
        seasonYear,
        currentWeek,
      });
      return {
        qb_rolling_3_week_avg: 0,
        rb_rolling_3_week_avg: 0,
        wr_rolling_3_week_avg: 0,
        te_rolling_3_week_avg: 0,
        k_rolling_3_week_avg: 0,
      };
    }

    if (!recentData || recentData.length === 0) {
      logger.debug('No recent data found for rolling average calculation', {
        leagueId,
        defensePlayerId,
        seasonYear,
        currentWeek,
      });
      return {
        qb_rolling_3_week_avg: 0,
        rb_rolling_3_week_avg: 0,
        wr_rolling_3_week_avg: 0,
        te_rolling_3_week_avg: 0,
        k_rolling_3_week_avg: 0,
      };
    }

    // Calculate averages including current week's data
    const totalWeeks = recentData.length + 1; // +1 for current week
    const qbTotal =
      recentData.reduce(
        (sum: number, record: any) => sum + (record.qb_pts_against || 0),
        0
      ) + currentWeekData.qb_pts_against;
    const rbTotal =
      recentData.reduce(
        (sum: number, record: any) => sum + (record.rb_pts_against || 0),
        0
      ) + currentWeekData.rb_pts_against;
    const wrTotal =
      recentData.reduce(
        (sum: number, record: any) => sum + (record.wr_pts_against || 0),
        0
      ) + currentWeekData.wr_pts_against;
    const teTotal =
      recentData.reduce(
        (sum: number, record: any) => sum + (record.te_pts_against || 0),
        0
      ) + currentWeekData.te_pts_against;
    const kTotal =
      recentData.reduce(
        (sum: number, record: any) => sum + (record.k_pts_against || 0),
        0
      ) + currentWeekData.k_pts_against;

    return {
      qb_rolling_3_week_avg: totalWeeks > 0 ? qbTotal / totalWeeks : 0,
      rb_rolling_3_week_avg: totalWeeks > 0 ? rbTotal / totalWeeks : 0,
      wr_rolling_3_week_avg: totalWeeks > 0 ? wrTotal / totalWeeks : 0,
      te_rolling_3_week_avg: totalWeeks > 0 ? teTotal / totalWeeks : 0,
      k_rolling_3_week_avg: totalWeeks > 0 ? kTotal / totalWeeks : 0,
    };
  } catch (error) {
    logger.error('Error calculating rolling averages', {
      error: error instanceof Error ? error.message : String(error),
      leagueId,
      defensePlayerId,
      seasonYear,
      currentWeek,
    });
    return {
      qb_rolling_3_week_avg: 0,
      rb_rolling_3_week_avg: 0,
      wr_rolling_3_week_avg: 0,
      te_rolling_3_week_avg: 0,
      k_rolling_3_week_avg: 0,
    };
  }
}

/**
 * Calculate position-specific ODI (Opponent Difficulty Index) for a defense player
 */
async function calculateODI(
  leagueId: string,
  seasonYear: number,
  week: number,
  currentTeamData: DefensePointsAgainst
): Promise<{
  qb_odi: number;
  rb_odi: number;
  wr_odi: number;
  te_odi: number;
  k_odi: number;
  qb_normalized_odi: number;
  rb_normalized_odi: number;
  wr_normalized_odi: number;
  te_normalized_odi: number;
  k_normalized_odi: number;
}> {
  try {
    // Get all defense teams' rolling averages for this league and week
    const { data: allTeamData, error } = await supabase
      .from('defense_points_against')
      .select(
        'qb_rolling_3_week_avg, rb_rolling_3_week_avg, wr_rolling_3_week_avg, te_rolling_3_week_avg, k_rolling_3_week_avg'
      )
      .eq('league_id', leagueId)
      .eq('season_year', seasonYear)
      .eq('week', week);

    if (error) {
      logger.error('Failed to fetch team data for ODI calculation', {
        error,
        leagueId,
        seasonYear,
        week,
      });
      return {
        qb_odi: 0,
        rb_odi: 0,
        wr_odi: 0,
        te_odi: 0,
        k_odi: 0,
        qb_normalized_odi: 0,
        rb_normalized_odi: 0,
        wr_normalized_odi: 0,
        te_normalized_odi: 0,
        k_normalized_odi: 0,
      };
    }

    if (!allTeamData || allTeamData.length === 0) {
      logger.debug('No team data found for ODI calculation', {
        leagueId,
        seasonYear,
        week,
      });
      return {
        qb_odi: 0,
        rb_odi: 0,
        wr_odi: 0,
        te_odi: 0,
        k_odi: 0,
        qb_normalized_odi: 0,
        rb_normalized_odi: 0,
        wr_normalized_odi: 0,
        te_normalized_odi: 0,
        k_normalized_odi: 0,
      };
    }

    // Calculate league average rolling averages for each position
    const totalTeams = allTeamData.length;
    const leagueAvgQB =
      allTeamData.reduce(
        (sum: number, team: any) => sum + (team.qb_rolling_3_week_avg || 0),
        0
      ) / totalTeams;
    const leagueAvgRB =
      allTeamData.reduce(
        (sum: number, team: any) => sum + (team.rb_rolling_3_week_avg || 0),
        0
      ) / totalTeams;
    const leagueAvgWR =
      allTeamData.reduce(
        (sum: number, team: any) => sum + (team.wr_rolling_3_week_avg || 0),
        0
      ) / totalTeams;
    const leagueAvgTE =
      allTeamData.reduce(
        (sum: number, team: any) => sum + (team.te_rolling_3_week_avg || 0),
        0
      ) / totalTeams;
    const leagueAvgK =
      allTeamData.reduce(
        (sum: number, team: any) => sum + (team.k_rolling_3_week_avg || 0),
        0
      ) / totalTeams;

    // Calculate position-specific ODI values
    const qb_odi =
      leagueAvgQB > 0 ? currentTeamData.qb_rolling_3_week_avg / leagueAvgQB : 0;
    const rb_odi =
      leagueAvgRB > 0 ? currentTeamData.rb_rolling_3_week_avg / leagueAvgRB : 0;
    const wr_odi =
      leagueAvgWR > 0 ? currentTeamData.wr_rolling_3_week_avg / leagueAvgWR : 0;
    const te_odi =
      leagueAvgTE > 0 ? currentTeamData.te_rolling_3_week_avg / leagueAvgTE : 0;
    const k_odi =
      leagueAvgK > 0 ? currentTeamData.k_rolling_3_week_avg / leagueAvgK : 0;

    // Calculate normalized ODI for each position (0-1)
    const qbODIs = allTeamData.map((team: any) =>
      leagueAvgQB > 0 ? (team.qb_rolling_3_week_avg || 0) / leagueAvgQB : 0
    );
    const rbODIs = allTeamData.map((team: any) =>
      leagueAvgRB > 0 ? (team.rb_rolling_3_week_avg || 0) / leagueAvgRB : 0
    );
    const wrODIs = allTeamData.map((team: any) =>
      leagueAvgWR > 0 ? (team.wr_rolling_3_week_avg || 0) / leagueAvgWR : 0
    );
    const teODIs = allTeamData.map((team: any) =>
      leagueAvgTE > 0 ? (team.te_rolling_3_week_avg || 0) / leagueAvgTE : 0
    );
    const kODIs = allTeamData.map((team: any) =>
      leagueAvgK > 0 ? (team.k_rolling_3_week_avg || 0) / leagueAvgK : 0
    );

    const qb_min = Math.min(...qbODIs);
    const qb_max = Math.max(...qbODIs);
    const qb_normalized_odi =
      qb_max > qb_min ? (qb_odi - qb_min) / (qb_max - qb_min) : 0;

    const rb_min = Math.min(...rbODIs);
    const rb_max = Math.max(...rbODIs);
    const rb_normalized_odi =
      rb_max > rb_min ? (rb_odi - rb_min) / (rb_max - rb_min) : 0;

    const wr_min = Math.min(...wrODIs);
    const wr_max = Math.max(...wrODIs);
    const wr_normalized_odi =
      wr_max > wr_min ? (wr_odi - wr_min) / (wr_max - wr_min) : 0;

    const te_min = Math.min(...teODIs);
    const te_max = Math.max(...teODIs);
    const te_normalized_odi =
      te_max > te_min ? (te_odi - te_min) / (te_max - te_min) : 0;

    const k_min = Math.min(...kODIs);
    const k_max = Math.max(...kODIs);
    const k_normalized_odi =
      k_max > k_min ? (k_odi - k_min) / (k_max - k_min) : 0;

    return {
      qb_odi,
      rb_odi,
      wr_odi,
      te_odi,
      k_odi,
      qb_normalized_odi,
      rb_normalized_odi,
      wr_normalized_odi,
      te_normalized_odi,
      k_normalized_odi,
    };
  } catch (error) {
    logger.error('Error calculating position-specific ODI', {
      error: error instanceof Error ? error.message : String(error),
      leagueId,
      seasonYear,
      week,
    });
    return {
      qb_odi: 0,
      rb_odi: 0,
      wr_odi: 0,
      te_odi: 0,
      k_odi: 0,
      qb_normalized_odi: 0,
      rb_normalized_odi: 0,
      wr_normalized_odi: 0,
      te_normalized_odi: 0,
      k_normalized_odi: 0,
    };
  }
}

/**
 * Calculate defense points against for a specific defense player in a specific league
 */
async function calculateDefensePointsAgainst(
  leagueId: string,
  defensePlayerId: string,
  seasonYear: number,
  week: number
): Promise<DefensePointsAgainst | null> {
  try {
    // Query to get fantasy points by position for players who faced this defense in the specific week

    const { data: positionStats, error: queryError } = await supabase.rpc(
      'get_defense_totals_by_position',
      {
        p_league_id: leagueId,
        p_season_year: seasonYear,
        p_defense_player_id: defensePlayerId,
        p_week: week,
      }
    );

    if (queryError) {
      logger.error('Failed to query defense points against', {
        error: queryError,
        leagueId,
        defensePlayerId,
        seasonYear,
        week,
      });
      return null;
    }

    // If no data found, return null
    if (!positionStats || positionStats.length === 0) {
      logger.debug('No stats found for defense player', {
        leagueId,
        defensePlayerId,
        seasonYear,
        week,
      });
      return null;
    }

    // Initialize points against
    const pointsAgainst: DefensePointsAgainst = {
      league_id: leagueId,
      player_id: defensePlayerId,
      season_year: seasonYear,
      week: week,
      qb_pts_against: 0,
      rb_pts_against: 0,
      wr_pts_against: 0,
      te_pts_against: 0,
      k_pts_against: 0,
      qb_rolling_3_week_avg: 0,
      rb_rolling_3_week_avg: 0,
      wr_rolling_3_week_avg: 0,
      te_rolling_3_week_avg: 0,
      k_rolling_3_week_avg: 0,
      qb_odi: 0,
      rb_odi: 0,
      wr_odi: 0,
      te_odi: 0,
      k_odi: 0,
      qb_normalized_odi: 0,
      rb_normalized_odi: 0,
      wr_normalized_odi: 0,
      te_normalized_odi: 0,
      k_normalized_odi: 0,
    };

    // Sum up points by position
    for (const stat of positionStats) {
      const position = stat.position as string;
      const points = parseFloat(stat.total_points || '0');

      switch (position) {
        case 'QB':
          pointsAgainst.qb_pts_against += points;
          break;
        case 'RB':
          pointsAgainst.rb_pts_against += points;
          break;
        case 'WR':
          pointsAgainst.wr_pts_against += points;
          break;
        case 'TE':
          pointsAgainst.te_pts_against += points;
          break;
        case 'K':
          pointsAgainst.k_pts_against += points;
          break;
        default:
          logger.debug('Unknown position found', { position, points });
      }
    }

    // Calculate rolling 3-week averages AFTER calculating current week's points
    const rollingAverages = await calculateRollingAverages(
      leagueId,
      defensePlayerId,
      seasonYear,
      week,
      pointsAgainst
    );

    // Update the pointsAgainst object with rolling averages
    pointsAgainst.qb_rolling_3_week_avg = rollingAverages.qb_rolling_3_week_avg;
    pointsAgainst.rb_rolling_3_week_avg = rollingAverages.rb_rolling_3_week_avg;
    pointsAgainst.wr_rolling_3_week_avg = rollingAverages.wr_rolling_3_week_avg;
    pointsAgainst.te_rolling_3_week_avg = rollingAverages.te_rolling_3_week_avg;
    pointsAgainst.k_rolling_3_week_avg = rollingAverages.k_rolling_3_week_avg;

    // Calculate position-specific ODI (Opponent Difficulty Index)
    const odiData = await calculateODI(
      leagueId,
      seasonYear,
      week,
      pointsAgainst
    );
    pointsAgainst.qb_odi = odiData.qb_odi;
    pointsAgainst.rb_odi = odiData.rb_odi;
    pointsAgainst.wr_odi = odiData.wr_odi;
    pointsAgainst.te_odi = odiData.te_odi;
    pointsAgainst.k_odi = odiData.k_odi;
    pointsAgainst.qb_normalized_odi = odiData.qb_normalized_odi;
    pointsAgainst.rb_normalized_odi = odiData.rb_normalized_odi;
    pointsAgainst.wr_normalized_odi = odiData.wr_normalized_odi;
    pointsAgainst.te_normalized_odi = odiData.te_normalized_odi;
    pointsAgainst.k_normalized_odi = odiData.k_normalized_odi;

    return pointsAgainst;
  } catch (error) {
    logger.error('Error calculating defense points against', {
      leagueId,
      defensePlayerId,
      seasonYear,
      week,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Upsert defense points against into the database
 */
async function upsertDefensePointsAgainst(
  pointsAgainst: DefensePointsAgainst
): Promise<void> {
  try {
    const { error } = await supabase.from('defense_points_against').upsert(
      {
        league_id: pointsAgainst.league_id,
        player_id: pointsAgainst.player_id,
        season_year: pointsAgainst.season_year,
        week: pointsAgainst.week,
        qb_pts_against: pointsAgainst.qb_pts_against,
        rb_pts_against: pointsAgainst.rb_pts_against,
        wr_pts_against: pointsAgainst.wr_pts_against,
        te_pts_against: pointsAgainst.te_pts_against,
        k_pts_against: pointsAgainst.k_pts_against,
        qb_rolling_3_week_avg: pointsAgainst.qb_rolling_3_week_avg,
        rb_rolling_3_week_avg: pointsAgainst.rb_rolling_3_week_avg,
        wr_rolling_3_week_avg: pointsAgainst.wr_rolling_3_week_avg,
        te_rolling_3_week_avg: pointsAgainst.te_rolling_3_week_avg,
        k_rolling_3_week_avg: pointsAgainst.k_rolling_3_week_avg,
        qb_odi: pointsAgainst.qb_odi,
        rb_odi: pointsAgainst.rb_odi,
        wr_odi: pointsAgainst.wr_odi,
        te_odi: pointsAgainst.te_odi,
        k_odi: pointsAgainst.k_odi,
        qb_normalized_odi: pointsAgainst.qb_normalized_odi,
        rb_normalized_odi: pointsAgainst.rb_normalized_odi,
        wr_normalized_odi: pointsAgainst.wr_normalized_odi,
        te_normalized_odi: pointsAgainst.te_normalized_odi,
        k_normalized_odi: pointsAgainst.k_normalized_odi,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'league_id,player_id,season_year,week',
      }
    );

    if (error) {
      logger.error('Failed to upsert defense points against', {
        error,
        pointsAgainst,
      });
      throw new Error(
        `Failed to upsert defense points against: ${error.message}`
      );
    }
  } catch (error) {
    logger.error('Error upserting defense points against', {
      error: error instanceof Error ? error.message : String(error),
      pointsAgainst,
    });
    throw error;
  }
}
