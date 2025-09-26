// Setup type definitions for built-in Supabase Runtime APIs
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { logger, performance } from '../utils/logger.ts';
import { corsHeaders } from '../utils/constants.ts';
import {
  getYahooCredentials,
  getYahooAccessToken,
} from '../utils/yahooAuth.ts';
import { syncMasterPlayerInjuries } from './syncMasterInjuries.ts';

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const timer = performance.startTimer('sync-injuries');

  try {
    // Verify this is a cron job request
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${Deno.env.get('CRON_SECRET')}`) {
      logger.error('Unauthorized cron job request');
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

    // Get Yahoo API credentials from environment variables
    const credentials = getYahooCredentials();
    if (!credentials) {
      timer.end();
      return new Response(
        JSON.stringify({
          error: 'Server configuration error',
          message: 'Yahoo API credentials not configured',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get a valid Yahoo access token using client credentials
    const yahooToken = await getYahooAccessToken(
      credentials.clientId,
      credentials.clientSecret
    );
    if (!yahooToken) {
      logger.error('Failed to obtain Yahoo access token');
      timer.end();
      return new Response(
        JSON.stringify({
          error: 'API authentication error',
          message: 'Failed to obtain Yahoo access token',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    logger.info('Starting master player injury data sync');

    // Sync master player injury data (not league-specific)
    const result = await syncMasterPlayerInjuries(yahooToken);

    timer.end();
    logger.info('Completed injury sync process', {
      syncId,
      duration: timer.duration,
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
