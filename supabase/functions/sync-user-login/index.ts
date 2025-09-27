// Setup type definitions for built-in Supabase Runtime APIs
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { logger, performance } from '../utils/logger.ts';
import { corsHeaders } from '../utils/constants.ts';
import { authenticateRequest, createErrorResponse } from '../utils/auth.ts';
import { syncUserLoginData } from './syncUserData.ts';

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const timer = performance.startTimer('sync-user-login');

  try {
    // Authenticate the request
    const { user, yahooToken } = await authenticateRequest(req);
    if (!user || !yahooToken) {
      return createErrorResponse('Authentication failed', 401);
    }

    const syncId = crypto.randomUUID();
    logger.info('Starting user login sync process', {
      syncId,
      userId: user.id,
      timestamp: new Date().toISOString(),
    });

    // Sync user login data (leagues and teams)
    const result = await syncUserLoginData(user.id, yahooToken);

    timer.end();
    logger.info('Completed user login sync process', {
      syncId,
      userId: user.id,
      duration: timer.duration,
      result,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'User login sync completed successfully',
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
    logger.error('User login sync process failed', {
      error: error.message,
      stack: error.stack,
    });

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: 'User login sync process failed',
        details: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
