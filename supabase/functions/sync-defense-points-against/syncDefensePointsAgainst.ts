import { logger } from '../utils/logger.ts';
import { supabase } from '../utils/supabase.ts';
import { getMostRecentNFLWeek } from '../utils/syncHelpers.ts';

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
        (sum, record) => sum + (record.qb_pts_against || 0),
        0
      ) + currentWeekData.qb_pts_against;
    const rbTotal =
      recentData.reduce(
        (sum, record) => sum + (record.rb_pts_against || 0),
        0
      ) + currentWeekData.rb_pts_against;
    const wrTotal =
      recentData.reduce(
        (sum, record) => sum + (record.wr_pts_against || 0),
        0
      ) + currentWeekData.wr_pts_against;
    const teTotal =
      recentData.reduce(
        (sum, record) => sum + (record.te_pts_against || 0),
        0
      ) + currentWeekData.te_pts_against;
    const kTotal =
      recentData.reduce((sum, record) => sum + (record.k_pts_against || 0), 0) +
      currentWeekData.k_pts_against;

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
