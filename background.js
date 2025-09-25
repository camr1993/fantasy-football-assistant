chrome.runtime.onInstalled.addListener(() => {
  console.log('Fantasy Assistant installed!');
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
