// Setup type definitions for built-in Supabase Runtime APIs
import { logger, performance } from '../utils/logger.ts';
import { corsHeaders } from '../utils/constants.ts';
import { handleLeagueCalculations } from './leagueCalcs.ts';

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const timer = performance.start('league-calcs');

  try {
    // Parse request body for optional parameters
    let week: number | undefined;
    let league_id: string | undefined;
    let recalculate_all: boolean | undefined;

    try {
      const body = await req.json();
      week = body.week;
      league_id = body.league_id;
      recalculate_all = body.recalculate_all;

      if (
        week !== undefined &&
        (typeof week !== 'number' || week < 1 || week > 18)
      ) {
        logger.warn('Invalid week parameter provided', { week });
        return new Response(
          JSON.stringify({
            error: 'Invalid week parameter',
            message: 'Week must be a number between 1 and 18',
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    } catch (_parseError) {
      // If JSON parsing fails, continue without parameters (for cron jobs)
      logger.debug('No request body or invalid JSON, using default parameters');
    }

    // Authenticate using cron job secret
    const cronSecret = req.headers.get('x-supabase-webhook-source');
    const expectedSecret = Deno.env.get('CRON_JOB_SECRET');

    if (!expectedSecret) {
      logger.error('CRON_JOB_SECRET environment variable not set');
      timer.end();
      return new Response(
        JSON.stringify({
          error: 'Server configuration error',
          message: 'Cron job secret not configured',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!cronSecret || cronSecret !== expectedSecret) {
      logger.warn('Invalid or missing cron job secret', {
        hasSecret: !!cronSecret,
        secretLength: cronSecret?.length || 0,
      });
      timer.end();
      return new Response(
        JSON.stringify({
          error: 'Unauthorized',
          message: 'Invalid cron job secret',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const calcId = crypto.randomUUID();
    logger.info('Starting league calculations process', {
      calcId,
      timestamp: new Date().toISOString(),
      week,
      league_id,
      recalculate_all,
    });

    // Handle the league calculations using the separated logic
    const result = await handleLeagueCalculations({
      league_id,
      week,
      recalculate_all,
    });

    const duration = timer.end();
    logger.info('Completed league calculations process', {
      calcId,
      duration: `${duration}ms`,
      week,
      league_id,
      recalculate_all,
      success: result.success,
    });

    return new Response(
      JSON.stringify({
        ...result,
        calcId,
        week,
        league_id,
        recalculate_all,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: unknown) {
    timer.end();
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error('League calculations process failed', {
      error: errorMessage,
      stack: errorStack,
    });

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: 'League calculations process failed',
        details: errorMessage,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
