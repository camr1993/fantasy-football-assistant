export interface InitializationProgress {
  status: 'idle' | 'initializing' | 'ready' | 'error';
  percentage: number;
  currentStep: string;
  errorMessage?: string;
  startTime?: number;
  estimatedDuration?: number;
}

export interface User {
  id: string;
  email?: string;
  name?: string;
}
