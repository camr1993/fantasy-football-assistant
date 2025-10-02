import { logger } from '../utils/logger.ts';
import { supabase } from '../utils/supabase.ts';
import {
  calculatePointsFromStats,
  getMostRecentNFLWeek,
  makeYahooApiCallWithRetry,
} from '../utils/syncHelpers.ts';
import { mapYahooStatsToColumns } from './statMapper.ts';

interface PlayerStatsData {
  player?: Array<unknown>;
}

/**
 * Sync all player stats (master data)
 * Gets player stats from user's leagues since global players endpoint requires specific player keys
 */
export async function syncAllPlayerStats(
  yahooToken: string,
  week?: number
): Promise<number> {
  const currentWeek = week ?? getMostRecentNFLWeek();

  logger.info('Syncing all player stats from admin league', {
    week: currentWeek,
    isCustomWeek: week !== undefined,
  });
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
    .eq('season_year', currentYear)
    .eq('teams.user_id', adminUser.id)
    .limit(1)
    .single();

  if (leagueError || !leagueData) {
    logger.error('Failed to fetch admin user league from database', {
      error: leagueError,
      currentYear,
      adminUserId: adminUser.id,
    });
    throw new Error(
      `Failed to fetch admin user league: ${
        leagueError?.message || 'No league found for admin user'
      }`
    );
  }

  const leagueKey = leagueData.yahoo_league_id;
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
      const playerKeys = batch
        .map((p: { yahoo_player_id: string }) => p.yahoo_player_id)
        .join(',');

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

    const players = allPlayers as unknown[];

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
        const player = batch[playerIndex] as PlayerStatsData;

        // Each player has a player array with the actual data
        const playerData = player.player?.[0] as unknown[];
        if (!playerData || !Array.isArray(playerData)) {
          continue;
        }

        // Player data is structured as an array with numeric indices
        // Search through the array to find the correct data
        let playerKey: string | null = null;

        for (let i = 0; i < playerData.length; i++) {
          const item = playerData[i] as Record<string, unknown>;
          if (item && typeof item === 'object') {
            if (item.player_key) playerKey = item.player_key as string;
          }
        }

        // Stats are in the player_stats object
        const playerStats = player.player?.[1] as Record<string, unknown>;
        const stats = (playerStats?.player_stats as Record<string, unknown>)
          ?.stats as Array<Record<string, unknown>>;

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
        const yahooStats = stats.map((stat) => ({
          stat: {
            stat_id: (stat as any).stat?.stat_id as string,
            value: (stat as any).stat?.value as string | number,
          },
        }));
        const mappedStats = mapYahooStatsToColumns(yahooStats, playerKey || '');

        // Calculate points using the old method for now (can be updated later)
        const points = calculatePointsFromStats(yahooStats);
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
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Error syncing player stats from league', {
      leagueKey,
      error: errorMessage,
    });
  }

  logger.info('Completed syncing all player stats from admin user league', {
    totalProcessed,
    leagueKey,
    adminUserId: adminUser.id,
    adminName: 'Cameron Ratliff',
  });
  return totalProcessed;
}
