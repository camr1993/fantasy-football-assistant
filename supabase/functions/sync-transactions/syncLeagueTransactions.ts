import { logger } from '../utils/logger.ts';
import { supabase } from '../utils/supabase.ts';
import {
  logSyncStart,
  logSyncComplete,
  logSyncError,
} from '../utils/syncHelpers.ts';
import {
  shouldSyncTransactions,
  fetchRecentTransactions,
} from './transactionSync.ts';
import {
  processTransactions,
  updateWaiverWireFromTransactions,
} from './rosterProcessor.ts';

/**
 * Sync transactions for a league
 */
export async function syncLeagueTransactions(
  leagueId: string,
  leagueKey: string,
  yahooToken: string
) {
  const syncLogId = await logSyncStart('transactions', leagueId);
  let recordsProcessed = 0;

  try {
    logger.info('Starting transaction sync for league', {
      leagueId,
      leagueKey,
    });

    // Get last sync time for this league
    const { data: league } = await supabase
      .from('leagues')
      .select('last_transaction_sync')
      .eq('id', leagueId)
      .single();

    const lastSyncTime = league?.last_transaction_sync;
    const currentTime = new Date().toISOString();

    // Fetch recent transactions
    const transactions = await fetchRecentTransactions(
      leagueKey,
      yahooToken,
      lastSyncTime
    );

    if (transactions.length === 0) {
      logger.info('No new transactions found', { leagueId, leagueKey });
      await logSyncComplete(syncLogId, 0);
      return { transactionsProcessed: 0, rosterUpdates: 0 };
    }

    // Process transactions and update rosters
    const rosterUpdates = await processTransactions(leagueId, transactions);
    recordsProcessed = transactions.length;

    // Update waiver wire with transaction data
    await updateWaiverWireFromTransactions(leagueId, transactions);

    // Update league last sync timestamp
    await supabase
      .from('leagues')
      .update({ last_transaction_sync: currentTime })
      .eq('id', leagueId);

    await logSyncComplete(syncLogId, recordsProcessed);
    logger.info('Completed transaction sync for league', {
      leagueId,
      leagueKey,
      transactionsProcessed: transactions.length,
      rosterUpdates,
    });

    return {
      transactionsProcessed: transactions.length,
      rosterUpdates,
    };
  } catch (error) {
    await logSyncError(syncLogId, error.message);
    logger.error('Failed to sync league transactions', {
      leagueId,
      leagueKey,
      error: error.message,
    });
    throw error;
  }
}
