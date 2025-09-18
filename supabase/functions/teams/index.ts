// Setup type definitions for built-in Supabase Runtime APIs
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { logger, performance } from '../utils/logger.ts';
import { corsHeaders } from '../utils/constants.ts';
import { makeYahooApiCall } from '../utils/yahooApi.ts';
import { authenticateRequest, createErrorResponse } from '../utils/auth.ts';

Deno.serve(async (req) => {
  const timer = performance.start('teams_request');

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

    // Make Yahoo API call to get teams
    const response = await makeYahooApiCall(
      yahooAccessToken,
      'https://fantasysports.yahooapis.com/fantasy/v2/users;use_login=1/games;game_keys=nfl/teams?format=json'
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Yahoo API call failed', {
        status: response.status,
        statusText: response.statusText,
        errorText,
        userId: user.id,
      });
      timer.end();
      return new Response(
        JSON.stringify({
          error: `Yahoo API error: ${response.status} ${response.statusText}`,
        }),
        {
          status: response.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const data = await response.json();
    logger.info('Successfully fetched teams', { userId: user.id });

    timer.end();
    return new Response(
      JSON.stringify({
        success: true,
        data,
        message: 'Teams fetched successfully',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    logger.error('Error in teams function', error);
    timer.end();
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/teams' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
