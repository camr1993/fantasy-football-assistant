import type { InitializationProgress, StoredUserTeam } from './types';
import type { RosteredPlayerRef } from '../types/tips';
import {
  injectRecommendations,
  updateInitializationBanner,
  checkAndShowInitializationBanner,
  checkAndShowServiceNotice,
  watchServiceNoticeState,
  cleanupInjectedIcons,
} from './domInjection';
import {
  resolveCurrentLeagueId,
  invalidateUserTeamsCache,
} from './utils/userTeams';

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

  if (!response) {
    console.log('[Fantasy Assistant] No response from background script');
    cleanupInjectedIcons();
    return;
  }

  // No teams means no signed-in session (or none synced yet). Anything
  // already on the page is stale - leaving it up after sign-out showed an
  // all-clear check on every player.
  const hasSession =
    Array.isArray(response.userTeams) && response.userTeams.length > 0;

  if (!hasSession) {
    console.log('[Fantasy Assistant] No signed-in session, clearing icons');
    cleanupInjectedIcons();
    // The banner is driven by messages rather than storage, so a "ready"
    // banner would otherwise sit there after sign-out
    updateInitializationBanner({
      status: 'idle',
      percentage: 0,
      currentStep: '',
    });
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
    cleanupInjectedIcons();
    return;
  }

  console.log(
    '[Fantasy Assistant] Received player recommendations for league',
    leagueId,
    Object.keys(response.playerRecommendations?.[leagueId] || {}).length
  );

  injectRecommendations(
    response.playerRecommendations || {},
    leagueId,
    forceRefresh,
    {
      rosteredPlayerIds: rosteredIdsForLeague(
        response.rosteredPlayers,
        leagueId
      ),
      isLoading: !!response.isLoadingTips,
    }
  );
}

/** Yahoo player IDs on the user's roster in the league being viewed */
function rosteredIdsForLeague(
  rostered: RosteredPlayerRef[] | undefined,
  leagueId: string
): Set<string> {
  return new Set(
    (rostered || [])
      .filter((r) => r.league_id === leagueId)
      .map((r) => r.yahoo_player_id)
  );
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
    checkAndShowServiceNotice();
  });
} else {
  init();
  checkAndShowInitializationBanner();
  checkAndShowServiceNotice();
}

// React to the re-auth flag changing while the page is open
watchServiceNoticeState();

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

      injectRecommendations(
        response.playerRecommendations || {},
        leagueId,
        false,
        {
          rosteredPlayerIds: rosteredIdsForLeague(
            response.rosteredPlayers,
            leagueId
          ),
          isLoading: !!response.isLoadingTips,
        }
      );
    }, 500);
  }
});

// Start observing
observer.observe(document.body, {
  childList: true,
  subtree: true,
});

// Re-render icons when a tips refresh starts or finishes, so the spinner
// appears and clears without the user reloading the page
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;

  // user_teams arriving is what turns an unusable page into a usable one on
  // first sign-in: until it exists we cannot tell which league is on screen,
  // so init bails out early and nothing is drawn
  if (changes.user_teams) {
    invalidateUserTeamsCache();
  }

  if (
    changes.user_teams ||
    changes.tips_loading ||
    changes.player_recommendations ||
    changes.rostered_players
  ) {
    init(true);
  }
});
