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
