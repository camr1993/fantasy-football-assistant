// Background script for Chrome extension
import { apiClient } from '../api/client';

chrome.runtime.onInstalled.addListener(() => {
  console.log('Fantasy Assistant installed!');

  // Set up periodic roster sync (every 30 minutes)
  chrome.alarms.create('roster-sync', { periodInMinutes: 30 });

  // For testing: create a test alarm that fires in 10 seconds
  chrome.alarms.create('test-roster-sync', { delayInMinutes: 0.17 }); // ~10 seconds
  console.log('Test alarm created - will fire in ~10 seconds');
});

// Listen for tab updates to detect when user navigates to Yahoo Fantasy Football
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  // Only proceed if the tab is complete and has a URL
  if (changeInfo.status === 'complete' && tab.url) {
    // Check if the URL starts with the Yahoo Fantasy Football domain
    if (tab.url.startsWith('https://football.fantasysports.yahoo.com/')) {
      console.log('User is on Yahoo Fantasy Football:', tab.url);
    }
  }
});

// Monitor network requests to detect roster updates
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    // Check if this is a POST request to the editroster endpoint
    if (details.method === 'POST' && details.url.includes('/editroster')) {
      console.log('Roster update detected:', details.url);

      // Extract league and team info from URL for logging
      const urlMatch = details.url.match(/\/f1\/(\d+)\/(\d+)\/editroster/);
      if (urlMatch) {
        const [, _leagueId, _teamId] = urlMatch;
        console.log('Triggering roster sync for all user teams');

        // Trigger roster sync after a short delay to allow the POST to complete
        setTimeout(async () => {
          await apiClient.triggerRosterSync('post-triggered');
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
    await apiClient.triggerRosterSync('periodic');
  } else if (alarm.name === 'test-roster-sync') {
    console.log('TEST: Roster sync alarm triggered!');
    await apiClient.triggerRosterSync('test');
  }
});
