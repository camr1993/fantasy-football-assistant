/**
 * Get human-readable injury status label
 */
export function getInjuryStatusLabel(status: string): string {
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
export function shouldShowInjuryWarning(status?: string): boolean {
  if (!status) return false;
  // Show warning for questionable, doubtful, or game-time decision statuses
  return ['Q', 'D', 'GTD'].includes(status);
}

