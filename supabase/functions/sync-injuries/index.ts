// Setup type definitions for built-in Supabase Runtime APIs
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { logger, performance } from '../utils/logger.ts';
import { corsHeaders } from '../utils/constants.ts';
import { supabase } from '../utils/supabase.ts';
import { makeYahooApiCall } from '../utils/yahooApi.ts';

interface YahooPlayerInjury {
  player_key: string;
  injury_status?: string;
  injury_note?: string;
}

/**
 * Player injury sync function
 * This function syncs master player injury data for all players
 * These are master tables used across all leagues, not league-specific data
 *
 * Authentication: Uses a cron job secret key for authentication
 * API Access: Uses provided Yahoo API credentials for reliable access
 */
Deno.serve(async (req) => {
  const timer = performance.start('injury_sync_request');

  try {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
      logger.info('Handling CORS preflight request for injury sync');
      timer.end();
      return new Response(null, {
        status: 200,
        headers: corsHeaders,
      });
    }

    // Only allow POST requests for sync operations
    if (req.method !== 'POST') {
      logger.warn('Invalid method for injury sync', { method: req.method });
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

    // Authenticate using cron job secret
    const cronSecret = req.headers.get('x-supabase-webhook-source');
    const expectedSecret = Deno.env.get('CRON_JOB_SECRET');

    if (!expectedSecret) {
      logger.error('CRON_JOB_SECRET environment variable not set');
      timer.end();
      return new Response(
        JSON.stringify({
          error: 'Server configuration error',
          message: 'Cron job secret not configured',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!cronSecret || cronSecret !== expectedSecret) {
      logger.warn('Invalid or missing cron job secret', {
        hasSecret: !!cronSecret,
        secretLength: cronSecret?.length || 0,
      });
      timer.end();
      return new Response(
        JSON.stringify({
          error: 'Unauthorized',
          message: 'Invalid cron job secret',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    logger.info('Injury sync function triggered by cron job', {
      timestamp: new Date().toISOString(),
    });

    const syncId = crypto.randomUUID();
    logger.info('Starting injury sync process', {
      syncId,
      timestamp: new Date().toISOString(),
    });

    // Get Yahoo API credentials from environment variables
    const yahooClientId = Deno.env.get('YAHOO_CLIENT_ID');
    const yahooClientSecret = Deno.env.get('YAHOO_CLIENT_SECRET');

    if (!yahooClientId || !yahooClientSecret) {
      logger.error('Yahoo API credentials not configured');
      timer.end();
      return new Response(
        JSON.stringify({
          error: 'Server configuration error',
          message: 'Yahoo API credentials not configured',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get a valid Yahoo access token using client credentials
    const yahooToken = await getYahooAccessToken(
      yahooClientId,
      yahooClientSecret
    );
    if (!yahooToken) {
      logger.error('Failed to obtain Yahoo access token');
      timer.end();
      return new Response(
        JSON.stringify({
          error: 'API authentication error',
          message: 'Failed to obtain Yahoo access token',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    logger.info('Starting master player injury data sync');

    // Sync master player injury data (not league-specific)
    const result = await syncMasterPlayerInjuries(yahooToken);

    logger.info('Injury sync process completed', {
      syncId,
      result,
      timestamp: new Date().toISOString(),
    });

    timer.end();

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Injury sync process completed successfully',
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
    logger.error('Error in injury sync function', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
    timer.end();

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: 'An error occurred during the injury sync process',
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
 * Get Yahoo access token using client credentials
 */
async function getYahooAccessToken(
  clientId: string,
  clientSecret: string
): Promise<string | null> {
  try {
    const response = await fetch(
      'https://api.login.yahoo.com/oauth2/request_auth',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
        }),
      }
    );

    if (!response.ok) {
      logger.error('Failed to get Yahoo access token', {
        status: response.status,
        statusText: response.statusText,
      });
      return null;
    }

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    logger.error('Error getting Yahoo access token', { error: error.message });
    return null;
  }
}

/**
 * Sync master player injury data (not league-specific)
 */
async function syncMasterPlayerInjuries(yahooToken: string) {
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

/**
 * Sync all player injuries (master data)
 */
async function syncAllPlayerInjuries(yahooToken: string): Promise<number> {
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
  leagueId: string
): Promise<string> {
  const { data, error } = await supabase.rpc('log_sync_operation', {
    p_sync_type: syncType,
    p_league_id: leagueId,
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
