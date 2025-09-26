// Setup type definitions for built-in Supabase Runtime APIs
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { logger, performance } from '../utils/logger.ts';
import { corsHeaders } from '../utils/constants.ts';
import { supabase } from '../utils/supabase.ts';
import { makeYahooApiCall } from '../utils/yahooApi.ts';
import { authenticateRequest, createErrorResponse } from '../utils/auth.ts';

interface YahooLeague {
  league_key: string;
  name: string;
  season: string;
  scoring_type: string;
  roster_positions?: any;
}

interface YahooTeam {
  team_key: string;
  name: string;
  managers?: Array<{
    manager: {
      nickname: string;
      guid: string;
    };
  }>;
}

/**
 * User login sync function
 * This function creates/updates user, league, and team data when a user logs in
 *
 * Authentication: Uses Yahoo access token for authentication
 */
Deno.serve(async (req) => {
  const timer = performance.start('user_login_sync_request');

  try {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
      logger.info('Handling CORS preflight request for user login sync');
      timer.end();
      return new Response(null, {
        status: 200,
        headers: corsHeaders,
      });
    }

    // Only allow POST requests for sync operations
    if (req.method !== 'POST') {
      logger.warn('Invalid method for user login sync', { method: req.method });
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

    logger.info('User login sync function triggered', {
      userId: user.id,
      timestamp: new Date().toISOString(),
    });

    const syncId = crypto.randomUUID();
    logger.info('Starting user login sync process', {
      syncId,
      userId: user.id,
      timestamp: new Date().toISOString(),
    });

    // Sync user data (leagues and teams)
    const result = await syncUserLoginData(user.id, yahooAccessToken);

    logger.info('User login sync process completed', {
      syncId,
      userId: user.id,
      timestamp: new Date().toISOString(),
      result,
    });

    timer.end();

    return new Response(
      JSON.stringify({
        success: true,
        message: 'User login sync process completed successfully',
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
    logger.error('Error in user login sync function', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
    timer.end();

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: 'An error occurred during the user login sync process',
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
 * Sync user login data (leagues and teams)
 */
async function syncUserLoginData(userId: string, yahooToken: string) {
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

/**
 * Sync leagues for a user
 */
async function syncUserLeagues(
  userId: string,
  yahooToken: string
): Promise<number> {
  logger.info('Syncing user leagues', { userId });

  const response = await makeYahooApiCallWithRetry(
    yahooToken,
    'https://fantasysports.yahooapis.com/fantasy/v2/users;use_login=1/games;game_keys=nfl/leagues?format=json'
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch leagues: ${response.status}`);
  }

  const data = await response.json();
  const leagues =
    data?.fantasy_content?.users?.[0]?.user?.[1]?.games?.[0]?.game?.[1]
      ?.leagues;

  if (!leagues) {
    logger.warn('No leagues found in response', { userId });
    return 0;
  }

  let processed = 0;

  for (const league of leagues) {
    const leagueData = league.league[0];
    const leagueKey = leagueData.league_key;
    const name = leagueData.name;
    const season = leagueData.season;
    const scoringType = leagueData.scoring_type;

    // Upsert league (only create if doesn't exist)
    const { error } = await supabase.from('leagues').upsert(
      {
        yahoo_league_id: leagueKey,
        name,
        season_year: parseInt(season),
        scoring_type: scoringType,
        roster_positions: leagueData.roster_positions || null,
      },
      {
        onConflict: 'yahoo_league_id',
        ignoreDuplicates: true, // Only insert if doesn't exist
      }
    );

    if (error) {
      logger.error('Failed to upsert league', { error, leagueKey });
    } else {
      processed++;
    }
  }

  logger.info('Completed syncing user leagues', { userId, count: processed });
  return processed;
}

/**
 * Sync teams for a league
 */
async function syncLeagueTeams(
  leagueId: string,
  leagueKey: string,
  yahooToken: string
): Promise<number> {
  logger.info('Syncing league teams', { leagueId, leagueKey });

  const response = await makeYahooApiCallWithRetry(
    yahooToken,
    `https://fantasysports.yahooapis.com/fantasy/v2/league/${leagueKey}/teams?format=json`
  );

  if (!response.ok) {
    logger.warn('Failed to fetch teams', {
      leagueId,
      leagueKey,
      status: response.status,
    });
    return 0;
  }

  const data = await response.json();
  const teams = data?.fantasy_content?.league?.[1]?.teams;

  if (!teams) {
    logger.warn('No teams found in response', { leagueId, leagueKey });
    return 0;
  }

  let processed = 0;

  for (const team of teams) {
    const teamData = team.team[0];
    const teamKey = teamData.team_key;
    const name = teamData.name;
    const manager = teamData.managers?.[0]?.manager?.nickname;

    // Get user ID by Yahoo nickname if available
    let userId = null;
    if (manager) {
      const { data: userData } = await supabase
        .from('userProfiles')
        .select('id')
        .eq('user_metadata->yahoo_nickname', manager)
        .single();
      userId = userData?.id;
    }

    // Upsert team (only create if doesn't exist)
    const { error } = await supabase.from('teams').upsert(
      {
        league_id: leagueId,
        yahoo_team_id: teamKey,
        user_id: userId,
        name,
      },
      {
        onConflict: 'yahoo_team_id',
        ignoreDuplicates: true, // Only insert if doesn't exist
      }
    );

    if (error) {
      logger.error('Failed to upsert team', { error, teamKey });
    } else {
      processed++;
    }
  }

  logger.info('Completed syncing league teams', {
    leagueId,
    leagueKey,
    count: processed,
  });
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
 * Log sync start
 */
async function logSyncStart(
  syncType: string,
  leagueId: string | null,
  userId: string | null
): Promise<string> {
  const { data, error } = await supabase.rpc('log_sync_operation', {
    p_sync_type: syncType,
    p_league_id: leagueId,
    p_user_id: userId,
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
