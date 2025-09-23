// Setup type definitions for built-in Supabase Runtime APIs
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { logger, performance } from '../utils/logger.ts';
import { corsHeaders } from '../utils/constants.ts';
import { supabase } from '../utils/supabase.ts';

/**
 * Edge function for syncing Yahoo API data to Supabase
 * This function is designed to be triggered by pg_cron jobs
 *
 * Authentication: Uses a cron job secret key for authentication
 * This allows the function to be called by Supabase's pg_cron extension
 * without requiring user authentication
 */
Deno.serve(async (req) => {
  const timer = performance.start('sync_data_request');

  try {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
      logger.info('Handling CORS preflight request for sync-data');
      timer.end();
      return new Response(null, {
        status: 200,
        headers: corsHeaders,
      });
    }

    // Only allow POST requests for sync operations
    if (req.method !== 'POST') {
      logger.warn('Invalid method for sync-data', { method: req.method });
      timer.end();
      return new Response(
        JSON.stringify({
          error: 'Method not allowed',
          message: 'Only POST requests are allowed for sync operations',
        }),
        {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
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

    logger.info('Sync data function triggered by cron job', {
      timestamp: new Date().toISOString(),
      userAgent: req.headers.get('user-agent'),
    });

    // TODO: Implement actual data sync logic here
    // For now, just log that the sync process would start
    logger.info('Starting Yahoo API data sync process', {
      syncId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    });

    // Simulate some work being done
    await new Promise(resolve => setTimeout(resolve, 100));

    // Log completion
    logger.info('Yahoo API data sync process completed', {
      timestamp: new Date().toISOString(),
      duration: timer.getElapsedTime(),
    });

    timer.end();

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Data sync process completed successfully',
        timestamp: new Date().toISOString(),
        syncId: crypto.randomUUID(),
        duration: timer.getElapsedTime(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    logger.error('Error in sync-data function', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
    timer.end();

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: 'An error occurred during the sync process',
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Set the CRON_JOB_SECRET environment variable
  3. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/sync-data' \
    --header 'x-cron-secret: your-secret-here' \
    --header 'Content-Type: application/json'

  To set up the cron job in Supabase:

  SELECT cron.schedule(
    'sync-yahoo-data',
    '0 */6 * * *', -- Every 6 hours
    'SELECT net.http_post(
      url:=''https://your-project.supabase.co/functions/v1/sync-data'',
      headers:=''{"x-cron-secret": "your-secret-here", "Content-Type": "application/json"}''::jsonb
    );'
  );

*/
