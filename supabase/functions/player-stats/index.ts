// Setup type definitions for built-in Supabase Runtime APIs
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { logger, performance } from '../utils/logger.ts';
import { makeYahooApiCall } from '../utils/yahooApi.ts';
import { corsHeaders } from '../utils/constants.ts';
import { authenticateRequest, createErrorResponse } from '../utils/auth.ts';

Deno.serve(async (req) => {
  const timer = performance.start('player_stats_request');

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
    const playerKeys = body.player_keys; // Comma-separated list
    const week = body.week || '1'; // Default to week 1

    if (!leagueKey) {
      logger.warn('No league_key provided in request body');
      timer.end();
      return createErrorResponse('league_key is required in request body', 400);
    }

    // Build the API URL for player stats
    let statsUrl = `https://fantasysports.yahooapis.com/fantasy/v2/league/${leagueKey}/players;out=stats,ownership,percent_owned;stats_type=season;week=${week}`;

    if (playerKeys) {
      statsUrl += `;player_keys=${playerKeys}`;
    }

    statsUrl += '?format=json';

    // Also fetch injury data
    const injuryUrl = `https://fantasysports.yahooapis.com/fantasy/v2/league/${leagueKey}/players;out=injury;week=${week}?format=json`;

    // Make parallel API calls
    const [statsResponse, injuryResponse] = await Promise.all([
      makeYahooApiCall(yahooAccessToken, statsUrl),
      makeYahooApiCall(yahooAccessToken, injuryUrl),
    ]);

    // Check if any API call failed
    if (!statsResponse.ok || !injuryResponse.ok) {
      const errors = [];
      if (!statsResponse.ok) errors.push(`Stats: ${statsResponse.status}`);
      if (!injuryResponse.ok) errors.push(`Injury: ${injuryResponse.status}`);

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
    const [statsData, injuryData] = await Promise.all([
      statsResponse.json(),
      injuryResponse.json(),
    ]);

    logger.info('Successfully fetched player stats and injury data', {
      userId: user.id,
      leagueKey,
      week,
      playersCount:
        statsData?.fantasy_content?.league?.[1]?.players?.length || 0,
    });

    timer.end();
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          stats: statsData,
          injuries: injuryData,
        },
        message: 'Player stats and injury data fetched successfully',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    logger.error('Error in player-stats function', error);
    timer.end();
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
