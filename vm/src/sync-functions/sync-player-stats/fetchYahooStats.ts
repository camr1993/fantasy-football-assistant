import { logger } from '../../../../supabase/functions/utils/logger.ts';
import { makeYahooApiCallWithRetry } from '../../../../supabase/functions/utils/syncHelpers.ts';

/**
 * Fetch player stats from Yahoo API in batches
 */
export async function fetchYahooPlayerStats(
  yahooToken: string,
  playerRecords: Array<{ yahoo_player_id: string }>,
  week: number,
  batchSize: number = 25
): Promise<unknown[]> {
  const allPlayers = [];

  for (let i = 0; i < playerRecords.length; i += batchSize) {
    const batch = playerRecords.slice(i, i + batchSize);
    const playerKeys = batch
      .map((p: { yahoo_player_id: string }) => p.yahoo_player_id)
      .join(',');

    const weeklyStatsUrl = `https://fantasysports.yahooapis.com/fantasy/v2/players;player_keys=${playerKeys}/stats;type=week;week=${week}?format=json`;

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
      totalPlayersRequested: playerRecords.length,
    });
  }

  return allPlayers;
}

