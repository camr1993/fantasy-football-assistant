// Background script for Chrome extension
import { apiClient } from '../api/client';
import type { TipsResponse, PlayerRecommendationsMap } from '../types/tips';

chrome.runtime.onInstalled.addListener(() => {
  console.log('Fantasy Assistant installed!');

  // Set up periodic roster sync (every 120 minutes)
  chrome.alarms.create('roster-sync', { periodInMinutes: 120 });

  // Note: init-status-poll alarm is created dynamically only when initialization starts
  // (see startInitializationPolling function)
});

// Listen for tab updates to detect when user navigates to Yahoo Fantasy Football
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only proceed if the tab is complete and has a URL
  if (changeInfo.status === 'complete' && tab.url) {
    // Check if the URL starts with the Yahoo Fantasy Football domain
    if (tab.url.startsWith('https://football.fantasysports.yahoo.com/')) {
      console.log('User is on Yahoo Fantasy Football:', tab.url);

      // Try to extract league and team IDs from URL
      // URL format: /f1/{leagueId}/{teamId}/...
      const urlMatch = tab.url.match(/\/f1\/(\d+)\/(\d+)/);

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
  }
});

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_TIPS') {
    chrome.storage.local
      .get(['tips_data', 'player_recommendations'])
      .then((result) => {
        sendResponse({
          tips: result.tips_data || null,
          playerRecommendations: result.player_recommendations || {},
        });
      });
    return true; // Keep the message channel open for async response
  }

  if (message.type === 'REFRESH_TIPS') {
    fetchAndStoreTips().then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'START_INITIALIZATION_POLLING') {
    startInitializationPolling();
    sendResponse({ success: true });
    return false;
  }

  if (message.type === 'STOP_INITIALIZATION_POLLING') {
    stopInitializationPolling();
    sendResponse({ success: true });
    return false;
  }
});

/**
 * Notify the content script that tips have been updated
 */
function notifyContentScriptTipsUpdated(tabId: number): void {
  chrome.tabs.sendMessage(tabId, { type: 'TIPS_UPDATED' }).catch(() => {
    // Content script might not be ready, that's okay
    console.log('Could not notify content script of tips update');
  });
}

/**
 * Fetch tips from the API and store in chrome.storage
 */
async function fetchAndStoreTips(): Promise<void> {
  try {
    const result = await apiClient.getTips();

    if (result.success && result.data) {
      const tips = result.data as TipsResponse;

      // Build a map of player recommendations indexed by Yahoo player ID
      const playerRecommendations = buildPlayerRecommendationsMap(tips);

      // Store both raw tips and the processed map
      await chrome.storage.local.set({
        tips_data: tips,
        player_recommendations: playerRecommendations,
        tips_timestamp: Date.now(),
      });

      console.log('Tips data stored successfully', {
        startBenchCount: tips.start_bench_recommendations?.length || 0,
        waiverRecommendationsCount:
          tips.waiver_wire_recommendations?.length || 0,
        playerMapSize: Object.keys(playerRecommendations).length,
      });
    } else {
      console.error('Failed to fetch tips:', result.error);
    }
  } catch (error) {
    console.error('Error fetching tips:', error);
  }
}

/**
 * Build a map of player recommendations indexed by Yahoo player ID (numeric part only)
 * Yahoo player IDs are stored as "461.p.40042" but the DOM uses just "40042"
 */
function buildPlayerRecommendationsMap(
  tips: TipsResponse
): PlayerRecommendationsMap {
  const map: PlayerRecommendationsMap = {};

  // Index start/bench recommendations by yahoo_player_id
  if (tips.start_bench_recommendations) {
    for (const rec of tips.start_bench_recommendations) {
      const yahooId = rec.yahoo_player_id;
      if (!yahooId) continue;

      if (!map[yahooId]) {
        map[yahooId] = {};
      }
      map[yahooId].startBench = rec;
    }
  }

  // Index waiver recommendations by the rostered player's yahoo_player_id
  // (since we want to show "upgrade available" on the rostered player)
  if (tips.waiver_wire_recommendations) {
    for (const rec of tips.waiver_wire_recommendations) {
      const yahooId = rec.rostered_yahoo_player_id;
      if (!yahooId) continue;

      if (!map[yahooId]) {
        map[yahooId] = {};
      }
      if (!map[yahooId].waiverUpgrades) {
        map[yahooId].waiverUpgrades = [];
      }
      map[yahooId].waiverUpgrades!.push(rec);
    }
  }

  return map;
}

// Monitor network requests to detect roster updates
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    // Check if this is a POST request to the editroster endpoint
    if (details.method === 'POST' && details.url.includes('/editroster')) {
      console.log('Roster update detected:', details.url);

      // Extract league and team info from URL
      // URL format: /f1/{leagueId}/{teamId}/editroster
      const urlMatch = details.url.match(/\/f1\/(\d+)\/(\d+)\/editroster/);
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
            console.log(
              'Immediate roster sync completed, now fetching tips...'
            );
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
          notifyContentScriptTipsUpdated(details.tabId);
        }, 2000);
      }
    }
    return undefined;
  },
  { urls: ['https://football.fantasysports.yahoo.com/*'] },
  ['requestBody']
);

// Handle periodic sync alarms
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'roster-sync') {
    console.log('Periodic roster sync triggered');
    // Periodic roster syncs are done synchronously in the edge function
    await apiClient.triggerPeriodicRosterSync();
  }

  if (alarm.name === 'init-status-poll') {
    await pollInitializationStatus();
  }
});

/**
 * Start polling for initialization status
 * Creates an alarm that fires every 1 minute (Chrome's minimum interval)
 */
export function startInitializationPolling(): void {
  console.log('Starting initialization status polling');
  chrome.alarms.create('init-status-poll', { periodInMinutes: 0.5 });
}

/**
 * Stop polling for initialization status
 */
export function stopInitializationPolling(): void {
  console.log('Stopping initialization status polling');
  chrome.alarms.clear('init-status-poll');
}

/**
 * Poll for initialization status and signal completion/error
 * Progress bar animation is handled client-side based on estimated time
 */
async function pollInitializationStatus(): Promise<void> {
  try {
    // First check if we should even be polling
    const stored = await chrome.storage.local.get(['initialization_progress']);
    if (
      !stored.initialization_progress ||
      stored.initialization_progress.status === 'ready' ||
      stored.initialization_progress.status === 'idle'
    ) {
      // No active initialization, stop polling
      stopInitializationPolling();
      return;
    }

    const result = await apiClient.checkInitializationStatus();

    if (result.success && result.data) {
      const { all_ready, leagues } = result.data;
      const hasError = leagues.some((l) => l.status === 'error');

      if (all_ready || leagues.length === 0) {
        // Initialization complete - stop polling
        stopInitializationPolling();

        // Update storage with ready status (popup will set percentage to 100%)
        const progress = {
          ...stored.initialization_progress,
          status: 'ready' as const,
          percentage: 100,
          currentStep: 'All data ready!',
        };

        await chrome.storage.local.set({ initialization_progress: progress });

        // Notify content scripts that initialization is complete
        const tabs = await chrome.tabs.query({
          url: 'https://football.fantasysports.yahoo.com/*',
        });
        for (const tab of tabs) {
          if (tab.id) {
            chrome.tabs
              .sendMessage(tab.id, { type: 'INITIALIZATION_COMPLETE' })
              .catch(() => {
                // Content script might not be ready
              });
          }
        }

        // Fetch tips now that data is ready
        await fetchAndStoreTips();

        console.log('Initialization complete, tips fetched');
      } else if (hasError) {
        // Error occurred - stop polling
        stopInitializationPolling();

        const errorMessage = leagues.find(
          (l) => l.error_message
        )?.error_message;

        const progress = {
          ...stored.initialization_progress,
          status: 'error' as const,
          currentStep: 'Initialization failed',
          errorMessage,
        };

        await chrome.storage.local.set({ initialization_progress: progress });

        // Notify content scripts of error
        const tabs = await chrome.tabs.query({
          url: 'https://football.fantasysports.yahoo.com/*',
        });
        for (const tab of tabs) {
          if (tab.id) {
            chrome.tabs
              .sendMessage(tab.id, {
                type: 'INITIALIZATION_PROGRESS',
                progress,
              })
              .catch(() => {
                // Content script might not be ready
              });
          }
        }
      }
      // If still initializing without error, do nothing - let the time-based progress continue
    }
  } catch (error) {
    console.error('Error polling initialization status:', error);
  }
}
