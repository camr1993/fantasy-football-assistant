// Setup type definitions for built-in Supabase Runtime APIs
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { logger, performance } from '../utils/logger.ts';
import { makeYahooApiCall } from '../utils/yahooApi.ts';
import { corsHeaders } from '../utils/constants.ts';
import { authenticateRequest, createErrorResponse } from '../utils/auth.ts';

Deno.serve(async (req) => {
  const timer = performance.start('roster_request');

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

    // Get team_key from request body
    const body = await req.json();
    const teamKey = body.team_key;

    if (!teamKey) {
      logger.warn('No team_key provided in request body');
      timer.end();
      return createErrorResponse('team_key is required in request body', 400);
    }

    // Fetch team roster with player details
    const rosterUrl = `https://fantasysports.yahooapis.com/fantasy/v2/team/${teamKey}/roster/players?format=json`;

    const response = await makeYahooApiCall(yahooAccessToken, rosterUrl);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Yahoo API call failed', {
        status: response.status,
        statusText: response.statusText,
        errorText,
        userId: user.id,
        teamKey,
      });
      timer.end();
      return new Response(
        JSON.stringify({
          error: `Yahoo API error: ${response.status} ${response.statusText}`,
          details: errorText,
        }),
        {
          status: response.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const data = await response.json();
    logger.info('Successfully fetched roster', {
      userId: user.id,
      teamKey,
      playersCount:
        data?.fantasy_content?.team?.[1]?.roster?.players?.length || 0,
    });

    timer.end();
    return new Response(
      JSON.stringify({
        success: true,
        data,
        message: 'Roster fetched successfully',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    logger.error('Error in roster function', error);
    timer.end();
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
