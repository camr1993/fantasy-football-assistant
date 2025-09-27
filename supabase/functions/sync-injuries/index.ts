// Setup type definitions for built-in Supabase Runtime APIs
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { logger, performance } from '../utils/logger.ts';
import { corsHeaders } from '../utils/constants.ts';
import { getUserTokens } from '../utils/userTokenManager.ts';
import { syncMasterPlayerInjuries } from './syncMasterInjuries.ts';

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const timer = performance.start('sync-injuries');

  try {
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
    logger.info('Starting injury sync process', {
      syncId,
      timestamp: new Date().toISOString(),
    });

    // Get user's Yahoo tokens (using your email)
    const userTokens = await getUserTokens('cam1079@yahoo.com');
    if (!userTokens) {
      logger.error('Failed to get user tokens for injury sync');
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

    logger.info('Using user tokens for injury sync', {
      userId: userTokens.user_id,
      email: userTokens.email,
      hasAccessToken: !!userTokens.access_token,
    });

    logger.info('Starting master player injury data sync');

    // Sync master player injury data (not league-specific)
    const result = await syncMasterPlayerInjuries(userTokens.access_token);

    const duration = timer.end();
    logger.info('Completed injury sync process', {
      syncId,
      duration: `${duration}ms`,
      result,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Injury sync completed successfully',
        syncId,
        result,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    timer.end();
    logger.error('Injury sync process failed', {
      error: error.message,
      stack: error.stack,
    });

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: 'Injury sync process failed',
        details: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
