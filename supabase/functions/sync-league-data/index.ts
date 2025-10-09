import { logger, performance } from '../utils/logger.ts';
import { corsHeaders } from '../utils/constants.ts';
import { syncUserLeagues, syncTeamRosterOnly } from './leagueSync.ts';
import { getUserTokens } from '../utils/userTokenManager.ts';

Deno.serve(async (req) => {
  const timer = performance.start('sync_league_data_request');

  logger.info('League data sync request received', {
    method: req.method,
    url: req.url,
    headers: Object.fromEntries(req.headers.entries()),
  });

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    logger.info('Handling CORS preflight request');
    timer.end();
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (req.method !== 'POST') {
    logger.warn('Invalid method for league data sync', { method: req.method });
    timer.end();
    return new Response('Method not allowed', {
      status: 405,
      headers: { ...corsHeaders },
    });
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      logger.warn('Missing authorization header for league data sync');
      timer.end();
      return new Response(
        JSON.stringify({ code: 401, message: 'Missing authorization header' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get user data from request body
    const body = await req.json();
    const { userId, syncType = 'full' } = body;

    if (!userId) {
      logger.error('Missing userId in request body');
      timer.end();
      return new Response(
        JSON.stringify({
          code: 400,
          message: 'Missing userId',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get user's tokens (with automatic refresh if needed)
    const userTokens = await getUserTokens(userId);
    if (!userTokens) {
      logger.error('Failed to get user tokens', { userId });
      timer.end();
      return new Response(
        JSON.stringify({
          code: 401,
          message: 'Failed to get user tokens. Please re-authenticate.',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    logger.info('League data sync request for user', { userId, syncType });

    let syncResult;

    if (syncType === 'roster') {
      // Sync only rosters for all user's teams
      logger.info('Starting roster-only sync for all user teams', { userId });
      syncResult = await syncTeamRosterOnly(userId, userTokens.access_token);
    } else {
      // Sync all league data (leagues, teams, rosters)
      logger.info('Starting comprehensive league data sync', { userId });
      syncResult = await syncUserLeagues(userId, userTokens.access_token);
    }

    logger.info('League data sync completed successfully', {
      userId,
      leaguesSynced: syncResult.leagues.length,
      teamsSynced: syncResult.teams.length,
    });

    timer.end();
    return new Response(
      JSON.stringify({
        success: true,
        message: 'League data sync completed successfully',
        result: syncResult,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  } catch (error) {
    logger.error('League data sync error', { error });
    timer.end();
    return new Response(
      JSON.stringify({
        success: false,
        message: 'League data sync failed',
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
