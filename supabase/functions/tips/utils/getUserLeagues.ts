import { logger } from '../../utils/logger.ts';
import { supabase } from '../../utils/supabase.ts';

export interface LeagueInfo {
  id: string;
  name: string;
  season_year: number;
}

/**
 * Get unique leagues for a user in the given season
 *
 * Yahoo issues a new league key every season, so a returning user accumulates
 * one leagues row per year. Without the season filter this returns every
 * league they have ever played in and tips get computed off retired rosters.
 */
export async function getUserLeagues(
  userId: string,
  seasonYear: number
): Promise<Map<string, LeagueInfo>> {
  // Get user's leagues (through teams)
  const { data: userTeams, error: teamsError } = await supabase
    .from('teams')
    .select('id, league_id, leagues!inner(id, name, season_year)')
    .eq('user_id', userId)
    .eq('leagues.season_year', seasonYear);

  if (teamsError) {
    logger.error('Error fetching user teams', {
      userId,
      seasonYear,
      error: teamsError,
    });
    throw new Error(`Failed to fetch user teams: ${teamsError.message}`);
  }

  if (!userTeams || userTeams.length === 0) {
    logger.warn('No teams found for user in season', { userId, seasonYear });
    return new Map();
  }

  // Extract unique leagues
  const uniqueLeagues = new Map<string, LeagueInfo>();
  for (const team of userTeams) {
    const leagues = team.leagues as Array<LeagueInfo>;
    const leagueArray = Array.isArray(leagues) ? leagues : [leagues];
    for (const league of leagueArray) {
      if (!uniqueLeagues.has(league.id)) {
        uniqueLeagues.set(league.id, league);
      }
    }
  }

  logger.info('Found user leagues', {
    userId,
    seasonYear,
    leagueCount: uniqueLeagues.size,
  });

  return uniqueLeagues;
}
