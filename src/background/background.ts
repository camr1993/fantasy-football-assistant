// Background script for Chrome extension
import { supabase } from '../supabaseClient';
import { fetchAndStoreTips } from './services/tipsService';
import {
  startInitializationPolling,
  stopInitializationPolling,
  pollInitializationStatus,
} from './services/initializationService';
import {
  handlePageLoad,
  handleRosterEdit,
  triggerPeriodicSync,
} from './services/rosterSyncService';

const ROSTER_SYNC_ALARM = 'roster-sync';
const ROSTER_SYNC_PERIOD_MINUTES = 120;

/**
 * Ensure the periodic sync alarm exists.
 *
 * This alarm is what discovers a user's new leagues each season, so it has to
 * survive more than a fresh sign-in. Creating it only on SIGNED_IN meant that a
 * user who stayed signed in through the offseason never had it re-created after
 * a browser restart, and their new Yahoo league was never picked up.
 */
async function ensureRosterSyncAlarm(): Promise<void> {
  const existing = await chrome.alarms.get(ROSTER_SYNC_ALARM);
  if (existing) return;

  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    console.log('No session, not creating roster sync alarm');
    return;
  }

  console.log('Creating periodic roster sync alarm');
  chrome.alarms.create(ROSTER_SYNC_ALARM, {
    periodInMinutes: ROSTER_SYNC_PERIOD_MINUTES,
  });
}

chrome.runtime.onInstalled.addListener(() => {
  void ensureRosterSyncAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  void ensureRosterSyncAlarm();
});

// Listen for auth state changes in the background
supabase.auth.onAuthStateChange((event, _session) => {
  console.log('Background: Auth state changed:', event);

  if (event === 'SIGNED_OUT') {
    console.log('User signed out, stopping background tasks');
    // Clear any pending alarms
    chrome.alarms.clear(ROSTER_SYNC_ALARM);
    chrome.alarms.clear('init-status-poll');
  } else if (event === 'TOKEN_REFRESHED') {
    console.log('Background: Session token refreshed');
  } else if (event === 'SIGNED_IN') {
    console.log('Background: User signed in, starting periodic sync alarm');
    // Re-create the periodic sync alarm
    chrome.alarms.create(ROSTER_SYNC_ALARM, {
      periodInMinutes: ROSTER_SYNC_PERIOD_MINUTES,
    });
  }
});

// Listen for tab updates to detect when user navigates to Yahoo Fantasy Football
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only proceed if the tab is complete and has a URL
  if (changeInfo.status === 'complete' && tab.url) {
    // Check if the URL starts with the Yahoo Fantasy Football domain
    if (tab.url.startsWith('https://football.fantasysports.yahoo.com/')) {
      console.log('User is on Yahoo Fantasy Football:', tab.url);
      await handlePageLoad(tabId, tab.url);
    }
  }
});

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_TIPS') {
    chrome.storage.local
      .get(['tips_data', 'player_recommendations', 'user_teams'])
      .then((result) => {
        sendResponse({
          tips: result.tips_data || null,
          playerRecommendations: result.player_recommendations || {},
          userTeams: result.user_teams || [],
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

// Monitor network requests to detect roster updates
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    // Check if this is a POST request to the editroster endpoint
    if (details.method === 'POST' && details.url.includes('/editroster')) {
      console.log('Roster update detected:', details.url);
      handleRosterEdit(details.url, details.tabId);
    }
    return undefined;
  },
  { urls: ['https://football.fantasysports.yahoo.com/*'] },
  ['requestBody']
);

// Handle periodic sync alarms
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ROSTER_SYNC_ALARM) {
    await triggerPeriodicSync();
  }

  if (alarm.name === 'init-status-poll') {
    await pollInitializationStatus();
  }
});
