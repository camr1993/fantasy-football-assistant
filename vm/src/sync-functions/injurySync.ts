import { logger } from '../../../supabase/functions/utils/logger.ts';
import { supabase } from '../../../supabase/functions/utils/supabase.ts';
import {
  getCurrentNFLSeasonYear,
  makeYahooApiCallWithRetry,
} from '../../../supabase/functions/utils/syncHelpers.ts';

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
 * Sync all player injury statuses (master data)
 * Tracks all players (1 row per player) with their current injury status
 * Gets players from user's leagues since global players endpoint requires specific player keys
 */
export async function syncAllPlayerInjuries(
  yahooToken: string
): Promise<number> {
  logger.info('Syncing all player injury statuses from admin league');

  // Get the admin user's league directly from the database
  // First, get the admin user's ID
  const superAdminUserId = Deno.env.get('SUPER_ADMIN_USER_ID');

  const seasonYear = getCurrentNFLSeasonYear();

  // Get a league that the admin user is part of
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
    .eq('season_year', seasonYear)
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

  logger.info('Syncing player injury statuses from league', { leagueKey });

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

    logger.info('Extracted players for injury sync', {
      leagueKey,
      playersLength: players?.length,
    });

    if (!players || players.length === 0) {
      logger.warn('No players found in league', { leagueKey });
      return 0;
    }

    // Process players in batches of 100
    const batchSize = 100;
    for (let i = 0; i < players.length; i += batchSize) {
      const batch = players.slice(i, i + batchSize);

      // Process ALL players, including those with status 'NA' (healthy)
      const injuryInserts = batch
        .map((player: PlayerData, _index: number) => {
          // Each player has a player array with the actual data
          const playerData = player.player?.[0];
          if (!playerData) {
            return null;
          }

          // Player data is structured as an array with numeric indices
          // Let's find the correct indices by searching through the array
          let playerKey = null;
          let status = null;

          // Search through the array to find the correct data
          for (let i = 0; i < playerData.length; i++) {
            const item = playerData[i];
            if (item && typeof item === 'object') {
              if (item.player_key) playerKey = item.player_key;
              if (item.status) status = item.status;
            }
          }

          // Process all players - if no status or status is 'NA', use 'NA' for healthy
          if (!playerKey) {
            return null;
          }

          // Use 'NA' as the status for healthy players (when status is null or 'NA')
          const finalStatus = status && status !== 'NA' ? status : 'NA';

          return {
            yahoo_player_id: playerKey,
            status: finalStatus,
          };
        })
        .filter(Boolean);

      if (injuryInserts.length > 0) {
        // Get player IDs for the injury records
        const playerKeys = injuryInserts.map(
          (record) => record?.yahoo_player_id
        );

        const { data: playerRecords } = await supabase
          .from('players')
          .select('id, yahoo_player_id')
          .in('yahoo_player_id', playerKeys);

        if (!playerRecords) {
          logger.warn('No player records found for injury batch', {
            leagueKey,
            playerKeys: playerKeys.length,
          });
          continue;
        }

        // Create injury records - one per player with updated_at timestamp
        const injuryRecords = injuryInserts
          .map((injuryRecord) => {
            const playerRecord = playerRecords.find(
              (p: { yahoo_player_id: string; id: string }) =>
                p.yahoo_player_id === injuryRecord?.yahoo_player_id
            );
            if (!playerRecord) return null;

            return {
              player_id: playerRecord.id,
              status: injuryRecord?.status,
              updated_at: currentTime,
            };
          })
          .filter(Boolean);

        if (injuryRecords.length > 0) {
          const { error } = await supabase
            .from('player_injuries')
            .upsert(injuryRecords, {
              onConflict: 'player_id',
            });

          if (error) {
            logger.error('Failed to upsert player injury statuses batch', {
              error,
              leagueKey,
              batchSize: injuryRecords.length,
            });
          } else {
            totalProcessed += injuryRecords.length;
          }
        }
      } else {
        logger.warn('No valid player records in batch', {
          leagueKey,
          batchSize: batch.length,
        });
      }
    }

    logger.info('Completed syncing player injury statuses from league', {
      leagueKey,
      playersFound: players.length,
      playersProcessed: totalProcessed,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Error syncing player injury statuses from league', {
      leagueKey,
      error: errorMessage,
    });
  }

  logger.info(
    'Completed syncing all player injury statuses from admin league',
    {
      totalProcessed,
      leagueKey,
      adminUserId: superAdminUserId,
    }
  );
  return totalProcessed;
}
