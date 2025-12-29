import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import type {
  PlayerRecommendationsMap,
  PlayerRecommendations,
} from '../types/tips';

interface InitializationProgress {
  status: 'idle' | 'initializing' | 'ready' | 'error';
  percentage: number;
  currentStep: string;
  errorMessage?: string;
  startTime?: number;
  estimatedDuration?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Initialization Banner Component
// ─────────────────────────────────────────────────────────────────────────────

interface InitializationBannerProps {
  progress: InitializationProgress;
  rosterUrl: string | null;
  onDismiss: () => void;
}

/**
 * Get the user's roster URL from stored user_teams data
 * Returns the first team's roster URL, or null if no teams are stored
 */
async function getUserRosterUrl(): Promise<string | null> {
  try {
    const result = await chrome.storage.local.get(['user_teams']);
    const userTeams = result.user_teams as
      | Array<{ roster_url: string }>
      | undefined;
    if (userTeams && userTeams.length > 0) {
      return userTeams[0].roster_url;
    }
  } catch (error) {
    console.error('[Fantasy Assistant] Error getting user teams:', error);
  }
  return null;
}

function InitializationBanner({
  progress,
  rosterUrl,
  onDismiss,
}: InitializationBannerProps) {
  const percentage = Math.round(progress.percentage || 0);

  if (progress.status === 'idle') return null;

  return (
    <div style={bannerStyles.container}>
      <style>
        {`
          @keyframes fantasy-edge-spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
      <div style={bannerStyles.content}>
        {progress.status === 'initializing' && (
          <>
            <div style={bannerStyles.spinnerContainer}>
              <div style={bannerStyles.spinner} />
            </div>
            <div style={bannerStyles.textContainer}>
              <span style={bannerStyles.title}>
                FantasyEdge is setting up your league data...
              </span>
              <span style={bannerStyles.step}>{progress.currentStep}</span>
            </div>
            <div style={bannerStyles.progressContainer}>
              <div style={bannerStyles.progressBar}>
                <div
                  style={{
                    ...bannerStyles.progressFill,
                    width: `${percentage}%`,
                  }}
                />
              </div>
              <span style={bannerStyles.progressText}>{percentage}%</span>
            </div>
          </>
        )}

        {progress.status === 'ready' && (
          <>
            <span style={bannerStyles.successIcon}>✓</span>
            <span style={bannerStyles.successText}>
              FantasyEdge is ready! Refresh your{' '}
              {rosterUrl ? (
                <a href={rosterUrl} style={bannerStyles.rosterLink}>
                  roster page
                </a>
              ) : (
                'roster page'
              )}{' '}
              to see recommendations.
            </span>
            <button style={bannerStyles.dismissButton} onClick={onDismiss}>
              ×
            </button>
          </>
        )}

        {progress.status === 'error' && (
          <>
            <span style={bannerStyles.errorIcon}>⚠</span>
            <span style={bannerStyles.errorText}>
              FantasyEdge setup encountered an error. Please try again later.
            </span>
            <button style={bannerStyles.dismissButton} onClick={onDismiss}>
              ×
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const bannerStyles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#7c3aed',
    color: 'white',
    zIndex: 999998,
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
  },
  content: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '12px 20px',
    maxWidth: '1200px',
    margin: '0 auto',
    gap: '16px',
  },
  spinnerContainer: {
    flexShrink: 0,
  },
  spinner: {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    border: '2px solid rgba(255, 255, 255, 0.3)',
    borderTopColor: 'white',
    animation: 'fantasy-edge-spin 1s linear infinite',
  },
  textContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  title: {
    fontWeight: 600,
    fontSize: '14px',
  },
  step: {
    fontSize: '12px',
    opacity: 0.9,
  },
  progressContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexShrink: 0,
  },
  progressBar: {
    width: '100px',
    height: '6px',
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: '3px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: 'white',
    borderRadius: '3px',
    transition: 'width 0.3s ease',
  },
  progressText: {
    fontSize: '12px',
    fontWeight: 600,
    minWidth: '35px',
  },
  successIcon: {
    fontSize: '18px',
    fontWeight: 'bold',
  },
  successText: {
    fontSize: '14px',
  },
  rosterLink: {
    color: 'white',
    textDecoration: 'underline',
    fontWeight: 600,
  },
  errorIcon: {
    fontSize: '18px',
  },
  errorText: {
    fontSize: '14px',
  },
  dismissButton: {
    background: 'none',
    border: 'none',
    color: 'white',
    fontSize: '20px',
    cursor: 'pointer',
    padding: '0 4px',
    opacity: 0.8,
    marginLeft: 'auto',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Injury Status Helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get human-readable injury status label
 */
function getInjuryStatusLabel(status: string): string {
  const statusMap: Record<string, string> = {
    Q: 'Questionable',
    D: 'Doubtful',
    O: 'Out',
    IR: 'Injured Reserve',
    'IR-R': 'IR - Designated to Return',
    'PUP-R': 'PUP - Designated to Return',
    SUSP: 'Suspended',
    'NFI-R': 'NFI - Designated to Return',
    GTD: 'Game-Time Decision',
  };
  return statusMap[status] || status;
}

/**
 * Check if injury status warrants a warning note
 */
function shouldShowInjuryWarning(status?: string): boolean {
  if (!status) return false;
  // Show warning for questionable, doubtful, or game-time decision statuses
  return ['Q', 'D', 'GTD'].includes(status);
}

interface InjuryNoteProps {
  status: string;
  playerName: string;
}

function InjuryNote({ status, playerName }: InjuryNoteProps) {
  return (
    <div style={styles.injuryNote}>
      <span style={styles.injuryIcon}>⚠️</span>
      <span>
        <strong>{playerName}</strong> is listed as{' '}
        <strong>{getInjuryStatusLabel(status)}</strong>. Check injury reports
        before making lineup decisions.
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal Component
// ─────────────────────────────────────────────────────────────────────────────

interface RecommendationModalProps {
  recommendations: PlayerRecommendations;
  playerName: string;
  onClose: () => void;
}

function RecommendationModal({
  recommendations,
  playerName,
  onClose,
}: RecommendationModalProps) {
  const { startBench, waiverUpgrades } = recommendations;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h3 style={styles.title}>💡 Recommendations for {playerName}</h3>
          <button style={styles.closeButton} onClick={onClose}>
            ×
          </button>
        </div>

        <div style={styles.content}>
          {/* Start/Bench Recommendation */}
          {startBench && (
            <div style={styles.section}>
              <div
                style={{
                  ...styles.badge,
                  backgroundColor:
                    startBench.recommendation === 'START'
                      ? '#22c55e'
                      : '#ef4444',
                }}
              >
                {startBench.recommendation}
              </div>
              <p style={styles.reason}>{startBench.reason}</p>
              {shouldShowInjuryWarning(startBench.injury_status) && (
                <InjuryNote
                  status={startBench.injury_status!}
                  playerName={startBench.name}
                />
              )}
              <p style={styles.meta}>
                League: {startBench.league_name} • Team: {startBench.team_name}
              </p>
            </div>
          )}

          {/* Waiver Wire Upgrades */}
          {waiverUpgrades && waiverUpgrades.length > 0 && (
            <div style={styles.section}>
              <h4 style={styles.sectionTitle}>🔄 Waiver Wire Upgrades</h4>
              {waiverUpgrades.map((upgrade, index) => (
                <div key={index} style={styles.upgradeCard}>
                  <div style={styles.upgradeHeader}>
                    <span style={styles.addBadge}>ADD</span>
                    <span style={styles.playerName}>
                      {upgrade.waiver_player_name} ({upgrade.waiver_player_team}
                      )
                    </span>
                  </div>
                  <div style={styles.scoreComparison}>
                    <span style={styles.scoreUp}>
                      {upgrade.waiver_weighted_score.toFixed(2)}
                    </span>
                    <span style={styles.vs}>vs</span>
                    <span style={styles.scoreDown}>
                      {upgrade.rostered_weighted_score.toFixed(2)}
                    </span>
                  </div>
                  <p style={styles.reason}>{upgrade.reason}</p>
                  {/* Show injury warnings for players in waiver recommendations */}
                  {shouldShowInjuryWarning(upgrade.waiver_injury_status) && (
                    <InjuryNote
                      status={upgrade.waiver_injury_status!}
                      playerName={upgrade.waiver_player_name}
                    />
                  )}
                  <p style={styles.meta}>
                    League: {upgrade.league_name} • Team: {upgrade.team_name}
                  </p>
                </div>
              ))}
            </div>
          )}

          {!startBench && (!waiverUpgrades || waiverUpgrades.length === 0) && (
            <p style={styles.noRecs}>
              No recommendations available for this player.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Recommendation Icon Component
// ─────────────────────────────────────────────────────────────────────────────

interface RecommendationIconProps {
  recommendations: PlayerRecommendations;
  playerName: string;
}

function RecommendationIcon({
  recommendations,
  playerName,
}: RecommendationIconProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const hasStartBench = !!recommendations.startBench;
  const hasWaiverUpgrade =
    recommendations.waiverUpgrades && recommendations.waiverUpgrades.length > 0;

  // Determine icon and color based on recommendation type
  let icon = '💡';
  let bgColor = '#7c3aed'; // Default purple

  if (hasStartBench) {
    if (recommendations.startBench!.recommendation === 'START') {
      icon = '▲';
      bgColor = '#22c55e'; // Green
    } else {
      icon = '▼';
      bgColor = '#ef4444'; // Red
    }
  } else if (hasWaiverUpgrade) {
    icon = '🔄';
    bgColor = '#f59e0b'; // Orange/amber
  }

  return (
    <>
      <button
        style={{
          ...styles.iconButton,
          backgroundColor: bgColor,
        }}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setIsModalOpen(true);
        }}
        title="View FantasyEdge recommendations"
      >
        {icon}
      </button>

      {isModalOpen && (
        <RecommendationModal
          recommendations={recommendations}
          playerName={playerName}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  iconButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    border: 'none',
    color: 'white',
    fontSize: '10px',
    fontWeight: 'bold',
    cursor: 'pointer',
    marginLeft: '4px',
    verticalAlign: 'middle',
    lineHeight: 1,
    padding: 0,
  },
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999999,
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: '12px',
    maxWidth: '500px',
    width: '90%',
    maxHeight: '80vh',
    overflow: 'auto',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
    cursor: 'default',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid #e5e7eb',
    position: 'sticky',
    top: 0,
    backgroundColor: 'white',
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 600,
    color: '#1f2937',
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '24px',
    cursor: 'pointer',
    color: '#6b7280',
    padding: '0 4px',
  },
  content: {
    padding: '20px',
  },
  section: {
    marginBottom: '20px',
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#374151',
    marginBottom: '12px',
    marginTop: 0,
  },
  badge: {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '9999px',
    color: 'white',
    fontSize: '12px',
    fontWeight: 600,
    marginBottom: '8px',
  },
  reason: {
    fontSize: '14px',
    color: '#4b5563',
    lineHeight: 1.5,
    margin: '8px 0',
    whiteSpace: 'normal',
  },
  meta: {
    fontSize: '12px',
    color: '#9ca3af',
    margin: '4px 0 0 0',
  },
  upgradeCard: {
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '12px',
    whiteSpace: 'normal',
  },
  upgradeHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  },
  addBadge: {
    backgroundColor: '#22c55e',
    color: 'white',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 600,
  },
  playerName: {
    fontWeight: 600,
    color: '#1f2937',
  },
  scoreComparison: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  },
  scoreUp: {
    color: '#22c55e',
    fontWeight: 600,
    fontSize: '16px',
  },
  scoreDown: {
    color: '#ef4444',
    fontWeight: 500,
    fontSize: '14px',
  },
  vs: {
    color: '#9ca3af',
    fontSize: '12px',
  },
  noRecs: {
    color: '#6b7280',
    fontStyle: 'italic',
  },
  injuryNote: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    backgroundColor: '#fef3c7',
    border: '1px solid #f59e0b',
    borderRadius: '6px',
    padding: '8px 12px',
    marginTop: '8px',
    marginBottom: '8px',
    fontSize: '13px',
    color: '#92400e',
    lineHeight: 1.4,
    whiteSpace: 'normal',
  },
  injuryIcon: {
    flexShrink: 0,
    fontSize: '14px',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// DOM Injection Logic
// ─────────────────────────────────────────────────────────────────────────────

// Store mounted React roots so we can clean them up
const mountedRoots: Map<string, ReactDOM.Root> = new Map();

/**
 * Clean up all injected recommendation icons
 */
function cleanupInjectedIcons(): void {
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
 * Inject recommendation icons next to players on the page
 */
function injectRecommendations(
  playerRecommendations: PlayerRecommendationsMap,
  forceRefresh = false
) {
  // If force refresh, clean up existing icons first
  if (forceRefresh && mountedRoots.size > 0) {
    cleanupInjectedIcons();
  }
  // Find all player note elements on the page by aria-label pattern
  const playerNoteElements = document.querySelectorAll(
    '[aria-label*="Open player notes for"]'
  );

  console.log(
    `[Fantasy Assistant] Found ${playerNoteElements.length} player elements on page`
  );

  let injectedCount = 0;

  playerNoteElements.forEach((element) => {
    // Extract player ID from the element
    const playerId =
      element.getAttribute('data-ys-playerid') ||
      element.id?.replace('playernote-', '');

    if (!playerId) return;

    // Check if we have recommendations for this player
    const recommendations = playerRecommendations[playerId];
    if (!recommendations) return;

    // Check if we've already injected for this player
    const containerId = `fantasy-assistant-${playerId}`;
    if (document.getElementById(containerId)) return;

    const playerName =
      playerRecommendations[playerId]?.startBench?.name ||
      playerRecommendations[playerId]?.waiverUpgrades?.[0]
        ?.rostered_player_name ||
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
    injectedCount++;
  });

  console.log(
    `[Fantasy Assistant] Injected ${injectedCount} recommendation icons`
  );
}

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

  if (response?.playerRecommendations) {
    console.log(
      '[Fantasy Assistant] Received player recommendations:',
      Object.keys(response.playerRecommendations).length
    );
    injectRecommendations(response.playerRecommendations, forceRefresh);
  } else {
    console.log('[Fantasy Assistant] No recommendations available yet');
  }
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
    updateInitializationBanner(message.progress);
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

// ─────────────────────────────────────────────────────────────────────────────
// Initialization Banner Management
// ─────────────────────────────────────────────────────────────────────────────

let bannerRoot: ReactDOM.Root | null = null;
const BANNER_CONTAINER_ID = 'fantasy-assistant-init-banner';

async function updateInitializationBanner(
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
    const rosterUrl = await getUserRosterUrl();
    bannerRoot.render(
      <InitializationBanner
        progress={progress}
        rosterUrl={rosterUrl}
        onDismiss={() => {
          updateInitializationBanner({ ...progress, status: 'idle' });
          // Clear from storage
          chrome.storage.local.remove(['initialization_progress']);
        }}
      />
    );
  }
}

// Check for ongoing initialization on page load
async function checkAndShowInitializationBanner(): Promise<void> {
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
      if (response?.playerRecommendations) {
        injectRecommendations(response.playerRecommendations);
      }
    }, 500);
  }
});

// Start observing
observer.observe(document.body, {
  childList: true,
  subtree: true,
});
