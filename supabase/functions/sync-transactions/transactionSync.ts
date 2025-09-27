import { logger } from '../utils/logger.ts';
import { supabase } from '../utils/supabase.ts';
import {
  makeYahooApiCallWithRetry,
  getCurrentNFLWeek,
} from '../utils/syncHelpers.ts';

export interface YahooTransaction {
  transaction_key: string;
  type: string;
  status: string;
  timestamp: string;
  players?: Array<{
    player: Array<{
      player_key: string;
      transaction_data: Array<{
        type: string;
        source_team_key?: string;
        destination_team_key?: string;
      }>;
    }>;
  }>;
}

/**
 * Check if we should sync transactions (rate limiting)
 */
export async function shouldSyncTransactions(
  leagueId: string
): Promise<boolean> {
  const { data: league } = await supabase
    .from('leagues')
    .select('last_transaction_sync')
    .eq('id', leagueId)
    .single();

  if (!league?.last_transaction_sync) {
    return true; // Never synced before
  }

  const lastSync = new Date(league.last_transaction_sync);
  const now = new Date();
  const timeDiff = now.getTime() - lastSync.getTime();
  const oneHour = 60 * 60 * 1000; // 1 hour in milliseconds

  return timeDiff >= oneHour;
}

/**
 * Fetch recent transactions from Yahoo API
 */
export async function fetchRecentTransactions(
  leagueKey: string,
  yahooToken: string,
  lastSyncTime?: string
): Promise<YahooTransaction[]> {
  logger.info('Fetching recent transactions', { leagueKey, lastSyncTime });

  const response = await makeYahooApiCallWithRetry(
    yahooToken,
    `https://fantasysports.yahooapis.com/fantasy/v2/league/${leagueKey}/transactions?format=json`
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch transactions: ${response.status}`);
  }

  const data = await response.json();
  const transactions = data?.fantasy_content?.league?.[1]?.transactions;

  if (!transactions) {
    logger.warn('No transactions found in response', { leagueKey });
    return [];
  }

  // Filter transactions by date if we have a last sync time
  if (lastSyncTime) {
    const lastSync = new Date(lastSyncTime);
    return transactions.filter((transaction: any) => {
      const transactionTime = new Date(transaction.transaction[0].timestamp);
      return transactionTime > lastSync;
    });
  }

  return transactions;
}

/**
 * Get team ID by Yahoo team key
 */
export async function getTeamIdByYahooKey(
  yahooTeamKey: string
): Promise<string | null> {
  const { data: team } = await supabase
    .from('teams')
    .select('id')
    .eq('yahoo_team_id', yahooTeamKey)
    .single();

  return team?.id || null;
}

/**
 * Add player to roster
 */
export async function addPlayerToRoster(
  teamId: string,
  playerId: string,
  seasonYear: number,
  week: number
) {
  const { error } = await supabase.from('roster_entry').upsert(
    {
      team_id: teamId,
      player_id: playerId,
      season_year: seasonYear,
      week,
      slot: 'BENCH', // Default to bench, can be updated later
    },
    {
      onConflict: 'team_id,season_year,week,slot',
    }
  );

  if (error) {
    logger.error('Failed to add player to roster', { error, teamId, playerId });
  }
}

/**
 * Remove player from roster
 */
export async function removePlayerFromRoster(
  teamId: string,
  playerId: string,
  seasonYear: number,
  week: number
) {
  const { error } = await supabase
    .from('roster_entry')
    .delete()
    .eq('team_id', teamId)
    .eq('player_id', playerId)
    .eq('season_year', seasonYear)
    .eq('week', week);

  if (error) {
    logger.error('Failed to remove player from roster', {
      error,
      teamId,
      playerId,
    });
  }
}
