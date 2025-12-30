export interface InitializationProgress {
  status: 'idle' | 'initializing' | 'ready' | 'error';
  percentage: number;
  currentStep: string;
  errorMessage?: string;
  startTime?: number;
  estimatedDuration?: number;
}

export interface StoredUserTeam {
  team_id: string;
  league_id: string;
  yahoo_league_id: string;
  roster_url: string;
}

export interface OnboardingState {
  hasSeenIconTooltip: boolean;
  completedAt?: number;
}
