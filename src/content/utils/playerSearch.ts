/**
 * Generate a Yahoo Fantasy player search URL
 * @param yahooLeagueId - The numeric Yahoo league ID (e.g., "869919")
 * @param playerName - The player's name to search for
 */
export function getPlayerSearchUrl(
  yahooLeagueId: string,
  playerName: string
): string {
  const encodedName = encodeURIComponent(playerName);
  return `https://football.fantasysports.yahoo.com/f1/${yahooLeagueId}/playersearch?&search=${encodedName}`;
}

