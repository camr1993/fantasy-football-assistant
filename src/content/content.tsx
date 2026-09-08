import type { InitializationProgress, StoredUserTeam } from './types';
import {
  injectRecommendations,
  updateInitializationBanner,
  checkAndShowInitializationBanner,
} from './domInjection';
import { resolveCurrentLeagueId } from './utils/userTeams';

/**
 * Initialize the content script
 * @param forceRefresh - If true, clean up existing icons before re-injecting
 */
async function init(forceRefresh = false) {
  console.log('[Fantasy Assistant] Content script initializing...', {
    forceRefresh,
  });

  // Request tips data from background script
  const response = await chrome.runtime.sendMessage({ type: 'GET_TIPS' });

  if (!response?.playerRecommendations) {
    console.log('[Fantasy Assistant] No recommendations available yet');
    return;
  }

  // Recommendations are keyed by league, so figure out which league's page
  // this is before injecting anything
  const leagueId = resolveCurrentLeagueId(
    (response.userTeams as StoredUserTeam[]) || []
  );

  if (!leagueId) {
    console.log(
      '[Fantasy Assistant] Current league is not synced yet, nothing to inject'
    );
    return;
  }

  console.log(
    '[Fantasy Assistant] Received player recommendations for league',
    leagueId,
    Object.keys(response.playerRecommendations[leagueId] || {}).length
  );

  injectRecommendations(response.playerRecommendations, leagueId, forceRefresh);
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'TIPS_READY') {
    console.log('[Fantasy Assistant] Tips ready notification received');
    init(true); // Force refresh to ensure fresh tips are displayed
  }

  if (message.type === 'TIPS_UPDATED') {
    console.log(
      '[Fantasy Assistant] Tips updated notification received, re-injecting...'
    );
    init(true); // Force refresh to update existing icons
  }

  if (message.type === 'INITIALIZATION_PROGRESS') {
    console.log(
      '[Fantasy Assistant] Initialization progress update:',
      message.progress
    );
    updateInitializationBanner(message.progress as InitializationProgress);
  }

  if (message.type === 'INITIALIZATION_COMPLETE') {
    console.log('[Fantasy Assistant] Initialization complete');
    updateInitializationBanner({
      status: 'ready',
      percentage: 100,
      currentStep: 'All data ready!',
    });
    // Re-init to fetch and display tips
    init(true);
  }
});

// Run on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    init();
    checkAndShowInitializationBanner();
  });
} else {
  init();
  checkAndShowInitializationBanner();
}

// Re-inject when page content changes (for SPA navigation)
const observer = new MutationObserver((mutations) => {
  // Check if any mutations involve player elements being added
  const hasNewPlayers = mutations.some((mutation) =>
    Array.from(mutation.addedNodes).some(
      (node) =>
        node instanceof HTMLElement &&
        (node.getAttribute('aria-label')?.includes('Open player notes for') ||
          node.querySelector?.('[aria-label*="Open player notes for"]'))
    )
  );

  if (hasNewPlayers) {
    console.log(
      '[Fantasy Assistant] New player elements detected, re-injecting...'
    );
    // Debounce the re-injection
    setTimeout(async () => {
      const response = await chrome.runtime.sendMessage({ type: 'GET_TIPS' });
      if (!response?.playerRecommendations) return;

      const leagueId = resolveCurrentLeagueId(
        (response.userTeams as StoredUserTeam[]) || []
      );
      if (!leagueId) return;

      injectRecommendations(response.playerRecommendations, leagueId);
    }, 500);
  }
});

// Start observing
observer.observe(document.body, {
  childList: true,
  subtree: true,
});
