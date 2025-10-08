chrome.runtime.onInstalled.addListener(() => {
  console.log('Fantasy Assistant installed!');

  // Set up periodic roster sync (every 30 minutes)
  chrome.alarms.create('roster-sync', { periodInMinutes: 30 });
});

// Listen for tab updates to detect when user navigates to Yahoo Fantasy Football
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
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
        const [, leagueId, teamId] = urlMatch;
        console.log('Triggering roster sync for all user teams');

        // Trigger roster sync after a short delay to allow the POST to complete
        setTimeout(() => {
          triggerRosterSync();
        }, 2000);
      }
    }
  },
  { urls: ['https://football.fantasysports.yahoo.com/*'] },
  ['requestBody']
);

// Handle periodic sync alarms
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'roster-sync') {
    console.log('Periodic roster sync triggered');
    triggerRosterSync();
  }
});

// Function to trigger roster sync for all user teams
async function triggerRosterSync() {
  try {
    // Get user data from storage
    const result = await chrome.storage.local.get([
      'yahoo_user',
      'yahoo_access_token',
    ]);
    const user = result.yahoo_user;
    const accessToken = result.yahoo_access_token;

    if (!user || !accessToken) {
      console.log('No user or access token found, skipping roster sync');
      return;
    }

    // Call the sync-league-data function with roster-only sync
    const response = await fetch(
      'https://your-supabase-url.supabase.co/functions/v1/sync-league-data',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          userId: user.id,
          yahooAccessToken: accessToken,
          syncType: 'roster',
        }),
      }
    );

    if (response.ok) {
      console.log('Roster sync completed successfully');
    } else {
      console.error('Roster sync failed:', await response.text());
    }
  } catch (error) {
    console.error('Error triggering roster sync:', error);
  }
}
