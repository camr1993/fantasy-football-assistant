// Setup type definitions for built-in Supabase Runtime APIs
import { logger, performance } from '../utils/logger.ts';
import { corsHeaders } from '../utils/constants.ts';
import { getUserTokens } from '../utils/userTokenManager.ts';
import { syncAllPlayerStats } from './syncPlayerStats.ts';

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const timer = performance.start('sync-player-stats');

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
    logger.info('Starting player stats sync process', {
      syncId,
      timestamp: new Date().toISOString(),
    });

    // Get user's Yahoo tokens (using your email)
    const userTokens = await getUserTokens('cam1079@yahoo.com');
    if (!userTokens) {
      logger.error('Failed to get user tokens for player stats sync');
      timer.end();
      return new Response(
        JSON.stringify({
          error: 'Authentication error',
          message: 'Failed to get user Yahoo tokens',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    logger.info('Using user tokens for player stats sync', {
      userId: userTokens.user_id,
      email: userTokens.email,
      hasAccessToken: !!userTokens.access_token,
    });

    logger.info('Starting player stats sync', { week });

    // Sync player stats
    const statsProcessed = await syncAllPlayerStats(
      userTokens.access_token,
      week
    );

    const duration = timer.end();
    logger.info('Completed player stats sync process', {
      syncId,
      duration: `${duration}ms`,
      statsProcessed,
      week,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Player stats sync completed successfully',
        syncId,
        statsProcessed,
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
    logger.error('Player stats sync process failed', {
      error: errorMessage,
      stack: errorStack,
    });

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: 'Player stats sync process failed',
        details: errorMessage,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
