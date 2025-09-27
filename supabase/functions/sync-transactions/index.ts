// Setup type definitions for built-in Supabase Runtime APIs
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { logger, performance } from '../utils/logger.ts';
import { corsHeaders } from '../utils/constants.ts';
import { authenticateRequest, createErrorResponse } from '../utils/auth.ts';
import { supabase } from '../utils/supabase.ts';
import { syncLeagueTransactions } from './syncLeagueTransactions.ts';

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const timer = performance.startTimer('sync-transactions');

  try {
    // Authenticate the request
    const { user, yahooToken } = await authenticateRequest(req);
    if (!user || !yahooToken) {
      return createErrorResponse('Authentication failed', 401);
    }

    const syncId = crypto.randomUUID();
    logger.info('Starting transaction sync process', {
      syncId,
      userId: user.id,
      timestamp: new Date().toISOString(),
    });

    // Get all leagues for this user
    const { data: leagues, error: leaguesError } = await supabase
      .from('leagues')
      .select('id, yahoo_league_id');

    if (leaguesError) {
      throw new Error(`Failed to fetch leagues: ${leaguesError.message}`);
    }

    if (!leagues || leagues.length === 0) {
      logger.warn('No leagues found for user', { userId: user.id });
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No leagues found for user',
          syncId,
          result: { leaguesProcessed: 0, totalTransactions: 0 },
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    let totalTransactions = 0;
    const results = [];

    // Sync transactions for each league
    for (const league of leagues) {
      try {
        const result = await syncLeagueTransactions(
          league.id,
          league.yahoo_league_id,
          yahooToken
        );
        totalTransactions += result.transactionsProcessed;
        results.push({
          leagueId: league.id,
          leagueKey: league.yahoo_league_id,
          ...result,
        });
      } catch (error) {
        logger.error('Failed to sync transactions for league', {
          leagueId: league.id,
          leagueKey: league.yahoo_league_id,
          error: error.message,
        });
        results.push({
          leagueId: league.id,
          leagueKey: league.yahoo_league_id,
          error: error.message,
        });
      }
    }

    timer.end();
    logger.info('Completed transaction sync process', {
      syncId,
      userId: user.id,
      duration: timer.duration,
      totalTransactions,
      results,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Transaction sync completed successfully',
        syncId,
        result: {
          leaguesProcessed: leagues.length,
          totalTransactions,
          results,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    timer.end();
    logger.error('Transaction sync process failed', {
      error: error.message,
      stack: error.stack,
    });

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: 'Transaction sync process failed',
        details: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
