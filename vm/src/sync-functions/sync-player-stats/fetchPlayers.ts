import { logger } from '../../../../supabase/functions/utils/logger.ts';
import { supabase } from '../../../../supabase/functions/utils/supabase.ts';

/**
 * Fetch all players from the database with pagination
 */
export async function fetchAllPlayers(): Promise<
  Array<{ yahoo_player_id: string }>
> {
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
      throw new Error(`Failed to fetch players: ${playersError.message}`);
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
    logger.warn('No players found in database');
  } else {
    logger.info('Fetched all players from database', {
      totalPlayers: allPlayerRecords.length,
    });
  }

  return allPlayerRecords;
}

