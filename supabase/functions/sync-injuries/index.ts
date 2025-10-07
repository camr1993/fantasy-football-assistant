// Setup type definitions for built-in Supabase Runtime APIs
import { logger, performance } from '../utils/logger.ts';
import { corsHeaders } from '../utils/constants.ts';
import { getUserTokens } from '../utils/userTokenManager.ts';
import { syncAllPlayerInjuries } from './injurySync.ts';
import {
  logSyncStart,
  logSyncComplete,
  logSyncError,
} from '../utils/syncHelpers.ts';

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

    // Get user's Yahoo tokens (using super admin user id)
    const superAdminUserId = Deno.env.get('SUPER_ADMIN_USER_ID') ?? '';
    const userTokens = await getUserTokens(superAdminUserId);
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

    // Start sync logging
    const syncLogId = await logSyncStart('injury_sync', null);
    let recordsProcessed = 0;

    try {
      logger.info('Starting master player injury data sync');

      // Sync all NFL player injuries (master data)
      const injuriesProcessed = await syncAllPlayerInjuries(
        userTokens.access_token
      );
      recordsProcessed += injuriesProcessed;

      await logSyncComplete(syncLogId, recordsProcessed);
      logger.info('Completed master player injury data sync', {
        injuriesProcessed,
        totalProcessed: recordsProcessed,
      });

      const result = {
        injuriesProcessed,
        totalProcessed: recordsProcessed,
      };

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
    } catch (syncError: unknown) {
      const errorMessage =
        syncError instanceof Error ? syncError.message : String(syncError);
      await logSyncError(syncLogId, errorMessage);
      logger.error('Failed to sync master player injury data', {
        error: errorMessage,
      });
      throw syncError;
    }
  } catch (error: unknown) {
    timer.end();
    logger.error('Injury sync process failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: 'Injury sync process failed',
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
