import { supabase } from '../../../supabase/functions/utils/supabase.ts';
import { logger } from '../../../supabase/functions/utils/logger.ts';
import { getUpcomingNFLSeasonYear } from '../../../supabase/functions/utils/syncHelpers.ts';

/**
 * ESPN rejects requests from known programmatic runtimes with 403 Forbidden -
 * Deno's fetch sends "Deno/x.y.z" by default, which is blocked. An explicit
 * descriptive User-Agent is accepted, so identify the app rather than
 * impersonating a browser.
 */
const USER_AGENT =
  'FantasyEdge/1.0 (+https://github.com/camr1993/fantasy-football-assistant)';

// NFL regular season weeks, and ESPN's season type for the regular season
const REGULAR_SEASON_WEEKS = 18;
const REGULAR_SEASON_TYPE = 2;

/**
 * Build the ESPN scoreboard URL for a single week of a season.
 *
 * ESPN's site v2 scoreboard returns HTTP 400 for date-range queries
 * (`dates=YYYYMMDD-YYYYMMDD`), so a season has to be fetched a week at a time
 * rather than in one call.
 */
function getScoreboardUrl(seasonYear: number, week: number): string {
  return (
    'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard' +
    `?season=${seasonYear}&seasontype=${REGULAR_SEASON_TYPE}&week=${week}`
  );
}

// Interface for NFL matchup data
interface NflMatchup {
  home_team: string;
  away_team: string;
  season: number;
  week: number;
  updated_at: string;
}

// Interface for ESPN API response
interface EspnEvent {
  id: string;
  name: string;
  shortName: string;
  season: {
    year: number;
    type: number;
    slug: string;
  };
  week: {
    number: number;
  };
  competitions: Array<{
    competitors: Array<{
      homeAway: 'home' | 'away';
      team: {
        displayName: string;
      };
    }>;
  }>;
}

interface EspnResponse {
  leagues: Array<{
    season: {
      year: number;
    };
  }>;
  events: EspnEvent[];
}

/**
 * Fetch one week of NFL matchups from the ESPN API
 */
async function fetchWeek(
  seasonYear: number,
  week: number
): Promise<NflMatchup[]> {
  const url = getScoreboardUrl(seasonYear, week);
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(
      `ESPN API request failed for week ${week}: ${response.status} ${response.statusText}`
    );
  }

  const data: EspnResponse = await response.json();

  if (!data.events || !Array.isArray(data.events)) {
    logger.warn('No events found in ESPN API response', { seasonYear, week });
    return [];
  }

  const matchups: NflMatchup[] = [];

  for (const event of data.events) {
    // Only process regular season games
    if (event.season.type !== REGULAR_SEASON_TYPE) {
      continue;
    }

    const competitors = event.competitions[0]?.competitors;
    const homeTeam = competitors?.find((c) => c.homeAway === 'home')?.team
      ?.displayName;
    const awayTeam = competitors?.find((c) => c.homeAway === 'away')?.team
      ?.displayName;

    if (!homeTeam || !awayTeam) {
      logger.warn('Missing team data for event', {
        eventId: event.id,
        eventName: event.name,
        week,
      });
      continue;
    }

    matchups.push({
      home_team: homeTeam,
      away_team: awayTeam,
      season: event.season.year,
      week: event.week.number,
      updated_at: new Date().toISOString(),
    });
  }

  return matchups;
}

/**
 * Fetches a full regular season of NFL matchups from the ESPN API.
 *
 * Walks the season one week at a time because ESPN rejects date-range
 * queries. A failure on any week aborts rather than storing a partial
 * schedule, since downstream opponent and scoring calcs read this table and
 * silently treat missing weeks as "no opponent".
 */
async function fetchNflMatchups(seasonYear: number): Promise<NflMatchup[]> {
  try {
    logger.info('Fetching NFL matchups from ESPN API', {
      seasonYear,
      weeks: REGULAR_SEASON_WEEKS,
    });

    const matchups: NflMatchup[] = [];

    for (let week = 1; week <= REGULAR_SEASON_WEEKS; week++) {
      const weekMatchups = await fetchWeek(seasonYear, week);
      matchups.push(...weekMatchups);
    }

    logger.info('Successfully parsed NFL matchups', {
      seasonYear,
      matchupsCount: matchups.length,
      weeksWithGames: new Set(matchups.map((m) => m.week)).size,
    });

    return matchups;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to fetch NFL matchups from ESPN API', {
      seasonYear,
      error: errorMessage,
    });
    throw error;
  }
}

/**
 * Stores NFL matchups in the database
 */
async function storeNflMatchups(matchups: NflMatchup[]): Promise<number> {
  if (matchups.length === 0) {
    logger.info('No matchups to store');
    return 0;
  }

  try {
    logger.info('Storing NFL matchups in database', { count: matchups.length });

    // Use upsert to handle duplicates
    const { data, error } = await supabase
      .from('nfl_matchups')
      .upsert(matchups, {
        onConflict: 'home_team,away_team,season,week',
        ignoreDuplicates: false,
      })
      .select();

    if (error) {
      throw new Error(`Database upsert failed: ${error.message}`);
    }

    const storedCount = data?.length || 0;
    logger.info('Successfully stored NFL matchups', {
      storedCount,
      totalMatchups: matchups.length,
    });

    return storedCount;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to store NFL matchups in database', {
      error: errorMessage,
    });
    throw error;
  }
}

/**
 * Main function to sync NFL matchups
 */
export async function syncNflMatchups(
  seasonYear: number = getUpcomingNFLSeasonYear()
): Promise<number> {
  try {
    logger.info('Starting NFL matchups sync', { seasonYear });

    // Fetch matchups from ESPN API
    const matchups = await fetchNflMatchups(seasonYear);

    if (matchups.length === 0) {
      logger.warn('No matchups found to sync', { seasonYear });
      return 0;
    }

    // ESPN stamps each event with its own season, so surface any mismatch
    // rather than quietly writing rows for a season we did not ask for.
    const unexpected = matchups.filter((m) => m.season !== seasonYear);
    if (unexpected.length > 0) {
      logger.warn('ESPN returned matchups outside the requested season', {
        seasonYear,
        unexpectedCount: unexpected.length,
        seasonsSeen: [...new Set(matchups.map((m) => m.season))],
      });
    }

    // Store matchups in database
    const storedCount = await storeNflMatchups(matchups);

    logger.info('NFL matchups sync completed successfully', {
      seasonYear,
      totalMatchups: matchups.length,
      storedCount,
    });

    return storedCount;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('NFL matchups sync failed', { error: errorMessage });
    throw error;
  }
}
