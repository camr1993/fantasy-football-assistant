import { apiClient } from '../../api/client';
import {
  fetchAndStoreTips,
  notifyContentScriptTipsUpdated,
} from './tipsService';

/**
 * Handle roster sync when user navigates to a Yahoo Fantasy page
 */
export async function handlePageLoad(
  tabId: number,
  url: string
): Promise<void> {
  // Try to extract league and team IDs from URL
  // URL format: /f1/{leagueId}/{teamId}/...
  const urlMatch = url.match(/\/f1\/(\d+)\/(\d+)/);

  if (urlMatch) {
    const [, yahooLeagueId, yahooTeamId] = urlMatch;
    console.log(
      `Page loaded/refreshed, syncing roster for league ${yahooLeagueId}, team ${yahooTeamId}...`
    );

    // Sync roster first, then fetch tips
    const syncResult = await apiClient.syncTeamRosterImmediate(
      yahooLeagueId,
      yahooTeamId
    );

    if (syncResult.success) {
      console.log('Roster sync completed, now fetching tips...');
    } else {
      console.error('Roster sync failed:', syncResult.error);
    }
  } else {
    console.log(
      'Could not extract league/team IDs from URL, skipping roster sync'
    );
  }

  // Fetch fresh tips (whether roster sync succeeded or not)
  await fetchAndStoreTips();

  // Notify the content script that it can inject recommendations
  chrome.tabs.sendMessage(tabId, { type: 'TIPS_READY' }).catch(() => {
    // Content script might not be ready yet, that's okay
  });
}

/**
 * Handle roster edit detection and trigger immediate sync
 */
export function handleRosterEdit(
  url: string,
  tabId: number
): void {
  // Extract league and team info from URL
  // URL format: /f1/{leagueId}/{teamId}/editroster
  const urlMatch = url.match(/\/f1\/(\d+)\/(\d+)\/editroster/);
  if (urlMatch) {
    const [, yahooLeagueId, yahooTeamId] = urlMatch;
    console.log(
      `Triggering immediate roster sync for league ${yahooLeagueId}, team ${yahooTeamId}`
    );

    // Trigger immediate (synchronous) roster sync after a short delay to allow the POST to complete
    setTimeout(async () => {
      // Step 1: Sync the specific team's roster immediately
      const syncResult = await apiClient.syncTeamRosterImmediate(
        yahooLeagueId,
        yahooTeamId
      );

      if (syncResult.success) {
        console.log('Immediate roster sync completed, now fetching tips...');
        // Step 2: Fetch updated tips after roster is synced
        await fetchAndStoreTips();
      } else {
        console.error(
          'Immediate roster sync failed, tips may be stale:',
          syncResult.error
        );
        // Still try to fetch tips even if sync failed
        await fetchAndStoreTips();
      }

      // Step 3: Notify the content script to re-inject recommendations
      notifyContentScriptTipsUpdated(tabId);
    }, 2000);
  }
}

/**
 * Trigger periodic roster sync
 */
export async function triggerPeriodicSync(): Promise<void> {
  console.log('Periodic roster sync triggered');
  await apiClient.triggerPeriodicRosterSync();
}

