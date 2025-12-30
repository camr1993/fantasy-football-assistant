import type { StoredUserTeam } from '../types';

// Cache for user teams data
let cachedUserTeams: StoredUserTeam[] | null = null;

/**
 * Get the user's teams from stored user_teams data
 */
export async function getUserTeams(): Promise<StoredUserTeam[]> {
  if (cachedUserTeams !== null) {
    return cachedUserTeams;
  }
  try {
    const result = await chrome.storage.local.get(['user_teams']);
    cachedUserTeams =
      (result.user_teams as StoredUserTeam[] | undefined) || [];
    return cachedUserTeams;
  } catch (error) {
    console.error('[Fantasy Assistant] Error getting user teams:', error);
    return [];
  }
}

/**
 * Get the user's roster URL from stored user_teams data
 * Returns the first team's roster URL, or null if no teams are stored
 */
export async function getUserRosterUrl(): Promise<string | null> {
  const userTeams = await getUserTeams();
  if (userTeams.length > 0) {
    return userTeams[0].roster_url;
  }
  return null;
}

/**
 * Look up the Yahoo league ID from stored user_teams by database league_id
 */
export function getYahooLeagueIdFromCache(leagueId: string): string | null {
  if (!cachedUserTeams) return null;
  const team = cachedUserTeams.find((t) => t.league_id === leagueId);
  return team?.yahoo_league_id || null;
}

