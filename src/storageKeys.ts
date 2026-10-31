/**
 * chrome.storage.local keys holding data that belongs to a signed-in session.
 *
 * These are cleared together on sign-out. Leaving any behind leaves the page
 * in a half-signed-in state - user_teams and rostered_players in particular
 * are enough on their own to make the content script resolve a league, decide
 * every player is on the user's roster, and draw an all-clear check on each
 * of them, because "no recommendations" then looks like "nothing to change".
 */
export const SESSION_STORAGE_KEYS = [
  'tips_data',
  'player_recommendations',
  'user_teams',
  'rostered_players',
  'tips_timestamp',
  'tips_loading',
  'lastPeriodicSync',
  'oauth_nonce',
  'oauth_timestamp',
  'initialization_progress',
  'yahoo_reauth_required',
] as const;

/** Remove every signed-in session key */
export async function clearSessionStorage(): Promise<void> {
  await chrome.storage.local.remove([...SESSION_STORAGE_KEYS]);
}
