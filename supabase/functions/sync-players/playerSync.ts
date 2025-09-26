import { logger } from '../utils/logger.ts';
import { supabase } from '../utils/supabase.ts';
import {
  makeYahooApiCallWithRetry,
  calculatePointsFromStats,
  getCurrentNFLWeek,
} from '../utils/syncHelpers.ts';

/**
 * Sync all NFL players (master data)
 */
export async function syncAllPlayers(yahooToken: string): Promise<number> {
  logger.info('Syncing all NFL players');

  // Get all NFL players from Yahoo's master player list
  const response = await makeYahooApiCallWithRetry(
    yahooToken,
    'https://fantasysports.yahooapis.com/fantasy/v2/players;game_keys=nfl?format=json'
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch all players: ${response.status}`);
  }

  const data = await response.json();
  const players = data?.fantasy_content?.players;

  if (!players) {
    logger.warn('No players found in response');
    return 0;
  }

  let processed = 0;
  const currentTime = new Date().toISOString();

  // Process players in batches of 100
  const batchSize = 100;
  for (let i = 0; i < players.length; i += batchSize) {
    const batch = players.slice(i, i + batchSize);

    const playerInserts = batch
      .map((player) => {
        const playerData = player.player[0];
        const playerKey = playerData.player_key;
        const name = playerData.name?.full;
        const position = playerData.display_position;
        const status = playerData.status;
        const team = playerData.team_abbr;

        if (!name || !position) return null;

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
      const { error } = await supabase.from('players').upsert(playerInserts, {
        onConflict: 'yahoo_player_id',
      });

      if (error) {
        logger.error('Failed to upsert players batch', { error });
      } else {
        processed += playerInserts.length;
      }
    }
  }

  logger.info('Completed syncing all players', { count: processed });
  return processed;
}

/**
 * Sync all player stats (master data)
 */
export async function syncAllPlayerStats(yahooToken: string): Promise<number> {
  logger.info('Syncing all player stats');

  const currentWeek = getCurrentNFLWeek();
  const currentYear = new Date().getFullYear();

  // Get all NFL players with stats from Yahoo's master player list
  const response = await makeYahooApiCallWithRetry(
    yahooToken,
    `https://fantasysports.yahooapis.com/fantasy/v2/players;game_keys=nfl;out=stats;stats_type=season;week=${currentWeek}?format=json`
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch all player stats: ${response.status}`);
  }

  const data = await response.json();
  const players = data?.fantasy_content?.players;

  if (!players) {
    logger.warn('No player stats found in response');
    return 0;
  }

  let processed = 0;

  // Process stats in batches of 50
  const batchSize = 50;
  for (let i = 0; i < players.length; i += batchSize) {
    const batch = players.slice(i, i + batchSize);

    const statsInserts = [];

    for (const player of batch) {
      const playerData = player.player[0];
      const playerKey = playerData.player_key;
      const stats = playerData.stats;

      if (!stats || stats.length === 0) continue;

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

    if (statsInserts.length > 0) {
      const { error } = await supabase
        .from('player_stats')
        .upsert(statsInserts, {
          onConflict: 'player_id,season_year,week,source',
        });

      if (error) {
        logger.error('Failed to upsert player stats batch', { error });
      } else {
        processed += statsInserts.length;
      }
    }
  }

  logger.info('Completed syncing all player stats', { count: processed });
  return processed;
}
