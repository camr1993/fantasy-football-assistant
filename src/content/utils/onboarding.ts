import type { OnboardingState } from '../types';

const STORAGE_KEY = 'onboarding_state';

const DEFAULT_STATE: OnboardingState = {
  hasSeenIconTooltip: false,
};

/**
 * Get the current onboarding state from chrome.storage.local
 */
export async function getOnboardingState(): Promise<OnboardingState> {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEY]);
    return result[STORAGE_KEY] || DEFAULT_STATE;
  } catch (error) {
    console.error('[Fantasy Assistant] Error reading onboarding state:', error);
    return DEFAULT_STATE;
  }
}

/**
 * Update the onboarding state in chrome.storage.local
 */
export async function updateOnboardingState(
  updates: Partial<OnboardingState>
): Promise<void> {
  try {
    const currentState = await getOnboardingState();
    const newState: OnboardingState = {
      ...currentState,
      ...updates,
    };

    // If all onboarding steps are complete, set completedAt
    if (newState.hasSeenIconTooltip && !newState.completedAt) {
      newState.completedAt = Date.now();
    }

    await chrome.storage.local.set({ [STORAGE_KEY]: newState });
  } catch (error) {
    console.error(
      '[Fantasy Assistant] Error updating onboarding state:',
      error
    );
  }
}

/**
 * Initialize onboarding state for first-time users
 * Called from popup.tsx when isFirstTimeUser is true
 */
export async function initializeOnboardingForNewUser(): Promise<void> {
  const state = await getOnboardingState();
  // Only initialize if there's no existing state or it's never been completed
  if (!state.completedAt) {
    await chrome.storage.local.set({
      [STORAGE_KEY]: DEFAULT_STATE,
    });
  }
}

/**
 * Check if onboarding has been completed
 */
export async function isOnboardingComplete(): Promise<boolean> {
  const state = await getOnboardingState();
  return state.hasSeenIconTooltip;
}


