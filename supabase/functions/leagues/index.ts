// Setup type definitions for built-in Supabase Runtime APIs
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { logger, performance } from '../oauth/utils/logger.ts';
import { makeYahooApiCall } from '../oauth/utils/yahooApi.ts';
import { corsHeaders } from '../oauth/utils/constants.ts';
import {
  authenticateRequest,
  createErrorResponse,
} from '../oauth/utils/auth.ts';

Deno.serve(async (req) => {
  const timer = performance.start('leagues_request');

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

    // Authenticate the request
    const { user, error: authError } = await authenticateRequest(req);
    if (!user || authError) {
      logger.warn('Authentication failed', { error: authError });
      timer.end();
      return createErrorResponse(authError || 'Authentication required', 401);
    }

    const yahooAccessToken = user.user_metadata.yahoo_access_token;

    // Make Yahoo API call to get leagues
    const response = await makeYahooApiCall(
      yahooAccessToken,
      'https://fantasysports.yahooapis.com/fantasy/v2/users;use_login=1/games;game_keys=nfl/leagues?format=json'
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Yahoo API call failed', {
        status: response.status,
        statusText: response.statusText,
        errorText,
        userId,
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

    // Check content type to handle both XML and JSON responses
    const contentType = response.headers.get('content-type') || '';
    let data;

    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      // If it's XML, try to parse it as JSON anyway (in case format=json didn't work)
      const responseText = await response.text();
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        logger.error('Failed to parse response as JSON', {
          contentType,
          responseText: responseText.substring(0, 500), // Log first 500 chars
          parseError: parseError.message,
        });
        timer.end();
        return new Response(
          JSON.stringify({
            error: 'Yahoo API returned non-JSON response',
            details: 'Expected JSON but received XML or other format',
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }
    logger.info('Successfully fetched leagues', { userId });

    timer.end();
    return new Response(
      JSON.stringify({
        success: true,
        data,
        message: 'Leagues fetched successfully',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    logger.error('Error in leagues function', error);
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

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/leagues' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
