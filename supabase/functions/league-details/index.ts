// Setup type definitions for built-in Supabase Runtime APIs
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { logger, performance } from '../utils/logger.ts';
import { makeYahooApiCall } from '../utils/yahooApi.ts';
import { corsHeaders } from '../utils/constants.ts';
import { authenticateRequest, createErrorResponse } from '../utils/auth.ts';

Deno.serve(async (req) => {
  const timer = performance.start('league_details_request');

  try {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
      logger.info('Handling CORS preflight request');
      timer.end();
      return new Response(null, {
        status: 200,
        headers: corsHeaders,
      });
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

    // Fetch comprehensive league details including settings, teams, and standings
    const leagueDetailsUrl = `https://fantasysports.yahooapis.com/fantasy/v2/league/${leagueKey}?format=json`;
    const teamsUrl = `https://fantasysports.yahooapis.com/fantasy/v2/league/${leagueKey}/teams?format=json`;
    const standingsUrl = `https://fantasysports.yahooapis.com/fantasy/v2/league/${leagueKey}/standings?format=json`;

    // Make parallel API calls
    const [leagueResponse, teamsResponse, standingsResponse] =
      await Promise.all([
        makeYahooApiCall(yahooAccessToken, leagueDetailsUrl),
        makeYahooApiCall(yahooAccessToken, teamsUrl),
        makeYahooApiCall(yahooAccessToken, standingsUrl),
      ]);

    // Check if any API call failed
    if (!leagueResponse.ok || !teamsResponse.ok || !standingsResponse.ok) {
      const errors = [];
      if (!leagueResponse.ok)
        errors.push(`League details: ${leagueResponse.status}`);
      if (!teamsResponse.ok) errors.push(`Teams: ${teamsResponse.status}`);
      if (!standingsResponse.ok)
        errors.push(`Standings: ${standingsResponse.status}`);

      logger.error('Yahoo API calls failed', { errors, userId: user.id });
      timer.end();
      return new Response(
        JSON.stringify({
          error: `Yahoo API errors: ${errors.join(', ')}`,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Parse responses
    const [leagueData, teamsData, standingsData] = await Promise.all([
      leagueResponse.json(),
      teamsResponse.json(),
      standingsResponse.json(),
    ]);

    logger.info('Successfully fetched league details', {
      userId: user.id,
      leagueKey,
      teamsCount: teamsData?.fantasy_content?.league?.[1]?.teams?.length || 0,
    });

    timer.end();
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          league: leagueData,
          teams: teamsData,
          standings: standingsData,
        },
        message: 'League details fetched successfully',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    logger.error('Error in league-details function', error);
    timer.end();
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
