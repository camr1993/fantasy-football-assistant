import { logger } from '../utils/logger.ts';
import { supabase } from '../utils/supabase.ts';
import { makeYahooApiCallWithRetry } from '../utils/syncHelpers.ts';

interface PlayerData {
  player?: Array<
    Array<{
      player_key?: string;
      name?: { full?: string };
      display_position?: string;
      status?: string;
      editorial_team_abbr?: string;
    }>
  >;
}

/**
 * Sync all NFL players (master data)
 * Gets players from user's leagues since global players endpoint requires specific player keys
 */
export async function syncAllPlayers(yahooToken: string): Promise<number> {
  logger.info('Syncing all NFL players from admin league');

  // Get the admin user's league directly from the database
  // First, get the admin user's ID
  const superAdminUserId = Deno.env.get('SUPER_ADMIN_USER_ID');

  // // Get a league that the admin user is part of
  const { data: leagueData, error: leagueError } = await supabase
    .from('leagues')
    .select(
      `
      yahoo_league_id,
      name,
      season_year,
      teams!inner(id, user_id)
    `
    )
    .eq('teams.user_id', superAdminUserId)
    .eq('season_year', new Date().getFullYear())
    .limit(1)
    .single();

  if (leagueError || !leagueData) {
    logger.error('Failed to find admin user league', {
      error: leagueError?.message,
      superAdminUserId,
    });
    throw new Error('Admin user league not found');
  }

  const leagueKey = leagueData.yahoo_league_id;

  if (!leagueKey) {
    logger.error('No league key found for admin league');
    return 0;
  }

  logger.info('Syncing players from league', { leagueKey });

  let totalProcessed = 0;
  const currentTime = new Date().toISOString();

  try {
    // Get all available players from this league using pagination
    const allPlayers = [];
    let start = 0;
    const count = 25; // Yahoo API default page size
    let hasMorePlayers = true;

    while (hasMorePlayers) {
      const playersResponse = await makeYahooApiCallWithRetry(
        yahooToken,
        `https://fantasysports.yahooapis.com/fantasy/v2/league/${leagueKey}/players;start=${start};count=${count}?format=json`
      );

      if (!playersResponse.ok) {
        logger.warn('Failed to fetch players page from league', {
          leagueKey,
          start,
          count,
          status: playersResponse.status,
          statusText: playersResponse.statusText,
        });
        break;
      }

      const playersData = await playersResponse.json();

      const playersObject = playersData?.fantasy_content?.league?.[1]?.players;

      // Convert players object to array (players are stored as {"0": {...}, "1": {...}})
      const players = playersObject ? Object.values(playersObject) : [];

      if (!players || players.length === 0) {
        logger.info('No more players found, pagination complete', {
          leagueKey,
          start,
          totalPlayersSoFar: allPlayers.length,
        });
        hasMorePlayers = false;
        break;
      }

      // Add players to our collection
      allPlayers.push(...players);

      // If we got fewer players than requested, we've reached the end
      if (players.length < count) {
        logger.info('Reached end of players (got fewer than requested)', {
          leagueKey,
          start,
          count,
          playersInPage: players.length,
          totalPlayers: allPlayers.length,
        });
        hasMorePlayers = false;
      } else {
        start += count;
      }
    }

    if (allPlayers.length === 0) {
      logger.warn('No players found in league after pagination', {
        leagueKey,
      });
      return 0;
    }

    const players = allPlayers as PlayerData[];

    // Count players by team to see distribution
    const teamCounts: Record<string, number> = {};
    if (players && players.length > 0) {
      players.forEach((player: PlayerData) => {
        const playerData = player.player?.[0];
        if (playerData) {
          for (let i = 0; i < playerData.length; i++) {
            const item = playerData[i];
            if (item && item.editorial_team_abbr) {
              teamCounts[item.editorial_team_abbr] =
                (teamCounts[item.editorial_team_abbr] || 0) + 1;
              break;
            }
          }
        }
      });
    }

    logger.info('Extracted players', {
      leagueKey,
      playersType: typeof players,
      isArray: Array.isArray(players),
      playersLength: players?.length,
      teamDistribution: teamCounts,
      firstPlayerStructure: players?.[0]
        ? {
            hasPlayer: !!players[0].player,
            playerLength: players[0].player?.length,
            playerKeys: players[0].player?.[0]
              ? Object.keys(players[0].player[0])
              : [],
          }
        : null,
    });

    if (!players || players.length === 0) {
      logger.warn('No players found in league', { leagueKey });
      return 0;
    }

    // Process players in batches of 100
    const batchSize = 100;
    for (let i = 0; i < players.length; i += batchSize) {
      const batch = players.slice(i, i + batchSize);

      const playerInserts = batch
        .map((player: PlayerData, _index: number) => {
          // Each player has a player array with the actual data
          const playerData = player.player?.[0];
          if (!playerData) {
            return null;
          }

          // Player data is structured as an array with numeric indices
          // Let's find the correct indices by searching through the array
          let playerKey = null;
          let name = null;
          let position = null;
          let team = null;

          // Search through the array to find the correct data
          for (let i = 0; i < playerData.length; i++) {
            const item = playerData[i];
            if (item && typeof item === 'object') {
              if (item.player_key) playerKey = item.player_key;
              if (item.name?.full) name = item.name.full;
              if (item.display_position) position = item.display_position;
              if (item.editorial_team_abbr) team = item.editorial_team_abbr;
            }
          }

          if (!name || !position) {
            logger.warn('Player missing required fields', {
              leagueKey,
              playerKey,
              name,
              position,
              hasName: !!name,
              hasPosition: !!position,
            });
            return null;
          }

          return {
            yahoo_player_id: playerKey,
            name,
            position,
            team,
            last_updated: currentTime,
          };
        })
        .filter(Boolean);

      if (playerInserts.length > 0) {
        const { error } = await supabase.from('players').upsert(playerInserts, {
          onConflict: 'yahoo_player_id',
        });

        if (error) {
          logger.error('Failed to upsert players batch', {
            error,
            leagueKey,
            batchSize: playerInserts.length,
          });
        } else {
          totalProcessed += playerInserts.length;
        }
      } else {
        logger.warn('No valid players in batch', {
          leagueKey,
          batchSize: batch.length,
          originalBatchSize: batch.length,
        });
      }
    }

    logger.info('Completed syncing players from league', {
      leagueKey,
      playersFound: players.length,
      playersProcessed: totalProcessed,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Error syncing players from league', {
      leagueKey,
      error: errorMessage,
    });
  }

  logger.info('Completed syncing all players from admin league', {
    totalProcessed,
    leagueKey,
    adminUserId: superAdminUserId,
  });
  return totalProcessed;
}
