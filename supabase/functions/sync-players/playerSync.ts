import { logger } from '../utils/logger.ts';
import { supabase } from '../utils/supabase.ts';
import {
  makeYahooApiCallWithRetry,
  calculatePointsFromStats,
  getCurrentNFLWeek,
} from '../utils/syncHelpers.ts';

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

  // Debug: Log the structure to understand the response format
  logger.info('Leagues response structure', {
    hasFantasyContent: !!leaguesData?.fantasy_content,
    fantasyContentKeys: leaguesData?.fantasy_content
      ? Object.keys(leaguesData.fantasy_content)
      : [],
    usersStructure: leaguesData?.fantasy_content?.users
      ? leaguesData.fantasy_content.users
      : null,
  });

  // Extract leagues from the correct path based on the actual response structure
  const leaguesObject =
    leaguesData?.fantasy_content?.users?.[0]?.user?.[1]?.games?.[0]?.game?.[1]
      ?.leagues;

  // Convert the leagues object to an array
  // Based on the response structure, each league is directly in the object
  const leagues = leaguesObject
    ? Object.values(leaguesObject).map((leagueData) =>
        leagueData.league ? leagueData.league[0] : leagueData
      )
    : [];

  logger.info('Extracted leagues', {
    leaguesType: typeof leagues,
    isArray: Array.isArray(leagues),
    leaguesLength: leagues?.length,
    leaguesValue: leagues,
  });

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
        logger.info('Fetching players page', {
          leagueKey,
          start,
          count,
        });

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

        // Debug: Log the players response structure for first page only
        if (start === 0) {
          logger.info('Players response structure', {
            leagueKey,
            hasFantasyContent: !!playersData?.fantasy_content,
            fantasyContentKeys: playersData?.fantasy_content
              ? Object.keys(playersData.fantasy_content)
              : [],
            leagueStructure: playersData?.fantasy_content?.league,
          });
        }

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

        logger.info('Fetched players page', {
          leagueKey,
          start,
          count,
          playersInPage: players.length,
          totalPlayersSoFar: allPlayers.length,
        });

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

      const players = allPlayers;

      // Count players by team to see distribution
      const teamCounts = {};
      if (players && players.length > 0) {
        players.forEach((player) => {
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
          .map((player, index) => {
            // Each player has a player array with the actual data
            const playerData = player.player?.[0];
            if (!playerData) {
              logger.warn('No player data found', {
                leagueKey,
                playerIndex: index,
                player,
              });
              return null;
            }

            // Log the actual structure of the first player to understand the data format
            if (index === 0) {
              logger.info('First player data structure', {
                leagueKey,
                playerDataKeys: Object.keys(playerData),
                playerData: playerData,
              });
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

            logger.debug('Processing player', {
              leagueKey,
              playerIndex: index,
              playerKey,
              name,
              position,
              status,
              team,
              hasName: !!name,
              hasPosition: !!position,
              playerDataKeys: Object.keys(playerData),
            });

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

        logger.info('Processing player batch', {
          leagueKey,
          batchSize: playerInserts.length,
          totalPlayers: players.length,
          currentBatch: i,
        });

        if (playerInserts.length > 0) {
          logger.info('Inserting players batch', {
            leagueKey,
            count: playerInserts.length,
            samplePlayer: playerInserts[0],
          });

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
            logger.info('Successfully inserted players batch', {
              leagueKey,
              count: playerInserts.length,
              totalProcessed,
            });
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
    } catch (error) {
      logger.error('Error syncing players from league', {
        leagueKey,
        error: error.message,
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
  logger.info('Syncing all player stats from user leagues');

  const currentWeek = getCurrentNFLWeek();
  const currentYear = new Date().getFullYear();

  // First, get user's leagues to find NFL leagues
  const leaguesResponse = await makeYahooApiCallWithRetry(
    yahooToken,
    'https://fantasysports.yahooapis.com/fantasy/v2/users;use_login=1/games;game_keys=nfl/leagues?format=json'
  );

  if (!leaguesResponse.ok) {
    const errorText = await leaguesResponse.text();
    logger.error('Failed to fetch user leagues for stats from Yahoo API', {
      status: leaguesResponse.status,
      statusText: leaguesResponse.statusText,
      responseBody: errorText.substring(0, 1000),
    });
    throw new Error(
      `Failed to fetch user leagues for stats: ${leaguesResponse.status}`
    );
  }

  const leaguesData = await leaguesResponse.json();

  // Debug: Log the structure to understand the response format
  logger.info('Leagues response structure for stats', {
    hasFantasyContent: !!leaguesData?.fantasy_content,
    fantasyContentKeys: leaguesData?.fantasy_content
      ? Object.keys(leaguesData.fantasy_content)
      : [],
    usersStructure: leaguesData?.fantasy_content?.users
      ? leaguesData.fantasy_content.users
      : null,
  });

  // Extract leagues from the correct path based on the actual response structure
  const leaguesObject =
    leaguesData?.fantasy_content?.users?.[0]?.user?.[1]?.games?.[0]?.game?.[1]
      ?.leagues;

  // Convert the leagues object to an array
  // Based on the response structure, each league is directly in the object
  const leagues = leaguesObject
    ? Object.values(leaguesObject).map((leagueData) =>
        leagueData.league ? leagueData.league[0] : leagueData
      )
    : [];

  logger.info('Extracted leagues for stats', {
    leaguesType: typeof leagues,
    isArray: Array.isArray(leagues),
    leaguesLength: leagues?.length,
    leaguesValue: leagues,
  });

  if (!leagues || !Array.isArray(leagues) || leagues.length === 0) {
    logger.warn('No NFL leagues found for user stats sync', {
      leaguesType: typeof leagues,
      isArray: Array.isArray(leagues),
      leaguesValue: leagues,
    });
    return 0;
  }

  let totalProcessed = 0;

  // Get player stats from each league
  for (const league of leagues) {
    const leagueKey = league.league_key;
    if (!leagueKey) continue;

    logger.info('Syncing player stats from league', { leagueKey });

    try {
      // Get players with stats from this league using pagination
      const allPlayers = [];
      let start = 0;
      const count = 25; // Yahoo API default page size
      let hasMorePlayers = true;

      while (hasMorePlayers) {
        logger.info('Fetching players stats page', {
          leagueKey,
          start,
          count,
          currentWeek,
        });

        const playersResponse = await makeYahooApiCallWithRetry(
          yahooToken,
          `https://fantasysports.yahooapis.com/fantasy/v2/league/${leagueKey}/players;out=stats;stats_type=season;week=${currentWeek};start=${start};count=${count}?format=json`
        );

        if (!playersResponse.ok) {
          logger.warn('Failed to fetch player stats page from league', {
            leagueKey,
            start,
            count,
            status: playersResponse.status,
            statusText: playersResponse.statusText,
          });
          break;
        }

        const playersData = await playersResponse.json();

        // Debug: Log the players stats response structure for first page only
        if (start === 0) {
          logger.info('Players stats response structure', {
            leagueKey,
            hasFantasyContent: !!playersData?.fantasy_content,
            fantasyContentKeys: playersData?.fantasy_content
              ? Object.keys(playersData.fantasy_content)
              : [],
            leagueStructure: playersData?.fantasy_content?.league,
          });
        }

        const playersObject =
          playersData?.fantasy_content?.league?.[1]?.players;

        // Convert players object to array (players are stored as {"0": {...}, "1": {...}})
        const players = playersObject ? Object.values(playersObject) : [];

        if (!players || players.length === 0) {
          logger.info('No more players found for stats, pagination complete', {
            leagueKey,
            start,
            totalPlayersSoFar: allPlayers.length,
          });
          hasMorePlayers = false;
          break;
        }

        // Add players to our collection
        allPlayers.push(...players);

        logger.info('Fetched players stats page', {
          leagueKey,
          start,
          count,
          playersInPage: players.length,
          totalPlayersSoFar: allPlayers.length,
        });

        // If we got fewer players than requested, we've reached the end
        if (players.length < count) {
          logger.info(
            'Reached end of players for stats (got fewer than requested)',
            {
              leagueKey,
              start,
              count,
              playersInPage: players.length,
              totalPlayers: allPlayers.length,
            }
          );
          hasMorePlayers = false;
        } else {
          start += count;
        }
      }

      if (allPlayers.length === 0) {
        logger.warn('No players found in league for stats after pagination', {
          leagueKey,
        });
        continue;
      }

      const players = allPlayers;

      logger.info('Extracted players for stats', {
        leagueKey,
        playersType: typeof players,
        isArray: Array.isArray(players),
        playersLength: players?.length,
        playersValue: players,
      });

      if (!players || players.length === 0) {
        logger.warn('No player stats found in league', { leagueKey });
        continue;
      }

      // Process stats in batches of 50
      const batchSize = 50;
      for (let i = 0; i < players.length; i += batchSize) {
        const batch = players.slice(i, i + batchSize);

        const statsInserts = [];

        for (let playerIndex = 0; playerIndex < batch.length; playerIndex++) {
          const player = batch[playerIndex];
          // Each player has a player array with the actual data
          const playerData = player.player?.[0];
          if (!playerData) {
            logger.warn('No player data found', {
              leagueKey,
              playerIndex,
              player,
            });
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

          // Stats are the second element in the player array
          const stats = player.player?.[1]?.player_stats?.stats;

          // Debug logging for stats processing
          if (playerIndex === 0) {
            logger.info('First player stats data', {
              leagueKey,
              playerKey,
              hasStats: !!stats,
              statsLength: stats?.length,
              statsSample: stats?.slice(0, 3),
              playerKeys: Object.keys(player),
              playerArrayLength: player.player?.length,
              hasPlayerStatsAt1: !!player.player?.[1]?.player_stats,
              playerStatsKeys: player.player?.[1]?.player_stats
                ? Object.keys(player.player[1].player_stats)
                : null,
              playerStatsStructure: player.player?.[1]?.player_stats,
              statsType: typeof stats,
              statsIsArray: Array.isArray(stats),
            });
          }

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

          const points = calculatePointsFromStats(stats);

          statsInserts.push({
            player_id: playerRecord.id,
            season_year: currentYear,
            week: currentWeek,
            source: 'actual',
            points,
            stats,
          });
        }

        logger.info('Stats batch processing summary', {
          leagueKey,
          batchSize: batch.length,
          statsInsertsCount: statsInserts.length,
          statsInsertsSample: statsInserts.slice(0, 2),
        });

        if (statsInserts.length > 0) {
          const { error } = await supabase
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
            logger.info('Successfully inserted player stats batch', {
              leagueKey,
              count: statsInserts.length,
              totalProcessed,
            });
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
    } catch (error) {
      logger.error('Error syncing player stats from league', {
        leagueKey,
        error: error.message,
      });
    }
  }

  logger.info('Completed syncing all player stats from user leagues', {
    totalProcessed,
    leaguesProcessed: leagues.length,
  });
  return totalProcessed;
}
