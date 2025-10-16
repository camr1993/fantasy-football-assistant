import { createClient } from 'supabase';
import { logger } from '../utils/logger.ts';

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ESPN API endpoint - dynamically generate dates for current NFL season
const getCurrentNflSeason = () => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // getMonth() returns 0-11

  // NFL season typically starts in September, so if we're before September, use previous year
  const nflSeasonYear = currentMonth < 9 ? currentYear - 1 : currentYear;
  const nextYear = nflSeasonYear + 1;

  return {
    seasonStart: `${nflSeasonYear}0901`, // September 1st
    seasonEnd: `${nextYear}0131`, // January 31st of next year
  };
};

const { seasonStart, seasonEnd } = getCurrentNflSeason();
const ESPN_SCOREBOARD_URL = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?limit=1000&dates=${seasonStart}-${seasonEnd}`;

// Interface for NFL matchup data
interface NflMatchup {
  home_team: string;
  away_team: string;
  season: number;
  week: number;
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
 * Fetches NFL matchups from ESPN API
 */
async function fetchNflMatchups(): Promise<NflMatchup[]> {
  try {
    logger.info('Fetching NFL matchups from ESPN API', {
      url: ESPN_SCOREBOARD_URL,
      seasonStart,
      seasonEnd,
    });

    const response = await fetch(ESPN_SCOREBOARD_URL);

    if (!response.ok) {
      throw new Error(
        `ESPN API request failed: ${response.status} ${response.statusText}`
      );
    }

    const data: EspnResponse = await response.json();

    if (!data.events || !Array.isArray(data.events)) {
      logger.warn('No events found in ESPN API response');
      return [];
    }

    const currentSeason =
      data.leagues?.[0]?.season?.year || new Date().getFullYear();
    logger.info('Processing NFL matchups', {
      eventCount: data.events.length,
      season: currentSeason,
    });

    const matchups: NflMatchup[] = [];

    for (const event of data.events) {
      // Only process regular season games (type: 2)
      if (event.season.type !== 2) {
        continue;
      }

      // Extract home and away teams
      const homeTeam = event.competitions[0]?.competitors?.find(
        (c) => c.homeAway === 'home'
      )?.team?.displayName;
      const awayTeam = event.competitions[0]?.competitors?.find(
        (c) => c.homeAway === 'away'
      )?.team?.displayName;

      if (!homeTeam || !awayTeam) {
        logger.warn('Missing team data for event', {
          eventId: event.id,
          eventName: event.name,
        });
        continue;
      }

      matchups.push({
        home_team: homeTeam,
        away_team: awayTeam,
        season: event.season.year,
        week: event.week.number,
      });
    }

    logger.info('Successfully parsed NFL matchups', {
      matchupsCount: matchups.length,
      season: currentSeason,
    });

    return matchups;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to fetch NFL matchups from ESPN API', {
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
export async function syncNflMatchups(): Promise<number> {
  try {
    logger.info('Starting NFL matchups sync');

    // Fetch matchups from ESPN API
    const matchups = await fetchNflMatchups();

    if (matchups.length === 0) {
      logger.warn('No matchups found to sync');
      return 0;
    }

    // Store matchups in database
    const storedCount = await storeNflMatchups(matchups);

    logger.info('NFL matchups sync completed successfully', {
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
