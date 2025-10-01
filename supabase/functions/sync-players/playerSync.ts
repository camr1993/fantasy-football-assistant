import { logger } from '../utils/logger.ts';
import { supabase } from '../utils/supabase.ts';
import {
  calculatePointsFromStats,
  getMostRecentNFLWeek,
  makeYahooApiCallWithRetry,
} from '../utils/syncHelpers.ts';
import { mapYahooStatsToColumns } from './statMapper.ts';

/**
 * Sync all NFL players (master data)
 * Gets players from user's leagues since global players endpoint requires specific player keys
 */
export async function syncAllPlayers(yahooToken: string): Promise<number> {
  logger.info('Syncing all NFL players from user leagues');

  // First, get user's leagues to find NFL leagues
  const leaguesResponse = await makeYahooApiCallWithRetry(
    yahooToken,
    'https://fantasysports.yahooapis.com/fantasy/v2/users;use_login=1/games;game_keys=nfl/leagues?format=json'
  );

  if (!leaguesResponse.ok) {
    const errorText = await leaguesResponse.text();
    logger.error('Failed to fetch user leagues from Yahoo API', {
      status: leaguesResponse.status,
      statusText: leaguesResponse.statusText,
      responseBody: errorText.substring(0, 1000),
    });
    throw new Error(`Failed to fetch user leagues: ${leaguesResponse.status}`);
  }

  const leaguesData = await leaguesResponse.json();

  // Extract leagues from the correct path based on the actual response structure
  const leaguesObject =
    leaguesData?.fantasy_content?.users?.[0]?.user?.[1]?.games?.[0]?.game?.[1]
      ?.leagues;

  // Convert the leagues object to an array
  // Based on the response structure, each league is directly in the object
  const leagues = leaguesObject
    ? Object.values(leaguesObject).map((leagueData: any) =>
        leagueData.league ? leagueData.league[0] : leagueData
      )
    : [];

  if (!leagues || !Array.isArray(leagues) || leagues.length === 0) {
    logger.warn('No NFL leagues found for user', {
      leaguesType: typeof leagues,
      isArray: Array.isArray(leagues),
      leaguesValue: leagues,
    });
    return 0;
  }

  let totalProcessed = 0;
  const currentTime = new Date().toISOString();

  // Get players from each league
  for (const league of leagues) {
    const leagueKey = league.league_key;
    if (!leagueKey) continue;

    logger.info('Syncing players from league', {
      leagueKey,
      leagueName: league.name,
      numTeams: league.num_teams,
    });

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

        const playersObject =
          playersData?.fantasy_content?.league?.[1]?.players;

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
        continue;
      }

      const players = allPlayers as any[];

      // Count players by team to see distribution
      const teamCounts: Record<string, number> = {};
      if (players && players.length > 0) {
        players.forEach((player: any) => {
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
        continue;
      }

      // Process players in batches of 100
      const batchSize = 100;
      for (let i = 0; i < players.length; i += batchSize) {
        const batch = players.slice(i, i + batchSize);

        const playerInserts = batch
          .map((player: any, index: number) => {
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
            let status = null;
            let team = null;

            // Search through the array to find the correct data
            for (let i = 0; i < playerData.length; i++) {
              const item = playerData[i];
              if (item && typeof item === 'object') {
                if (item.player_key) playerKey = item.player_key;
                if (item.name?.full) name = item.name.full;
                if (item.display_position) position = item.display_position;
                if (item.status) status = item.status;
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
              status,
              team,
              last_updated: currentTime,
            };
          })
          .filter(Boolean);

        if (playerInserts.length > 0) {
          const { error } = await supabase
            .from('players')
            .upsert(playerInserts, {
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
        leagueName: league.name,
        numTeams: league.num_teams,
        playersFound: players.length,
        playersProcessed: totalProcessed,
        expectedPlayers: league.num_teams * 15, // Rough estimate: 15 players per team
      });
    } catch (error: any) {
      logger.error('Error syncing players from league', {
        leagueKey,
        error: error?.message,
      });
    }
  }

  logger.info('Completed syncing all players from user leagues', {
    totalProcessed,
    leaguesProcessed: leagues.length,
  });
  return totalProcessed;
}

/**
 * Sync all player stats (master data)
 * Gets player stats from user's leagues since global players endpoint requires specific player keys
 */
export async function syncAllPlayerStats(yahooToken: string): Promise<number> {
  logger.info('Syncing all player stats from admin league');

  const currentWeek = getMostRecentNFLWeek();
  const currentYear = new Date().getFullYear();

  // Get the admin user's league directly from the database
  // First, get the admin user's ID
  const { data: adminUser, error: userError } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('name', 'Cameron Ratliff')
    .single();

  if (userError || !adminUser) {
    logger.error('Failed to find admin user', {
      error: userError,
      name: 'Cameron Ratliff',
    });
    throw new Error(
      `Admin user not found: ${userError?.message || 'No user found'}`
    );
  }

  // Get a league where the admin user has a team
  // const { data: leagueData, error: leagueError } = await supabase
  //   .from('leagues')
  //   .select(
  //     `
  //     yahoo_league_id,
  //     name,
  //     season_year,
  //     teams!inner(id, user_id)
  //   `
  //   )
  //   .eq('season_year', currentYear)
  //   .eq('teams.user_id', adminUser.id)
  //   .limit(1)
  //   .single();

  // if (leagueError || !leagueData) {
  //   logger.error('Failed to fetch admin user league from database', {
  //     error: leagueError,
  //     currentYear,
  //     adminUserId: adminUser.id,
  //   });
  //   throw new Error(
  //     `Failed to fetch admin user league: ${
  //       leagueError?.message || 'No league found for admin user'
  //     }`
  //   );
  // }

  // const leagueKey = leagueData.yahoo_league_id;
  const leagueKey = '461.l.869919';
  let totalProcessed = 0;

  try {
    // Get all player IDs from the database with pagination
    const allPlayerRecords = [];
    let from = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: playerRecords, error: playersError } = await supabase
        .from('players')
        .select('yahoo_player_id')
        .not('yahoo_player_id', 'is', null)
        .range(from, from + pageSize - 1);

      if (playersError) {
        logger.error('Failed to fetch players from database', {
          error: playersError,
          from,
          pageSize,
        });
        return 0;
      }

      if (!playerRecords || playerRecords.length === 0) {
        hasMore = false;
        break;
      }

      allPlayerRecords.push(...playerRecords);

      if (playerRecords.length < pageSize) {
        hasMore = false;
      } else {
        from += pageSize;
      }
    }

    if (allPlayerRecords.length === 0) {
      logger.error('No players found in database');
      return 0;
    }

    logger.info('Fetched all players from database', {
      totalPlayers: allPlayerRecords.length,
    });

    // Process players in batches of 25
    const requestBatchSize = 25;
    const allPlayers = [];

    for (let i = 0; i < allPlayerRecords.length; i += requestBatchSize) {
      const batch = allPlayerRecords.slice(i, i + requestBatchSize);
      const playerKeys = batch.map((p: any) => p.yahoo_player_id).join(',');

      const weeklyStatsUrl = `https://fantasysports.yahooapis.com/fantasy/v2/players;player_keys=${playerKeys}/stats;type=week;week=${currentWeek}?format=json`;

      const playersResponse = await makeYahooApiCallWithRetry(
        yahooToken,
        weeklyStatsUrl
      );

      if (!playersResponse.ok) {
        logger.warn('Failed to fetch player stats batch', {
          batchStart: i,
          batchSize: batch.length,
          status: playersResponse.status,
          statusText: playersResponse.statusText,
        });
        continue;
      }

      const playersData = await playersResponse.json();

      // Extract players from the response
      const playersObject = playersData?.fantasy_content?.players;
      if (playersObject) {
        const players = Object.values(playersObject);
        allPlayers.push(...players);
      }
    }

    if (allPlayers.length === 0) {
      logger.warn('No players with stats found', {
        totalPlayersRequested: allPlayerRecords.length,
      });
      return 0;
    }

    const players = allPlayers as any[];

    if (!players || players.length === 0) {
      logger.warn('No player stats found in league', { leagueKey });
      return 0;
    }

    // Process stats in larger batches to reduce processing time
    const batchSize = 100;
    for (let i = 0; i < players.length; i += batchSize) {
      const batch = players.slice(i, i + batchSize);

      const statsInserts = [];

      for (let playerIndex = 0; playerIndex < batch.length; playerIndex++) {
        const player = batch[playerIndex] as any;

        // Each player has a player array with the actual data
        const playerData = player.player?.[0];
        if (!playerData) {
          continue;
        }

        // Player data is structured as an array with numeric indices
        // Search through the array to find the correct data
        let playerKey = null;

        for (let i = 0; i < playerData.length; i++) {
          const item = playerData[i];
          if (item && typeof item === 'object') {
            if (item.player_key) playerKey = item.player_key;
          }
        }

        // Stats are in the player_stats object
        const stats = player.player?.[1]?.player_stats?.stats;

        if (!stats || stats.length === 0) {
          logger.debug('Player has no stats, skipping', {
            leagueKey,
            playerKey,
            hasStats: !!stats,
            statsLength: stats?.length,
          });
          continue;
        }

        // Get player ID from our database
        const { data: playerRecord } = await supabase
          .from('players')
          .select('id')
          .eq('yahoo_player_id', playerKey)
          .single();

        if (!playerRecord) continue;

        // Map Yahoo stats to individual columns
        const mappedStats = mapYahooStatsToColumns(stats, playerKey);

        // Calculate points using the old method for now (can be updated later)
        const points = calculatePointsFromStats(stats);
        const currentTime = new Date().toISOString();

        statsInserts.push({
          player_id: playerRecord.id,
          season_year: currentYear,
          week: currentWeek,
          source: 'actual',
          points,
          updated_at: currentTime,
          // Individual stat columns
          ...mappedStats,
        });
      }

      if (statsInserts.length > 0) {
        // Try using insert with onConflict instead of upsert
        const { error, data } = await supabase
          .from('player_stats')
          .upsert(statsInserts, {
            onConflict: 'player_id,season_year,week,source',
          });

        if (error) {
          logger.error('Failed to upsert player stats batch', {
            error,
            leagueKey,
          });
        } else {
          totalProcessed += statsInserts.length;
        }
      } else {
        logger.warn('No stats to insert for this batch', {
          leagueKey,
          batchSize: batch.length,
        });
      }
    }

    logger.info('Completed syncing player stats from league', {
      leagueKey,
      count: players.length,
    });
  } catch (error: any) {
    logger.error('Error syncing player stats from league', {
      leagueKey,
      error: error.message,
    });
  }

  logger.info('Completed syncing all player stats from admin user league', {
    totalProcessed,
    leagueKey,
    // leagueName: leagueData.name,
    // seasonYear: leagueData.season_year,
    adminUserId: adminUser.id,
    adminName: 'Cameron Ratliff',
  });
  return totalProcessed;
}
