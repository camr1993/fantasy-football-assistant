import { logger } from '../utils/logger.ts';
import { supabase } from '../utils/supabase.ts';
import {
  logSyncStart,
  logSyncComplete,
  logSyncError,
} from '../utils/syncHelpers.ts';
import { syncUserLeagues, syncLeagueTeams } from './leagueSync.ts';

/**
 * Sync user login data (leagues and teams)
 */
export async function syncUserLoginData(userId: string, yahooToken: string) {
  const syncLogId = await logSyncStart('user_login', null, userId);
  let recordsProcessed = 0;

  try {
    logger.info('Starting user login sync', { userId });

    // 1. Sync leagues for this user
    const leaguesProcessed = await syncUserLeagues(userId, yahooToken);
    recordsProcessed += leaguesProcessed;

    // 2. Sync teams for each league
    const { data: leagues } = await supabase
      .from('leagues')
      .select('id, yahoo_league_id');

    if (leagues) {
      for (const league of leagues) {
        const teamsProcessed = await syncLeagueTeams(
          league.id,
          league.yahoo_league_id,
          yahooToken
        );
        recordsProcessed += teamsProcessed;
      }
    }

    await logSyncComplete(syncLogId, recordsProcessed);
    logger.info('Completed user login sync', { userId, recordsProcessed });

    return {
      leaguesProcessed,
      teamsProcessed: recordsProcessed - leaguesProcessed,
      totalProcessed: recordsProcessed,
    };
  } catch (error) {
    await logSyncError(syncLogId, error.message);
    logger.error('Failed to sync user login data', {
      userId,
      error: error.message,
    });
    throw error;
  }
}
