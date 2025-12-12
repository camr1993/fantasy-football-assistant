import { logger, performance } from '../utils/logger.ts';
import { corsHeaders } from '../utils/constants.ts';
import { getUserTokens } from '../utils/userTokenManager.ts';
import { supabase } from '../utils/supabase.ts';
import { getUserLeagues } from './utils/getUserLeagues.ts';
import {
  getWaiverWirePlayers,
  getWaiverWireRecommendations,
  WaiverWirePlayer,
  WaiverWireRecommendation,
} from './services/waiverWire.ts';
import {
  getStartBenchRecommendations,
  StartBenchRecommendation,
} from './services/startBench/index.ts';

Deno.serve(async (req) => {
  const timer = performance.start('tips_request');

  logger.info('Tips request received', {
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
    logger.warn('Invalid method for tips', { method: req.method });
    timer.end();
    return new Response('Method not allowed', {
      status: 405,
      headers: { ...corsHeaders },
    });
  }

  try {
    // Get user data from request body
    const body = await req.json();
    const { userId } = body;

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

    logger.info('Tips request for user', { userId });

    // Get user's tokens (with automatic refresh if needed) to validate authentication
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

    logger.info('User authentication validated', { userId });

    // Get current NFL week and season year from the most recent league_calcs data
    const { data: latestCalcs, error: calcsError } = await supabase
      .from('league_calcs')
      .select('season_year, week')
      .order('season_year', { ascending: false })
      .order('week', { ascending: false })
      .limit(1)
      .single();

    if (calcsError || !latestCalcs) {
      logger.error('Failed to get current week/season from league_calcs', {
        error: calcsError,
      });
      timer.end();
      return new Response(
        JSON.stringify({
          code: 500,
          message: 'Failed to determine current NFL week',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const currentWeek = latestCalcs.week;
    const nextWeek = currentWeek + 1;
    const seasonYear = latestCalcs.season_year;

    logger.info('Current NFL week and season from league_calcs', {
      currentWeek,
      nextWeek,
      seasonYear,
    });

    // Get user's leagues
    const uniqueLeagues = await getUserLeagues(userId);

    if (uniqueLeagues.size === 0) {
      logger.warn('No leagues found for user', { userId });
      timer.end();
      return new Response(
        JSON.stringify({
          waiver_wire: [],
          start_bench_recommendations: [],
          message: 'No leagues found for user',
        }),
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // Get user teams for start/bench recommendations
    const { data: userTeams } = await supabase
      .from('teams')
      .select('id, league_id')
      .eq('user_id', userId);

    interface UserTeam {
      id: string;
      league_id: string;
    }

    const allWaiverWireResults: WaiverWirePlayer[] = [];
    const allWaiverWireRecommendations: WaiverWireRecommendation[] = [];
    const allStartBenchResults: StartBenchRecommendation[] = [];

    // Process each league
    for (const [leagueId, league] of uniqueLeagues) {
      // Get waiver wire players
      const waiverWirePlayers = await getWaiverWirePlayers(
        leagueId,
        league.name,
        seasonYear,
        currentWeek,
        nextWeek
      );
      allWaiverWireResults.push(...waiverWirePlayers);

      // Get start/bench recommendations for user's teams in this league
      const userTeamIds = ((userTeams || []) as UserTeam[])
        .filter((t) => t.league_id === leagueId)
        .map((t) => t.id);

      if (userTeamIds.length > 0) {
        const recommendations = await getStartBenchRecommendations(
          leagueId,
          league.name,
          seasonYear,
          currentWeek,
          userTeamIds
        );
        allStartBenchResults.push(...recommendations);

        // Get waiver wire recommendations (compare rostered players to waiver wire)
        const waiverRecommendations = await getWaiverWireRecommendations(
          leagueId,
          league.name,
          seasonYear,
          currentWeek,
          userTeamIds,
          waiverWirePlayers
        );
        allWaiverWireRecommendations.push(...waiverRecommendations);
      }
    }

    // Group waiver wire by position
    const waiverWireByPosition: Record<string, WaiverWirePlayer[]> = {};
    for (const player of allWaiverWireResults) {
      if (!waiverWireByPosition[player.position]) {
        waiverWireByPosition[player.position] = [];
      }
      waiverWireByPosition[player.position].push(player);
    }

    timer.end();
    return new Response(
      JSON.stringify({
        waiver_wire: waiverWireByPosition,
        waiver_wire_recommendations: allWaiverWireRecommendations,
        start_bench_recommendations: allStartBenchResults,
        current_week: currentWeek,
        next_week: nextWeek,
        season_year: seasonYear,
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    logger.error('Error in tips function', error);
    timer.end();
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/tips' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
