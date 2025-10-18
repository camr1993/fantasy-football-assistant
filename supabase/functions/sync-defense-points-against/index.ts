// Setup type definitions for built-in Supabase Runtime APIs
import { logger, performance } from '../utils/logger.ts';
import { corsHeaders } from '../utils/constants.ts';
import { syncDefensePointsAgainst } from './syncDefensePointsAgainst.ts';

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const timer = performance.start('sync-defense-points-against');

  try {
    // Parse request body for optional week parameter
    let week: number | undefined;
    try {
      const body = await req.json();
      week = body.week;
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
      // If JSON parsing fails, continue without week parameter (for cron jobs)
      logger.debug('No request body or invalid JSON, using default week');
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

    const syncId = crypto.randomUUID();
    logger.info('Starting defense totals sync process', {
      syncId,
      timestamp: new Date().toISOString(),
    });

    logger.info('Starting defense points against sync', { week });

    // Sync defense points against
    const totalsProcessed = await syncDefensePointsAgainst(week);

    const duration = timer.end();
    logger.info('Completed defense points against sync process', {
      syncId,
      duration: `${duration}ms`,
      totalsProcessed,
      week,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Defense points against sync completed successfully',
        syncId,
        totalsProcessed,
        week,
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
    logger.error('Defense points against sync process failed', {
      error: errorMessage,
      stack: errorStack,
    });

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: 'Defense points against sync process failed',
        details: errorMessage,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
