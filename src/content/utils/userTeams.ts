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
    cachedUserTeams = (result.user_teams as StoredUserTeam[] | undefined) || [];
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

/**
 * Extract the Yahoo league ID from a Yahoo Fantasy URL (/f1/{leagueId}/...)
 */
export function getYahooLeagueIdFromUrl(
  url: string = window.location.href
): string | null {
  const match = url.match(/\/f1\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * Resolve our league ID for the league page currently being viewed.
 *
 * Yahoo's page URLs carry only the numeric league ID, so map it through the
 * stored user teams. Returns null when the league has not been synced yet, in
 * which case we have nothing to show for it.
 */
export function resolveCurrentLeagueId(
  userTeams: StoredUserTeam[]
): string | null {
  const yahooLeagueId = getYahooLeagueIdFromUrl();
  if (!yahooLeagueId) return null;

  const team = userTeams.find((t) => t.yahoo_league_id === yahooLeagueId);
  return team?.league_id || null;
}
