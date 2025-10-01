import { logger } from '../utils/logger.ts';
import {
  logSyncStart,
  logSyncComplete,
  logSyncError,
} from '../utils/syncHelpers.ts';
import { syncAllPlayerStats } from './playerSync.ts';

/**
 * Sync master player data (not league-specific)
 */
export async function syncMasterPlayerData(yahooToken: string) {
  const syncLogId = await logSyncStart('player_sync', null);
  let recordsProcessed = 0;

  try {
    logger.info('Starting master player data sync');

    // Sync all NFL players (master data)
    // const playersProcessed = await syncAllPlayers(yahooToken);
    // recordsProcessed += playersProcessed;

    // Sync player stats for current week (master data)
    const statsProcessed = await syncAllPlayerStats(yahooToken);
    recordsProcessed += statsProcessed;

    await logSyncComplete(syncLogId, recordsProcessed);
    logger.info('Completed master player data sync', {
      // playersProcessed,
      statsProcessed,
      totalProcessed: recordsProcessed,
    });

    return {
      // playersProcessed,
      statsProcessed,
      totalProcessed: recordsProcessed,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await logSyncError(syncLogId, errorMessage);
    logger.error('Failed to sync master player data', {
      error: errorMessage,
    });
    throw error;
  }
}
