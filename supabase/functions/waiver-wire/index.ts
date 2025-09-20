// Setup type definitions for built-in Supabase Runtime APIs
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { logger, performance } from '../utils/logger.ts';
import { makeYahooApiCall } from '../utils/yahooApi.ts';
import { corsHeaders } from '../utils/constants.ts';
import { authenticateRequest, createErrorResponse } from '../utils/auth.ts';

Deno.serve(async (req) => {
  const timer = performance.start('waiver_wire_request');

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

    // Get parameters from request body
    const body = await req.json();
    const leagueKey = body.league_key;
    const position = body.position; // Optional position filter
    const status = body.status || 'A'; // A = Available, W = Waivers, etc.
    const count = body.count || '25'; // Number of players to return

    if (!leagueKey) {
      logger.warn('No league_key provided in request body');
      timer.end();
      return createErrorResponse('league_key is required in request body', 400);
    }

    // Build the API URL for available players
    let playersUrl = `https://fantasysports.yahooapis.com/fantasy/v2/league/${leagueKey}/players;status=${status};out=stats,ownership,percent_owned;count=${count}`;

    if (position) {
      playersUrl += `;position=${position}`;
    }

    playersUrl += '?format=json';

    // Also fetch waiver claims if status is 'W'
    let waiverClaimsUrl = '';
    if (status === 'W') {
      waiverClaimsUrl = `https://fantasysports.yahooapis.com/fantasy/v2/league/${leagueKey}/transactions;type=waiver?format=json`;
    }

    // Make API calls
    const apiCalls = [makeYahooApiCall(yahooAccessToken, playersUrl)];
    if (waiverClaimsUrl) {
      apiCalls.push(makeYahooApiCall(yahooAccessToken, waiverClaimsUrl));
    }

    const responses = await Promise.all(apiCalls);

    // Check if any API call failed
    const failedResponses = responses.filter((response) => !response.ok);
    if (failedResponses.length > 0) {
      const errors = failedResponses.map(
        (response, index) =>
          `API call ${index + 1}: ${response.status} ${response.statusText}`
      );

      logger.error('Yahoo API calls failed', {
        errors,
        userId: user.id,
        leagueKey,
      });
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
    const [playersData, waiverClaimsData] = await Promise.all([
      responses[0].json(),
      responses[1] ? responses[1].json() : null,
    ]);

    logger.info('Successfully fetched waiver wire data', {
      userId: user.id,
      leagueKey,
      status,
      playersCount:
        playersData?.fantasy_content?.league?.[1]?.players?.length || 0,
    });

    timer.end();
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          players: playersData,
          waiverClaims: waiverClaimsData,
        },
        message: 'Waiver wire data fetched successfully',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    logger.error('Error in waiver-wire function', error);
    timer.end();
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
