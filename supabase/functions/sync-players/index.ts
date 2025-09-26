// Setup type definitions for built-in Supabase Runtime APIs
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { logger, performance } from '../utils/logger.ts';
import { corsHeaders } from '../utils/constants.ts';
import { supabase } from '../utils/supabase.ts';
import { makeYahooApiCall } from '../utils/yahooApi.ts';

interface YahooPlayer {
  player_key: string;
  name: {
    full: string;
  };
  display_position: string;
  status: string;
  team_abbr?: string;
}

interface YahooPlayerStats {
  player_key: string;
  stats?: any[];
}

/**
 * Player data sync function
 * This function syncs master player data and their stats for all leagues
 * These are master tables used across all leagues, not league-specific data
 *
 * Authentication: Uses a cron job secret key for authentication
 * API Access: Uses provided Yahoo API credentials for reliable access
 */
Deno.serve(async (req) => {
  const timer = performance.start('player_sync_request');

  try {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
      logger.info('Handling CORS preflight request for player sync');
      timer.end();
      return new Response(null, {
        status: 200,
        headers: corsHeaders,
      });
    }

    // Only allow POST requests for sync operations
    if (req.method !== 'POST') {
      logger.warn('Invalid method for player sync', { method: req.method });
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

    logger.info('Player sync function triggered by cron job', {
      timestamp: new Date().toISOString(),
    });

    const syncId = crypto.randomUUID();
    logger.info('Starting player sync process', {
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

    logger.info('Starting master player data sync');

    // Sync master player data (not league-specific)
    const result = await syncMasterPlayerData(yahooToken);

    logger.info('Player sync process completed', {
      syncId,
      result,
      timestamp: new Date().toISOString(),
    });

    timer.end();

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Player sync process completed successfully',
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
    logger.error('Error in player sync function', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
    timer.end();

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: 'An error occurred during the player sync process',
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
 * Sync master player data (not league-specific)
 */
async function syncMasterPlayerData(yahooToken: string) {
  const syncLogId = await logSyncStart('player_sync', null);
  let recordsProcessed = 0;

  try {
    logger.info('Starting master player data sync');

    // Sync all NFL players (master data)
    const playersProcessed = await syncAllPlayers(yahooToken);
    recordsProcessed += playersProcessed;

    // Sync player stats for current week (master data)
    const statsProcessed = await syncAllPlayerStats(yahooToken);
    recordsProcessed += statsProcessed;

    await logSyncComplete(syncLogId, recordsProcessed);
    logger.info('Completed master player data sync', {
      playersProcessed,
      statsProcessed,
      totalProcessed: recordsProcessed,
    });

    return {
      playersProcessed,
      statsProcessed,
      totalProcessed: recordsProcessed,
    };
  } catch (error) {
    await logSyncError(syncLogId, error.message);
    logger.error('Failed to sync master player data', {
      error: error.message,
    });
    throw error;
  }
}

/**
 * Sync all NFL players (master data)
 */
async function syncAllPlayers(yahooToken: string): Promise<number> {
  logger.info('Syncing all NFL players');

  // Get all NFL players from Yahoo's master player list
  const response = await makeYahooApiCallWithRetry(
    yahooToken,
    'https://fantasysports.yahooapis.com/fantasy/v2/players;game_keys=nfl?format=json'
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch all players: ${response.status}`);
  }

  const data = await response.json();
  const players = data?.fantasy_content?.players;

  if (!players) {
    logger.warn('No players found in response');
    return 0;
  }

  let processed = 0;
  const currentTime = new Date().toISOString();

  // Process players in batches of 100
  const batchSize = 100;
  for (let i = 0; i < players.length; i += batchSize) {
    const batch = players.slice(i, i + batchSize);

    const playerInserts = batch
      .map((player) => {
        const playerData = player.player[0];
        const playerKey = playerData.player_key;
        const name = playerData.name?.full;
        const position = playerData.display_position;
        const status = playerData.status;
        const team = playerData.team_abbr;

        if (!name || !position) return null;

        return {
          yahoo_player_id: playerKey,
          name,
          position,
          status,
          team,
          last_updated: currentTime,
        };
      })
      .filter(Boolean);

    if (playerInserts.length > 0) {
      const { error } = await supabase.from('players').upsert(playerInserts, {
        onConflict: 'yahoo_player_id',
      });

      if (error) {
        logger.error('Failed to upsert players batch', { error });
      } else {
        processed += playerInserts.length;
      }
    }
  }

  logger.info('Completed syncing all players', { count: processed });
  return processed;
}

/**
 * Sync all player stats (master data)
 */
async function syncAllPlayerStats(yahooToken: string): Promise<number> {
  logger.info('Syncing all player stats');

  const currentWeek = getCurrentNFLWeek();
  const currentYear = new Date().getFullYear();

  // Get all NFL players with stats from Yahoo's master player list
  const response = await makeYahooApiCallWithRetry(
    yahooToken,
    `https://fantasysports.yahooapis.com/fantasy/v2/players;game_keys=nfl;out=stats;stats_type=season;week=${currentWeek}?format=json`
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch all player stats: ${response.status}`);
  }

  const data = await response.json();
  const players = data?.fantasy_content?.players;

  if (!players) {
    logger.warn('No player stats found in response');
    return 0;
  }

  let processed = 0;

  // Process stats in batches of 50
  const batchSize = 50;
  for (let i = 0; i < players.length; i += batchSize) {
    const batch = players.slice(i, i + batchSize);

    const statsInserts = [];

    for (const player of batch) {
      const playerData = player.player[0];
      const playerKey = playerData.player_key;
      const stats = playerData.stats;

      if (!stats || stats.length === 0) continue;

      // Get player ID from our database
      const { data: playerRecord } = await supabase
        .from('players')
        .select('id')
        .eq('yahoo_player_id', playerKey)
        .single();

      if (!playerRecord) continue;

      const points = calculatePointsFromStats(stats);

      statsInserts.push({
        player_id: playerRecord.id,
        season_year: currentYear,
        week: currentWeek,
        source: 'actual',
        points,
        stats,
      });
    }

    if (statsInserts.length > 0) {
      const { error } = await supabase
        .from('player_stats')
        .upsert(statsInserts, {
          onConflict: 'player_id,season_year,week,source',
        });

      if (error) {
        logger.error('Failed to upsert player stats batch', { error });
      } else {
        processed += statsInserts.length;
      }
    }
  }

  logger.info('Completed syncing all player stats', { count: processed });
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
 * Calculate points from Yahoo stats
 */
function calculatePointsFromStats(stats: any[]): number {
  let points = 0;

  for (const stat of stats) {
    const statId = stat.stat_id;
    const value = parseFloat(stat.value) || 0;

    switch (statId) {
      case '4': // Passing Yards
        points += value * 0.04;
        break;
      case '5': // Passing Touchdowns
        points += value * 4;
        break;
      case '6': // Interceptions
        points -= value * 2;
        break;
      case '7': // Rushing Yards
        points += value * 0.1;
        break;
      case '8': // Rushing Touchdowns
        points += value * 6;
        break;
      case '9': // Receptions
        points += value * 1; // PPR
        break;
      case '10': // Receiving Yards
        points += value * 0.1;
        break;
      case '11': // Receiving Touchdowns
        points += value * 6;
        break;
      case '12': // Fumbles Lost
        points -= value * 2;
        break;
    }
  }

  return Math.round(points * 100) / 100;
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
