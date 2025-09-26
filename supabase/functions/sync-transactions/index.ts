// Setup type definitions for built-in Supabase Runtime APIs
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { logger, performance } from '../utils/logger.ts';
import { corsHeaders } from '../utils/constants.ts';
import { supabase } from '../utils/supabase.ts';
import { makeYahooApiCall } from '../utils/yahooApi.ts';
import { authenticateRequest, createErrorResponse } from '../utils/auth.ts';

interface YahooTransaction {
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
 * Transaction sync function
 * This function syncs recent transactions and updates rosters
 *
 * Authentication: Uses Yahoo access token for authentication
 */
Deno.serve(async (req) => {
  const timer = performance.start('transaction_sync_request');

  try {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
      logger.info('Handling CORS preflight request for transaction sync');
      timer.end();
      return new Response(null, {
        status: 200,
        headers: corsHeaders,
      });
    }

    // Only allow POST requests for sync operations
    if (req.method !== 'POST') {
      logger.warn('Invalid method for transaction sync', {
        method: req.method,
      });
      timer.end();
      return new Response(
        JSON.stringify({
          error: 'Method not allowed',
          message: 'Only POST requests are allowed for sync operations',
        }),
        {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get Yahoo token from custom header
    const yahooAccessToken = req.headers.get('x-yahoo-token');

    if (!yahooAccessToken) {
      logger.warn('No Yahoo access token provided');
      timer.end();
      return createErrorResponse('Yahoo access token required', 401);
    }

    // Authenticate the request using the Yahoo token
    const { user, error: authError } = await authenticateRequest(
      req,
      yahooAccessToken
    );
    if (!user || authError) {
      logger.warn('Authentication failed', { error: authError });
      timer.end();
      return createErrorResponse(authError || 'Authentication required', 401);
    }

    // Get league_key from request body
    const body = await req.json();
    const leagueKey = body.league_key;

    if (!leagueKey) {
      logger.warn('No league_key provided in request body');
      timer.end();
      return createErrorResponse('league_key is required in request body', 400);
    }

    logger.info('Transaction sync function triggered', {
      userId: user.id,
      leagueKey,
      timestamp: new Date().toISOString(),
    });

    const syncId = crypto.randomUUID();
    logger.info('Starting transaction sync process', {
      syncId,
      userId: user.id,
      leagueKey,
      timestamp: new Date().toISOString(),
    });

    // Get league ID
    const { data: leagueData, error: leagueError } = await supabase
      .from('leagues')
      .select('id')
      .eq('yahoo_league_id', leagueKey)
      .single();

    if (leagueError || !leagueData) {
      logger.warn('League not found', { leagueKey });
      timer.end();
      return createErrorResponse('League not found', 404);
    }

    // Check if we should sync (rate limiting)
    const shouldSync = await shouldSyncTransactions(leagueData.id);
    if (!shouldSync) {
      logger.info('Transaction sync skipped due to rate limiting', {
        leagueKey,
      });
      timer.end();
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Transaction sync skipped due to rate limiting',
          timestamp: new Date().toISOString(),
          syncId,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Sync transactions for this league
    const result = await syncLeagueTransactions(
      leagueData.id,
      leagueKey,
      yahooToken
    );

    logger.info('Transaction sync process completed', {
      syncId,
      userId: user.id,
      leagueKey,
      timestamp: new Date().toISOString(),
      result,
    });

    timer.end();

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Transaction sync process completed successfully',
        timestamp: new Date().toISOString(),
        syncId,
        result,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    logger.error('Error in transaction sync function', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
    timer.end();

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: 'An error occurred during the transaction sync process',
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

/**
 * Check if we should sync transactions (rate limiting)
 */
async function shouldSyncTransactions(leagueId: string): Promise<boolean> {
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
 * Sync transactions for a league
 */
async function syncLeagueTransactions(
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

/**
 * Fetch recent transactions from Yahoo API
 */
async function fetchRecentTransactions(
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
 * Process transactions and update rosters
 */
async function processTransactions(
  leagueId: string,
  transactions: YahooTransaction[]
): Promise<number> {
  logger.info('Processing transactions', {
    leagueId,
    count: transactions.length,
  });

  let rosterUpdates = 0;
  const currentYear = new Date().getFullYear();
  const currentWeek = getCurrentNFLWeek();

  for (const transaction of transactions) {
    const transactionData = transaction.transaction[0];
    const type = transactionData.type;
    const players = transactionData.players;

    if (!players || players.length === 0) continue;

    // Process each player in the transaction
    for (const playerData of players) {
      const player = playerData.player[0];
      const playerKey = player.player_key;
      const transactionData = player.transaction_data[0];
      const transactionType = transactionData.type;

      // Get player ID from our database
      const { data: playerRecord } = await supabase
        .from('players')
        .select('id')
        .eq('yahoo_player_id', playerKey)
        .single();

      if (!playerRecord) continue;

      // Get team IDs
      const sourceTeamId = transactionData.source_team_key
        ? await getTeamIdByYahooKey(transactionData.source_team_key)
        : null;
      const destinationTeamId = transactionData.destination_team_key
        ? await getTeamIdByYahooKey(transactionData.destination_team_key)
        : null;

      if (transactionType === 'add' && destinationTeamId) {
        // Add player to roster
        await addPlayerToRoster(
          destinationTeamId,
          playerRecord.id,
          currentYear,
          currentWeek
        );
        rosterUpdates++;
      } else if (transactionType === 'drop' && sourceTeamId) {
        // Remove player from roster
        await removePlayerFromRoster(
          sourceTeamId,
          playerRecord.id,
          currentYear,
          currentWeek
        );
        rosterUpdates++;
      } else if (
        transactionType === 'add/drop' &&
        sourceTeamId &&
        destinationTeamId
      ) {
        // Move player between teams
        await removePlayerFromRoster(
          sourceTeamId,
          playerRecord.id,
          currentYear,
          currentWeek
        );
        await addPlayerToRoster(
          destinationTeamId,
          playerRecord.id,
          currentYear,
          currentWeek
        );
        rosterUpdates++;
      }
    }
  }

  logger.info('Completed processing transactions', { leagueId, rosterUpdates });
  return rosterUpdates;
}

/**
 * Get team ID by Yahoo team key
 */
async function getTeamIdByYahooKey(
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
async function addPlayerToRoster(
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
async function removePlayerFromRoster(
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

/**
 * Update waiver wire from transactions
 */
async function updateWaiverWireFromTransactions(
  leagueId: string,
  transactions: YahooTransaction[]
) {
  logger.info('Updating waiver wire from transactions', { leagueId });

  for (const transaction of transactions) {
    const transactionData = transaction.transaction[0];
    const players = transactionData.players;

    if (!players || players.length === 0) continue;

    for (const playerData of players) {
      const player = playerData.player[0];
      const playerKey = player.player_key;
      const transactionData = player.transaction_data[0];

      // Get player ID from our database
      const { data: playerRecord } = await supabase
        .from('players')
        .select('id')
        .eq('yahoo_player_id', playerKey)
        .single();

      if (!playerRecord) continue;

      // Get team IDs
      const sourceTeamId = transactionData.source_team_key
        ? await getTeamIdByYahooKey(transactionData.source_team_key)
        : null;
      const destinationTeamId = transactionData.destination_team_key
        ? await getTeamIdByYahooKey(transactionData.destination_team_key)
        : null;

      const currentWeek = getCurrentNFLWeek();
      const transactionDate = new Date(transactionData.timestamp);

      // Update waiver wire entry
      await supabase.from('waiver_wire').upsert(
        {
          league_id: leagueId,
          player_id: playerRecord.id,
          week: currentWeek,
          available: true,
          added_to_team_id: destinationTeamId,
          dropped_from_team_id: sourceTeamId,
          transaction_id: transactionData.transaction_key,
          transaction_date: transactionDate.toISOString(),
          last_updated: new Date().toISOString(),
        },
        {
          onConflict: 'league_id,player_id,week',
        }
      );
    }
  }
}

/**
 * Make Yahoo API call with retry logic
 */
async function makeYahooApiCallWithRetry(
  accessToken: string,
  url: string,
  maxRetries: number = 3
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await makeYahooApiCall(accessToken, url);

      if (response.ok) {
        return response;
      }

      // If it's a rate limit error, wait longer
      if (response.status === 429) {
        const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff
        logger.warn('Rate limited, waiting before retry', {
          attempt,
          waitTime,
        });
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }

      // If it's a client error (4xx), don't retry
      if (response.status >= 400 && response.status < 500) {
        return response;
      }

      // For server errors (5xx), retry
      lastError = new Error(
        `API call failed: ${response.status} ${response.statusText}`
      );
    } catch (error) {
      lastError = error;
    }

    if (attempt < maxRetries) {
      const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff
      logger.warn('API call failed, retrying', {
        attempt,
        waitTime,
        error: lastError?.message,
      });
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

/**
 * Get current NFL week
 */
function getCurrentNFLWeek(): number {
  const now = new Date();
  const seasonStart = new Date(now.getFullYear(), 8, 1); // September 1st
  const weeksSinceStart = Math.floor(
    (now.getTime() - seasonStart.getTime()) / (7 * 24 * 60 * 60 * 1000)
  );
  return Math.max(1, Math.min(18, weeksSinceStart + 1));
}

/**
 * Log sync start
 */
async function logSyncStart(
  syncType: string,
  leagueId: string | null,
  userId?: string
): Promise<string> {
  const { data, error } = await supabase.rpc('log_sync_operation', {
    p_sync_type: syncType,
    p_league_id: leagueId,
    p_user_id: userId || null,
    p_status: 'started',
  });

  if (error) {
    logger.error('Failed to log sync start', { error });
    return '';
  }

  return data;
}

/**
 * Log sync completion
 */
async function logSyncComplete(syncLogId: string, recordsProcessed: number) {
  await supabase
    .from('sync_logs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      records_processed: recordsProcessed,
    })
    .eq('id', syncLogId);
}

/**
 * Log sync error
 */
async function logSyncError(syncLogId: string, errorMessage: string) {
  await supabase
    .from('sync_logs')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: errorMessage,
    })
    .eq('id', syncLogId);
}
