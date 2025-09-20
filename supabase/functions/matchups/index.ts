// Setup type definitions for built-in Supabase Runtime APIs
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { logger, performance } from '../utils/logger.ts';
import { makeYahooApiCall } from '../utils/yahooApi.ts';
import { corsHeaders } from '../utils/constants.ts';
import { authenticateRequest, createErrorResponse } from '../utils/auth.ts';

Deno.serve(async (req) => {
  const timer = performance.start('matchups_request');

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
    const week = body.week || '1'; // Default to week 1
    const teamKey = body.team_key; // Optional team filter

    if (!leagueKey) {
      logger.warn('No league_key provided in request body');
      timer.end();
      return createErrorResponse('league_key is required in request body', 400);
    }

    // Build the API URL for matchups
    let matchupsUrl = `https://fantasysports.yahooapis.com/fantasy/v2/league/${leagueKey}/scoreboard;week=${week}?format=json`;

    if (teamKey) {
      matchupsUrl = `https://fantasysports.yahooapis.com/fantasy/v2/team/${teamKey}/matchups;week=${week}?format=json`;
    }

    // Also fetch team stats for the week
    const teamStatsUrl = `https://fantasysports.yahooapis.com/fantasy/v2/league/${leagueKey}/teams;out=stats;week=${week}?format=json`;

    // Make parallel API calls
    const [matchupsResponse, teamStatsResponse] = await Promise.all([
      makeYahooApiCall(yahooAccessToken, matchupsUrl),
      makeYahooApiCall(yahooAccessToken, teamStatsUrl),
    ]);

    // Check if any API call failed
    if (!matchupsResponse.ok || !teamStatsResponse.ok) {
      const errors = [];
      if (!matchupsResponse.ok)
        errors.push(`Matchups: ${matchupsResponse.status}`);
      if (!teamStatsResponse.ok)
        errors.push(`Team Stats: ${teamStatsResponse.status}`);

      logger.error('Yahoo API calls failed', {
        errors,
        userId: user.id,
        leagueKey,
        week,
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
    const [matchupsData, teamStatsData] = await Promise.all([
      matchupsResponse.json(),
      teamStatsResponse.json(),
    ]);

    logger.info('Successfully fetched matchups data', {
      userId: user.id,
      leagueKey,
      week,
      matchupsCount:
        matchupsData?.fantasy_content?.league?.[1]?.scoreboard?.matchups
          ?.length || 0,
    });

    timer.end();
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          matchups: matchupsData,
          teamStats: teamStatsData,
        },
        message: 'Matchups data fetched successfully',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    logger.error('Error in matchups function', error);
    timer.end();
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
