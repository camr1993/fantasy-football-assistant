import { logger } from './logger.ts';
import { supabase } from './supabase.ts';
import { makeYahooApiCall } from './yahooApi.ts';

/**
 * Make Yahoo API call with retry logic
 */
export async function makeYahooApiCallWithRetry(
  accessToken: string,
  url: string,
  maxRetries: number = 3
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await makeYahooApiCall(accessToken, url);

      if (response.ok) {
        return response;
      }

      // If it's a rate limit error, wait longer
      if (response.status === 429) {
        const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff
        logger.warn('Rate limited, waiting before retry', {
          attempt,
          waitTime,
        });
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }

      // If it's a client error (4xx), don't retry
      if (response.status >= 400 && response.status < 500) {
        return response;
      }

      // For server errors (5xx), retry
      lastError = new Error(
        `API call failed: ${response.status} ${response.statusText}`
      );
    } catch (error) {
      lastError = error;
    }

    if (attempt < maxRetries) {
      const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff
      logger.warn('API call failed, retrying', {
        attempt,
        waitTime,
        error: lastError?.message,
      });
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

/**
 * Log sync start
 */
export async function logSyncStart(
  syncType: string,
  leagueId: string | null = null,
  userId: string | null = null
): Promise<string> {
  const { data, error } = await supabase.rpc('log_sync_operation', {
    p_sync_type: syncType,
    p_status: 'started',
    p_league_id: leagueId,
    p_user_id: userId,
  });

  if (error) {
    logger.error('Failed to log sync start', { error });
    return '';
  }

  return data;
}

/**
 * Log sync completion
 */
export async function logSyncComplete(
  syncLogId: string,
  recordsProcessed: number
) {
  await supabase
    .from('sync_logs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      records_processed: recordsProcessed,
    })
    .eq('id', syncLogId);
}

/**
 * Log sync error
 */
export async function logSyncError(syncLogId: string, errorMessage: string) {
  await supabase
    .from('sync_logs')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: errorMessage,
    })
    .eq('id', syncLogId);
}

/**
 * Get current NFL week
 */
export function getCurrentNFLWeek(): number {
  const now = new Date();
  const seasonStart = new Date(now.getFullYear(), 8, 1); // September 1st
  const weeksSinceStart = Math.floor(
    (now.getTime() - seasonStart.getTime()) / (7 * 24 * 60 * 60 * 1000)
  );
  return Math.max(1, Math.min(18, weeksSinceStart + 1));
}

/**
 * Calculate points from Yahoo stats
 */
export function calculatePointsFromStats(stats: any[]): number {
  let points = 0;

  for (const stat of stats) {
    const statId = stat.stat_id;
    const value = parseFloat(stat.value) || 0;

    switch (statId) {
      case '4': // Passing Yards
        points += value * 0.04;
        break;
      case '5': // Passing Touchdowns
        points += value * 4;
        break;
      case '6': // Interceptions
        points -= value * 2;
        break;
      case '7': // Rushing Yards
        points += value * 0.1;
        break;
      case '8': // Rushing Touchdowns
        points += value * 6;
        break;
      case '9': // Receptions
        points += value * 1; // PPR
        break;
      case '10': // Receiving Yards
        points += value * 0.1;
        break;
      case '11': // Receiving Touchdowns
        points += value * 6;
        break;
      case '12': // Fumbles Lost
        points -= value * 2;
        break;
    }
  }

  return Math.round(points * 100) / 100;
}
