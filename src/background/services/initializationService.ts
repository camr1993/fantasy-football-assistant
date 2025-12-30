import { apiClient } from '../../api/client';
import { fetchAndStoreTips } from './tipsService';

/**
 * Start polling for initialization status
 * Creates an alarm that fires every 30 seconds
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
export async function pollInitializationStatus(): Promise<void> {
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

