import { logger } from '../../utils/logger.ts';
import { supabase } from '../../utils/supabase.ts';

export interface LeagueInfo {
  id: string;
  name: string;
  season_year: number;
}

/**
 * Get unique leagues for a user
 */
export async function getUserLeagues(
  userId: string
): Promise<Map<string, LeagueInfo>> {
  // Get user's leagues (through teams)
  const { data: userTeams, error: teamsError } = await supabase
    .from('teams')
    .select('id, league_id, leagues!inner(id, name, season_year)')
    .eq('user_id', userId);

  if (teamsError) {
    logger.error('Error fetching user teams', { userId, error: teamsError });
    throw new Error(`Failed to fetch user teams: ${teamsError.message}`);
  }

  if (!userTeams || userTeams.length === 0) {
    logger.warn('No teams found for user', { userId });
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
    leagueCount: uniqueLeagues.size,
  });

  return uniqueLeagues;
}

