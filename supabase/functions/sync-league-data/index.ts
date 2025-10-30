import { logger, performance } from '../utils/logger.ts';
import { corsHeaders } from '../utils/constants.ts';
import { supabase } from '../utils/supabase.ts';
import { getUserTokens } from '../utils/userTokenManager.ts';
import { startVM } from '../utils/vmManager.ts';

Deno.serve(async (req) => {
  const timer = performance.start('sync_league_data_request');

  logger.info('League data sync request received', {
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
    logger.warn('Invalid method for league data sync', { method: req.method });
    timer.end();
    return new Response('Method not allowed', {
      status: 405,
      headers: { ...corsHeaders },
    });
  }

  try {
    // Get user data from request body
    const body = await req.json();
    const { userId, syncType = 'full' } = body;

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

    logger.info('League data sync request for user', {
      userId,
      syncType,
    });

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

    // Create job in the database
    const jobName =
      syncType === 'roster' ? 'sync-team-roster-only' : 'sync-league-data';

    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .insert({
        name: jobName,
        status: 'pending',
        user_id: userId,
        priority: 100, // Normal priority for user-triggered jobs (default)
      })
      .select()
      .single();

    if (jobError) {
      logger.error('Failed to create job', {
        userId,
        syncType,
        error: jobError,
      });
      timer.end();
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Failed to create sync job',
          error: jobError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    logger.info('Job created successfully', {
      jobId: job.id,
      jobName: job.name,
      userId,
      syncType,
    });

    // Start the VM
    await startVM();

    const duration = timer.end();
    logger.info('Completed league data sync setup', {
      duration: `${duration}ms`,
      userId,
      syncType,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'League data sync job created successfully',
        jobId: job.id,
        status: 'pending',
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  } catch (error) {
    logger.error('League data sync error', { error });
    timer.end();
    return new Response(
      JSON.stringify({
        success: false,
        message: 'League data sync failed',
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
