// Estimated times in milliseconds
export const FIRST_TIME_USER_ESTIMATED_MS = 90000; // 1.5 minutes for first-time users
export const RETURNING_USER_ESTIMATED_MS = 30000; // 30 seconds for returning users

/**
 * Calculate exponential progress based on elapsed time.
 * Uses an asymptotic curve that approaches but never reaches 95%.
 */
export function calculateExponentialProgress(
  startTime: number,
  estimatedDuration: number
): number {
  const elapsed = Date.now() - startTime;
  const maxProgress = 95; // Never exceed 95% until actually complete
  const k = 2.3; // Tuned so we reach ~90% at estimated time

  const progress =
    maxProgress * (1 - Math.exp((-k * elapsed) / estimatedDuration));
  return Math.min(progress, maxProgress);
}
