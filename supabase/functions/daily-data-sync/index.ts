// Setup type definitions for built-in Supabase Runtime APIs
import { logger, performance } from '../utils/logger.ts';
import { corsHeaders } from '../utils/constants.ts';
import { supabase } from '../utils/supabase.ts';
import { startVM } from '../utils/vmManager.ts';
import { JobData } from '../utils/types.ts';

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const timer = performance.start('daily-data-sync');

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

    logger.info('Starting daily data sync', {
      timestamp: new Date().toISOString(),
    });

    // Create daily sync jobs
    const dailyJobs = [
      {
        name: 'sync-injuries',
        status: 'pending',
        priority: 10, // High priority for scheduled jobs
        week: null,
      },
    ];

    // Insert jobs into the database
    const { data: insertedJobs, error: insertError } = await supabase
      .from('jobs')
      .insert(dailyJobs)
      .select();

    if (insertError) {
      logger.error('Failed to insert daily sync jobs', { error: insertError });
      timer.end();
      return new Response(
        JSON.stringify({
          error: 'Database error',
          message: 'Failed to create sync jobs',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    logger.info('Created daily sync jobs', {
      jobCount: insertedJobs?.length || 0,
      jobs: insertedJobs?.map((j: JobData) => j.name) || [],
    });

    // Start the VM
    await startVM();

    const duration = timer.end();
    logger.info('Completed daily data sync setup', {
      duration: `${duration}ms`,
      jobsCreated: insertedJobs?.length || 0,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Daily data sync jobs created successfully',
        jobsCreated: insertedJobs?.length || 0,
        jobs:
          insertedJobs?.map((j: JobData) => ({ id: j.id, name: j.name })) || [],
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
    logger.error('Daily data sync process failed', {
      error: errorMessage,
      stack: errorStack,
    });

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: 'Daily data sync process failed',
        details: errorMessage,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
