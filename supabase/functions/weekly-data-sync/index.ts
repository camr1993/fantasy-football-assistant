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

  const timer = performance.start('weekly-data-sync');

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

    logger.info('Starting weekly data sync', {
      timestamp: new Date().toISOString(),
      week,
    });

    // Create weekly sync jobs
    const weeklyJobs = [
      // {
      //   name: 'sync-players',
      //   status: 'pending',
      //   week: null,
      // },
      // {
      //   name: 'sync-player-stats',
      //   status: 'pending',
      //   week: week || null,
      // },
      // {
      //   name: 'sync-opponents',
      //   status: 'pending',
      //   week: week || null,
      // },
      {
        name: 'fantasy-points-calc',
        status: 'pending',
        week: week || null,
      },
      {
        name: 'sync-defense-points-against',
        status: 'pending',
        week: week || null,
      },
      // {
      //   name: 'league-calcs',
      //   status: 'pending',
      //   week: week || null,
      // },
    ];

    // Insert jobs into the database
    const { data: insertedJobs, error: insertError } = await supabase
      .from('jobs')
      .insert(weeklyJobs)
      .select();

    if (insertError) {
      logger.error('Failed to insert weekly sync jobs', { error: insertError });
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

    logger.info('Created weekly sync jobs', {
      jobCount: insertedJobs?.length || 0,
      jobs: insertedJobs?.map((j: JobData) => j.name) || [],
      week,
    });

    // Start the VM
    await startVM();

    const duration = timer.end();
    logger.info('Completed weekly data sync setup', {
      duration: `${duration}ms`,
      jobsCreated: insertedJobs?.length || 0,
      week,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Weekly data sync jobs created successfully',
        jobsCreated: insertedJobs?.length || 0,
        jobs:
          insertedJobs?.map((j: JobData) => ({ id: j.id, name: j.name })) || [],
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
    logger.error('Weekly data sync process failed', {
      error: errorMessage,
      stack: errorStack,
    });

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: 'Weekly data sync process failed',
        details: errorMessage,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
