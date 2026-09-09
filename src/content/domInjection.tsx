import ReactDOM from 'react-dom/client';
import type { PlayerRecommendationsMap } from '../types/tips';
import type { InitializationProgress } from './types';
import { getUserRosterUrl } from './utils/userTeams';
import { getOnboardingState, updateOnboardingState } from './utils/onboarding';
import { InitializationBanner } from './components/InitializationBanner';
import { ServiceNoticeBanner } from './components/ServiceNoticeBanner';
import { RecommendationIcon } from './components/RecommendationIcon';
import { OnboardingTooltip } from './components/OnboardingTooltip';

// Store mounted React roots so we can clean them up
const mountedRoots: Map<string, ReactDOM.Root> = new Map();

// Onboarding tooltip management
let onboardingTooltipRoot: ReactDOM.Root | null = null;
const ONBOARDING_CONTAINER_ID = 'fantasy-assistant-onboarding-tooltip';

/**
 * Clean up all injected recommendation icons
 */
export function cleanupInjectedIcons(): void {
  mountedRoots.forEach((root, containerId) => {
    root.unmount();
    const container = document.getElementById(containerId);
    if (container) {
      container.remove();
    }
  });
  mountedRoots.clear();
  console.log('[Fantasy Assistant] Cleaned up existing recommendation icons');
}

/**
 * Show the onboarding tooltip pointing to a target icon element
 */
function showOnboardingTooltip(targetElement: HTMLElement): void {
  // Don't show if already showing
  if (document.getElementById(ONBOARDING_CONTAINER_ID)) return;

  const container = document.createElement('div');
  container.id = ONBOARDING_CONTAINER_ID;
  document.body.appendChild(container);

  onboardingTooltipRoot = ReactDOM.createRoot(container);
  onboardingTooltipRoot.render(
    <OnboardingTooltip
      targetElement={targetElement}
      onDismiss={dismissOnboardingTooltip}
    />
  );

  console.log('[Fantasy Assistant] Showing onboarding tooltip');
}

/**
 * Dismiss the onboarding tooltip and update state
 */
async function dismissOnboardingTooltip(): Promise<void> {
  if (onboardingTooltipRoot) {
    onboardingTooltipRoot.unmount();
    onboardingTooltipRoot = null;
  }

  const container = document.getElementById(ONBOARDING_CONTAINER_ID);
  if (container) {
    container.remove();
  }

  // Mark as seen in storage
  await updateOnboardingState({ hasSeenIconTooltip: true });
  console.log('[Fantasy Assistant] Onboarding tooltip dismissed');
}

/**
 * Inject recommendation icons next to players on the page
 */
export async function injectRecommendations(
  playerRecommendations: PlayerRecommendationsMap,
  leagueId: string,
  forceRefresh = false
): Promise<void> {
  // If force refresh, clean up existing icons first
  if (forceRefresh && mountedRoots.size > 0) {
    cleanupInjectedIcons();
  }

  // Only show recommendations belonging to the league page being viewed
  const leagueRecommendations = playerRecommendations[leagueId];

  if (!leagueRecommendations) {
    console.log(
      `[Fantasy Assistant] No recommendations for league ${leagueId}`
    );
    return;
  }
  // Find all player note elements on the page by aria-label pattern
  const playerNoteElements = document.querySelectorAll(
    '[aria-label*="Open player notes for"]'
  );

  console.log(
    `[Fantasy Assistant] Found ${playerNoteElements.length} player elements on page`
  );

  let injectedCount = 0;
  let firstInjectedContainer: HTMLElement | null = null;

  playerNoteElements.forEach((element) => {
    // Extract player ID from the element
    const playerId =
      element.getAttribute('data-ys-playerid') ||
      element.id?.replace('playernote-', '');

    if (!playerId) return;

    // Check if we have recommendations for this player
    const recommendations = leagueRecommendations[playerId];
    if (!recommendations) return;

    // Check if we've already injected for this player
    const containerId = `fantasy-assistant-${playerId}`;
    if (document.getElementById(containerId)) return;

    const playerName =
      recommendations.startBench?.name ||
      recommendations.waiverUpgrades?.[0]?.rostered_player_name ||
      `Player ${playerId}`;

    // Create container for our React component
    const container = document.createElement('span');
    container.id = containerId;
    container.style.display = 'inline-block';
    container.style.verticalAlign = 'middle';

    // Insert after the player note element
    element.insertAdjacentElement('afterend', container);

    // Mount React component
    const root = ReactDOM.createRoot(container);
    root.render(
      <RecommendationIcon
        recommendations={recommendations}
        playerName={playerName}
      />
    );

    mountedRoots.set(containerId, root);

    // Track the first injected container for onboarding tooltip
    if (injectedCount === 0) {
      firstInjectedContainer = container;
    }

    injectedCount++;
  });

  console.log(
    `[Fantasy Assistant] Injected ${injectedCount} recommendation icons`
  );

  // Show onboarding tooltip if this is the first time and we injected icons
  if (injectedCount > 0 && firstInjectedContainer) {
    const onboardingState = await getOnboardingState();
    if (!onboardingState.hasSeenIconTooltip) {
      // Small delay to ensure the icon is fully rendered
      setTimeout(() => {
        const iconButton = firstInjectedContainer?.querySelector('button');
        if (iconButton) {
          showOnboardingTooltip(iconButton as HTMLElement);
        }
      }, 300);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Initialization Banner Management
// ─────────────────────────────────────────────────────────────────────────────

let bannerRoot: ReactDOM.Root | null = null;
let lastProgress: InitializationProgress | null = null;
const BANNER_CONTAINER_ID = 'fantasy-assistant-init-banner';

export async function updateInitializationBanner(
  progress: InitializationProgress
): Promise<void> {
  let container = document.getElementById(BANNER_CONTAINER_ID);

  // If dismissing or idle, remove the banner
  if (progress.status === 'idle') {
    if (container && bannerRoot) {
      bannerRoot.unmount();
      container.remove();
      bannerRoot = null;
    }
    return;
  }

  // Create container if it doesn't exist
  if (!container) {
    container = document.createElement('div');
    container.id = BANNER_CONTAINER_ID;
    document.body.prepend(container);
    bannerRoot = ReactDOM.createRoot(container);
  }

  // Render the banner
  if (bannerRoot) {
    lastProgress = progress;
    const rosterUrl = await getUserRosterUrl();
    bannerRoot.render(
      <InitializationBanner
        progress={progress}
        rosterUrl={rosterUrl}
        topOffset={getServiceNoticeHeight()}
        onDismiss={() => {
          updateInitializationBanner({ ...progress, status: 'idle' });
          // Clear from storage
          chrome.storage.local.remove(['initialization_progress']);
        }}
      />
    );
  }
}

/**
 * Check for ongoing initialization on page load
 */
export async function checkAndShowInitializationBanner(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(['initialization_progress']);
    if (
      result.initialization_progress &&
      result.initialization_progress.status !== 'idle'
    ) {
      updateInitializationBanner(result.initialization_progress);
    }
  } catch (error) {
    console.error(
      '[Fantasy Assistant] Error checking initialization status:',
      error
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Service Notice Banner Management
// ─────────────────────────────────────────────────────────────────────────────

let noticeRoot: ReactDOM.Root | null = null;
const NOTICE_CONTAINER_ID = 'fantasy-assistant-service-notice';

// Bump the suffix to show a new notice to users who dismissed a previous one
const NOTICE_DISMISSED_KEY = 'service_notice_dismissed_yahoo_api_2026';

/**
 * Height of the service notice, so the initialization banner can sit below it
 * rather than on top of it. Both are position: fixed at the top of the page.
 */
function getServiceNoticeHeight(): number {
  return document.getElementById(NOTICE_CONTAINER_ID)?.offsetHeight ?? 0;
}

function removeServiceNotice(): void {
  const container = document.getElementById(NOTICE_CONTAINER_ID);
  if (container && noticeRoot) {
    noticeRoot.unmount();
    container.remove();
    noticeRoot = null;
  }

  // The initialization banner no longer needs to clear the notice
  if (bannerRoot && lastProgress) {
    updateInitializationBanner(lastProgress);
  }
}

/**
 * Show the service notice, but only to signed-in users who have not already
 * dismissed it. Dismissal is stored per browser profile and is permanent.
 */
export async function checkAndShowServiceNotice(): Promise<void> {
  try {
    if (document.getElementById(NOTICE_CONTAINER_ID)) return;

    const stored = await chrome.storage.local.get([NOTICE_DISMISSED_KEY]);
    if (stored[NOTICE_DISMISSED_KEY]) return;

    const auth = await chrome.runtime.sendMessage({ type: 'GET_AUTH_STATE' });
    if (!auth?.isLoggedIn) return;

    const container = document.createElement('div');
    container.id = NOTICE_CONTAINER_ID;
    document.body.prepend(container);

    noticeRoot = ReactDOM.createRoot(container);
    noticeRoot.render(
      <ServiceNoticeBanner
        onDismiss={() => {
          chrome.storage.local.set({ [NOTICE_DISMISSED_KEY]: true });
          removeServiceNotice();
        }}
      />
    );
  } catch (error) {
    console.error('[Fantasy Assistant] Error showing service notice:', error);
  }
}
