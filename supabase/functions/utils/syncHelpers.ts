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
    } catch (error: any) {
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
 * Kickoff of week 1 for a given NFL season.
 *
 * The regular season opens on the Thursday after Labor Day (the first Monday
 * in September). Anchored at 04:00 UTC, which is midnight Eastern - close
 * enough given we only ever need day-level precision, and it keeps the result
 * independent of the server's local timezone.
 */
function getSeasonOpener(seasonYear: number): Date {
  const sept1 = new Date(Date.UTC(seasonYear, 8, 1));
  // Days from Sept 1 to the first Monday (0 if Sept 1 is itself a Monday)
  const daysToLaborDay = (1 - sept1.getUTCDay() + 7) % 7;
  return new Date(
    Date.UTC(seasonYear, 8, 1 + daysToLaborDay + 3, 4, 0, 0) // Labor Day + 3 = Thursday
  );
}

/**
 * Get the NFL week currently in progress, or 0 if the season has not started.
 *
 * Weeks run Thursday through Wednesday, so a game week rolls over the day
 * after Monday Night Football. Returns 0 during the offseason and preseason so
 * callers can tell "week 1 has not happened yet" apart from "it is week 1" -
 * without that distinction, preseason silently reads as week 1 and falls back
 * to whatever stale data happens to be around.
 */
export function getCurrentNFLWeek(
  seasonYear: number = getCurrentNFLSeasonYear(),
  now: Date = new Date()
): number {
  const opener = getSeasonOpener(seasonYear);
  const elapsedMs = now.getTime() - opener.getTime();

  if (elapsedMs < 0) return 0;

  const week = Math.floor(elapsedMs / (7 * 24 * 60 * 60 * 1000)) + 1;
  return Math.min(18, week);
}

/**
 * Get the most recent NFL week, clamped to the 1-18 range.
 *
 * Prefer getCurrentNFLWeek for new code - this variant reports week 1 during
 * the preseason rather than 0, and exists so sync jobs that index data by week
 * always receive a valid week number.
 */
export function getMostRecentNFLWeek(
  seasonYear: number = getCurrentNFLSeasonYear(),
  now: Date = new Date()
): number {
  return Math.max(1, getCurrentNFLWeek(seasonYear, now));
}

/**
 * Get current NFL season year
 */
export function getCurrentNFLSeasonYear(): number {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // getMonth() returns 0-11
  // NFL season typically starts in September, so if we're before September, use previous year
  return currentMonth < 9 ? currentYear - 1 : currentYear;
}

/**
 * Get the NFL season we should be loading schedule data for.
 *
 * Differs from getCurrentNFLSeasonYear between March and August: that function
 * reports the season that most recently played (used for stats), while this one
 * reports the season that is next to play. Schedules are published in the
 * spring, so anything that fetches a schedule wants this - notably the annual
 * sync, which runs on August 1st and would otherwise re-fetch the season that
 * just finished.
 */
export function getUpcomingNFLSeasonYear(): number {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // getMonth() returns 0-11
  // Jan/Feb belong to the previous calendar year's season, which is still
  // being played. From March onward the upcoming season is this year.
  return currentMonth <= 2 ? currentYear - 1 : currentYear;
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
