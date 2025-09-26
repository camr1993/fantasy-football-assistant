import { logger } from '../utils/logger.ts';
import { supabase } from '../utils/supabase.ts';
import {
  makeYahooApiCallWithRetry,
  getCurrentNFLWeek,
} from '../utils/syncHelpers.ts';

/**
 * Sync all player injuries (master data)
 */
export async function syncAllPlayerInjuries(
  yahooToken: string
): Promise<number> {
  logger.info('Syncing all player injuries');

  // Get all NFL players with injury status from Yahoo's master player list
  const response = await makeYahooApiCallWithRetry(
    yahooToken,
    'https://fantasysports.yahooapis.com/fantasy/v2/players;game_keys=nfl;out=injury_status?format=json'
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch all player injuries: ${response.status}`);
  }

  const data = await response.json();
  const players = data?.fantasy_content?.players;

  if (!players) {
    logger.warn('No players found in response');
    return 0;
  }

  let processed = 0;
  const currentYear = new Date().getFullYear();
  const currentWeek = getCurrentNFLWeek();
  const currentTime = new Date().toISOString();

  // Process injuries in batches of 200
  const batchSize = 200;
  for (let i = 0; i < players.length; i += batchSize) {
    const batch = players.slice(i, i + batchSize);

    const injuryInserts = [];

    for (const player of batch) {
      const playerData = player.player[0];
      const playerKey = playerData.player_key;
      const injuryStatus = playerData.injury_status;
      const injuryNote = playerData.injury_note;

      // Skip if no injury status or healthy
      if (!injuryStatus || injuryStatus === 'Healthy') continue;

      // Get player ID from our database
      const { data: playerRecord } = await supabase
        .from('players')
        .select('id')
        .eq('yahoo_player_id', playerKey)
        .single();

      if (!playerRecord) continue;

      injuryInserts.push({
        player_id: playerRecord.id,
        season_year: currentYear,
        week: currentWeek,
        status: injuryStatus,
        notes: injuryNote || null,
        report_date: new Date().toISOString().split('T')[0], // Today's date
        last_updated: currentTime,
      });
    }

    if (injuryInserts.length > 0) {
      const { error } = await supabase
        .from('player_injuries')
        .upsert(injuryInserts, {
          onConflict: 'player_id,season_year,week,report_date',
        });

      if (error) {
        logger.error('Failed to upsert player injuries batch', { error });
      } else {
        processed += injuryInserts.length;
      }
    }
  }

  logger.info('Completed syncing all player injuries', { count: processed });
  return processed;
}
