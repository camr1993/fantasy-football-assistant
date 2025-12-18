import { logger, performance } from '../utils/logger.ts';
import { corsHeaders } from '../utils/constants.ts';
import { supabase } from '../utils/supabase.ts';
import { getUserTokens } from '../utils/userTokenManager.ts';

interface InitializationStatus {
  league_id: string;
  league_name: string;
  status: 'pending' | 'in_progress' | 'ready' | 'error';
  total_jobs: number;
  completed_jobs: number;
  current_step: string | null;
  error_message: string | null;
}

interface InitializationRecord {
  league_id: string;
  status: 'pending' | 'in_progress' | 'ready' | 'error';
  total_jobs: number;
  completed_jobs: number;
  current_step: string | null;
  error_message: string | null;
  leagues: { name: string } | { name: string }[] | null;
}

interface InitializationResponse {
  success: boolean;
  all_ready: boolean;
  leagues: InitializationStatus[];
}

Deno.serve(async (req) => {
  const timer = performance.start('check_initialization_status_request');

  logger.info('Initialization status check request received', {
    method: req.method,
    url: req.url,
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
    logger.warn('Invalid method for initialization status check', {
      method: req.method,
    });
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
          success: false,
          message: 'Missing userId',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

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

    logger.info('Checking initialization status for user', { userId });

    // Get all initialization records for this user
    const { data: initRecords, error: initError } = await supabase
      .from('league_initialization')
      .select(
        `
        league_id,
        status,
        total_jobs,
        completed_jobs,
        current_step,
        error_message,
        leagues!inner(name)
      `
      )
      .eq('user_id', userId);

    if (initError) {
      logger.error('Failed to fetch initialization status', {
        userId,
        error: initError,
      });
      timer.end();
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Failed to fetch initialization status',
          error: initError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // If no records found, user has no leagues being initialized
    if (!initRecords || initRecords.length === 0) {
      // Check if user has any leagues at all
      const { data: userTeams, error: teamsError } = await supabase
        .from('teams')
        .select('league_id')
        .eq('user_id', userId)
        .limit(1);

      if (teamsError) {
        logger.error('Failed to check user teams', {
          userId,
          error: teamsError,
        });
      }

      // If user has teams but no initialization records, they're fully set up
      const isSetUp = userTeams && userTeams.length > 0;

      timer.end();
      return new Response(
        JSON.stringify({
          success: true,
          all_ready: isSetUp,
          leagues: [],
          message: isSetUp
            ? 'User is fully set up'
            : 'No leagues found for user',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Transform records into response format
    const leagues: InitializationStatus[] = (
      initRecords as InitializationRecord[]
    ).map((record) => {
      // Handle both array and object formats from Supabase join
      const leagueName = Array.isArray(record.leagues)
        ? record.leagues[0]?.name
        : record.leagues?.name;

      return {
        league_id: record.league_id,
        league_name: leagueName || 'Unknown League',
        status: record.status,
        total_jobs: record.total_jobs,
        completed_jobs: record.completed_jobs,
        current_step: record.current_step,
        error_message: record.error_message,
      };
    });

    // Check if all leagues are ready
    const allReady = leagues.every((league) => league.status === 'ready');

    const response: InitializationResponse = {
      success: true,
      all_ready: allReady,
      leagues,
    };

    const duration = timer.end();
    logger.info('Initialization status check completed', {
      duration: `${duration}ms`,
      userId,
      leagueCount: leagues.length,
      allReady,
    });

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('Initialization status check error', { error });
    timer.end();
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Initialization status check failed',
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
