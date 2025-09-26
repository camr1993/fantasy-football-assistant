import { logger } from '../utils/logger.ts';
import {
  logSyncStart,
  logSyncComplete,
  logSyncError,
} from '../utils/syncHelpers.ts';
import { syncAllPlayerInjuries } from './injurySync.ts';

/**
 * Sync master player injury data (not league-specific)
 */
export async function syncMasterPlayerInjuries(yahooToken: string) {
  const syncLogId = await logSyncStart('injury_sync', null);
  let recordsProcessed = 0;

  try {
    logger.info('Starting master player injury data sync');

    // Sync all NFL player injuries (master data)
    const injuriesProcessed = await syncAllPlayerInjuries(yahooToken);
    recordsProcessed += injuriesProcessed;

    await logSyncComplete(syncLogId, recordsProcessed);
    logger.info('Completed master player injury data sync', {
      injuriesProcessed,
      totalProcessed: recordsProcessed,
    });

    return {
      injuriesProcessed,
      totalProcessed: recordsProcessed,
    };
  } catch (error) {
    await logSyncError(syncLogId, error.message);
    logger.error('Failed to sync master player injury data', {
      error: error.message,
    });
    throw error;
  }
}
