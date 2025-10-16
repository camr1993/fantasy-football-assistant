import { logger } from '../utils/logger.ts';
import { supabase } from '../utils/supabase.ts';
import { getMostRecentNFLWeek } from '../utils/syncHelpers.ts';

interface DefensePointsAgainst {
  league_id: string;
  player_id: string;
  season_year: number;
  week: number;
  QB_pts_against: number;
  RB_pts_against: number;
  WR_pts_against: number;
  TE_pts_against: number;
  K_pts_against: number;
}

/**
 * Sync defense points against for all defense players
 * Calculates weekly fantasy points allowed by position against each defense
 */
export async function syncDefensePointsAgainst(week?: number): Promise<number> {
  const currentYear = new Date().getFullYear();
  const currentWeek = week ?? getMostRecentNFLWeek();

  // First, populate opponent_defense_player_id for all player stats
  await populateOpponentDefensePlayerIds(currentYear, currentWeek);

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
  logger.debug('Calculating defense points against', {
    leagueId,
    defensePlayerId,
    seasonYear,
    week,
  });

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
      QB_pts_against: 0,
      RB_pts_against: 0,
      WR_pts_against: 0,
      TE_pts_against: 0,
      K_pts_against: 0,
    };

    // Sum up points by position
    for (const stat of positionStats) {
      const position = stat.position as string;
      const points = parseFloat(stat.total_points || '0');

      switch (position) {
        case 'QB':
          pointsAgainst.QB_pts_against += points;
          break;
        case 'RB':
          pointsAgainst.RB_pts_against += points;
          break;
        case 'WR':
          pointsAgainst.WR_pts_against += points;
          break;
        case 'TE':
          pointsAgainst.TE_pts_against += points;
          break;
        case 'K':
          pointsAgainst.K_pts_against += points;
          break;
        default:
          logger.debug('Unknown position found', { position, points });
      }
    }

    logger.debug('Calculated defense points against', {
      leagueId,
      defensePlayerId,
      pointsAgainst,
    });

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
        QB_pts_against: pointsAgainst.QB_pts_against,
        RB_pts_against: pointsAgainst.RB_pts_against,
        WR_pts_against: pointsAgainst.WR_pts_against,
        TE_pts_against: pointsAgainst.TE_pts_against,
        K_pts_against: pointsAgainst.K_pts_against,
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

    logger.debug('Successfully upserted defense points against', {
      leagueId: pointsAgainst.league_id,
      playerId: pointsAgainst.player_id,
      seasonYear: pointsAgainst.season_year,
      week: pointsAgainst.week,
    });
  } catch (error) {
    logger.error('Error upserting defense points against', {
      error: error instanceof Error ? error.message : String(error),
      pointsAgainst,
    });
    throw error;
  }
}

/**
 * Populates opponent_defense_player_id for all player stats in the given week
 */
async function populateOpponentDefensePlayerIds(
  seasonYear: number,
  week: number
): Promise<void> {
  try {
    logger.info('Populating opponent defense player IDs', {
      seasonYear,
      week,
    });

    // Get all player stats that need opponent_defense_player_id populated
    const { data: playerStats, error: statsError } = await supabase
      .from('player_stats')
      .select(
        `
        id,
        player_id,
        season_year,
        week,
        players!player_stats_player_id_fkey(team)
      `
      )
      .eq('season_year', seasonYear)
      .eq('week', week)
      .is('opponent_defense_player_id', null)
      .eq('source', 'actual');

    if (statsError) {
      logger.error('Failed to fetch player stats', { error: statsError });
      throw new Error(`Failed to fetch player stats: ${statsError.message}`);
    }

    if (!playerStats || playerStats.length === 0) {
      logger.info('No player stats found that need opponent defense player ID');
      return;
    }

    logger.info(`Found ${playerStats.length} player stats to update`);

    // Process in batches to avoid overwhelming the database
    const batchSize = 100;
    let updatedCount = 0;

    for (let i = 0; i < playerStats.length; i += batchSize) {
      const batch = playerStats.slice(i, i + batchSize);
      const updates = [];

      for (const stat of batch) {
        const playerTeam = (stat as any).players?.team;

        if (!playerTeam) {
          logger.debug('Player has no team, skipping', {
            playerId: stat.player_id,
            statId: stat.id,
          });
          continue;
        }

        try {
          // Find the matchup for this team in the current week
          const { data: matchup } = await supabase
            .from('nfl_matchups')
            .select('home_team, away_team')
            .eq('season', seasonYear)
            .eq('week', week)
            .or(`home_team.eq.${playerTeam},away_team.eq.${playerTeam}`)
            .single();

          if (matchup) {
            // Determine the opposing team (case-insensitive comparison)
            const playerTeamLower = playerTeam.toLowerCase();
            const homeTeamLower = matchup.home_team.toLowerCase();

            const opposingTeam =
              homeTeamLower === playerTeamLower
                ? matchup.away_team
                : matchup.home_team;

            // Find the defense player for the opposing team
            const { data: defensePlayer } = await supabase
              .from('players')
              .select('id')
              .ilike('team', opposingTeam)
              .eq('position', 'DEF')
              .single();

            if (defensePlayer) {
              updates.push({
                id: stat.id,
                opponent_defense_player_id: defensePlayer.id,
              });
            }
          }
        } catch (error) {
          logger.debug('Could not find opponent defense player', {
            playerTeam,
            week,
            season: seasonYear,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Update the batch
      if (updates.length > 0) {
        // Update each record individually to avoid upsert issues
        let batchUpdatedCount = 0;
        for (const update of updates) {
          const { error: updateError } = await supabase
            .from('player_stats')
            .update({
              opponent_defense_player_id: update.opponent_defense_player_id,
            })
            .eq('id', update.id);

          if (updateError) {
            logger.error('Failed to update individual player stat', {
              error: updateError,
              statId: update.id,
            });
          } else {
            batchUpdatedCount++;
          }
        }

        updatedCount += batchUpdatedCount;
        logger.debug('Updated opponent defense player IDs', {
          batchSize: updates.length,
          batchUpdatedCount,
          totalUpdated: updatedCount,
        });
      }
    }

    logger.info('Completed populating opponent defense player IDs', {
      totalStats: playerStats.length,
      updatedCount,
    });
  } catch (error) {
    logger.error('Error populating opponent defense player IDs', {
      error: error instanceof Error ? error.message : String(error),
      seasonYear,
      week,
    });
    throw error;
  }
}
