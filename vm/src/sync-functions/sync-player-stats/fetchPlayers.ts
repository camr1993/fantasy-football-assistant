import { logger } from '../../../../supabase/functions/utils/logger.ts';
import { supabase } from '../../../../supabase/functions/utils/supabase.ts';

/**
 * Fetch the players belonging to one Yahoo game key (i.e. one season).
 *
 * Yahoo embeds the game key in every player key, so `players` holds a separate
 * row per person per season. Fetching all of them would ask Yahoo for this
 * season's stats using last season's player keys, writing a duplicate set of
 * stats rows that nothing else references - and that then surface as
 * "available" free agents because rosters only ever point at current-season
 * rows.
 */
export async function fetchAllPlayers(
  gameKey: string
): Promise<Array<{ yahoo_player_id: string }>> {
  const allPlayerRecords = [];
  let from = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: playerRecords, error: playersError } = await supabase
      .from('players')
      .select('yahoo_player_id')
      .not('yahoo_player_id', 'is', null)
      .like('yahoo_player_id', `${gameKey}.%`)
      .range(from, from + pageSize - 1);

    if (playersError) {
      logger.error('Failed to fetch players from database', {
        error: playersError,
        gameKey,
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
