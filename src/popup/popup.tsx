import { useEffect, useState, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { apiClient } from '../api/client';

// Estimated times in milliseconds
const FIRST_TIME_USER_ESTIMATED_MS = 120000; // 2 minutes for first-time users
const RETURNING_USER_ESTIMATED_MS = 30000; // 30 seconds for returning users

interface InitializationProgress {
  status: 'idle' | 'initializing' | 'ready' | 'error';
  percentage: number;
  currentStep: string;
  errorMessage?: string;
  startTime?: number;
  estimatedDuration?: number;
}

/**
 * Calculate exponential progress based on elapsed time.
 * Uses an asymptotic curve that approaches but never reaches 95%.
 */
function calculateExponentialProgress(
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

function Popup() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [authCode, setAuthCode] = useState('');
  const [initProgress, setInitProgress] = useState<InitializationProgress>({
    status: 'idle',
    percentage: 0,
    currentStep: '',
  });

  // Use refs to track animation timing without causing re-renders
  const animationIntervalRef = useRef<number | null>(null);
  const animationStartTimeRef = useRef<number | null>(null);
  const animationDurationRef = useRef<number | null>(null);

  // Start the animation loop using setInterval (more reliable in extension popups)
  const startAnimation = (startTime: number, estimatedDuration: number) => {
    // Stop any existing animation
    stopAnimation();

    animationStartTimeRef.current = startTime;
    animationDurationRef.current = estimatedDuration;

    // Update every 100ms for smooth progress
    animationIntervalRef.current = window.setInterval(() => {
      if (
        animationStartTimeRef.current === null ||
        animationDurationRef.current === null
      ) {
        return;
      }

      const newPercentage = calculateExponentialProgress(
        animationStartTimeRef.current,
        animationDurationRef.current
      );

      setInitProgress((prev) => ({
        ...prev,
        percentage: newPercentage,
      }));
    }, 100);
  };

  // Stop the animation loop
  const stopAnimation = () => {
    if (animationIntervalRef.current !== null) {
      window.clearInterval(animationIntervalRef.current);
      animationIntervalRef.current = null;
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAnimation();
    };
  }, []);

  useEffect(() => {
    checkAuthStatus();

    // Listen for storage changes from background script (completion signal)
    const storageListener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName === 'local' && changes.initialization_progress) {
        const newProgress = changes.initialization_progress.newValue;
        if (newProgress) {
          // Only update status changes (ready, error) from background
          // Don't override the time-based progress calculation
          if (
            newProgress.status === 'ready' ||
            newProgress.status === 'error'
          ) {
            // Stop the animation
            stopAnimation();

            setInitProgress((prev) => ({
              ...prev,
              status: newProgress.status,
              percentage:
                newProgress.status === 'ready' ? 100 : prev.percentage,
              currentStep: newProgress.currentStep || prev.currentStep,
              errorMessage: newProgress.errorMessage,
            }));
          }
        }
      }
    };

    chrome.storage.onChanged.addListener(storageListener);

    return () => {
      chrome.storage.onChanged.removeListener(storageListener);
    };
  }, []);

  async function checkAuthStatus() {
    // Check if user is already authenticated
    // This could be stored in chrome.storage.local or checked via API
    try {
      const result = await chrome.storage.local.get([
        'yahoo_user',
        'initialization_progress',
      ]);
      if (result.yahoo_user) {
        setUser(result.yahoo_user);
        setIsAuthenticated(true);

        // Check if there's ongoing initialization from storage
        if (result.initialization_progress) {
          const storedProgress = result.initialization_progress;

          // If it's still initializing, restore progress state and start animation
          if (
            storedProgress.status === 'initializing' &&
            storedProgress.startTime &&
            storedProgress.estimatedDuration
          ) {
            // Calculate current progress based on elapsed time
            const currentPercentage = calculateExponentialProgress(
              storedProgress.startTime,
              storedProgress.estimatedDuration
            );

            setInitProgress({
              ...storedProgress,
              percentage: currentPercentage,
            });

            // Start the animation
            startAnimation(
              storedProgress.startTime,
              storedProgress.estimatedDuration
            );

            // Make sure background is polling
            chrome.runtime.sendMessage({
              type: 'START_INITIALIZATION_POLLING',
            });
          } else {
            // Not initializing, just set the stored progress
            setInitProgress(storedProgress);
          }
        }
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
    }
  }

  async function initiateYahooOAuth() {
    try {
      setLoading(true);
      setError(null);

      const response = await apiClient.initiateOAuth();

      if (response.success && response.data) {
        // Store nonce in Chrome storage for later validation
        await chrome.storage.local.set({
          oauth_nonce: response.data.nonce,
          oauth_timestamp: Date.now(),
        });

        // Open OAuth flow in a new tab
        chrome.tabs.create({ url: response.data.auth_url });
        // Clear any previous error
        setError(null);
      } else {
        setError(response.error?.error || 'Failed to get OAuth URL or nonce');
      }
    } catch (error) {
      console.error('OAuth initiation error:', error);
      setError('Failed to initiate OAuth');
    } finally {
      setLoading(false);
    }
  }

  async function submitAuthCode() {
    if (!authCode.trim()) {
      setError('Please enter the authorization code');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Get stored nonce from Chrome storage
      const result = await chrome.storage.local.get([
        'oauth_nonce',
        'oauth_timestamp',
      ]);

      if (!result.oauth_nonce) {
        setError('No OAuth session found. Please initiate OAuth again.');
        return;
      }

      // Check if nonce is not too old (10 minutes)
      const now = Date.now();
      const maxAge = 10 * 60 * 1000; // 10 minutes
      if (now - result.oauth_timestamp > maxAge) {
        setError('OAuth session expired. Please initiate OAuth again.');
        // Clean up expired session
        chrome.storage.local.remove(['oauth_nonce', 'oauth_timestamp']);
        return;
      }

      const response = await apiClient.exchangeOAuthCode(
        authCode.trim(),
        result.oauth_nonce
      );

      if (response.success && response.data?.user) {
        setUser(response.data.user);
        setIsAuthenticated(true);
        setError(null);
        setAuthCode('');
        // Store user data in chrome storage
        chrome.storage.local.set({ yahoo_user: response.data.user });
        // Clean up OAuth session data
        chrome.storage.local.remove(['oauth_nonce', 'oauth_timestamp']);

        // Trigger league data sync in the background
        // Pass isFirstTimeUser to determine estimated time for progress bar
        triggerLeagueDataSync(
          response.data.user,
          response.data.isFirstTimeUser ?? true
        );
      } else {
        setError(response.error?.error || 'Token exchange failed');
        // Clean up OAuth session data on error too
        chrome.storage.local.remove(['oauth_nonce', 'oauth_timestamp']);
      }
    } catch (error) {
      console.error('Token exchange error:', error);
      setError('Failed to exchange code for tokens');
    } finally {
      setLoading(false);
    }
  }

  function signOut() {
    // Stop any running animation
    stopAnimation();

    // Clear all cached data from Chrome storage
    chrome.storage.local.remove([
      'yahoo_user',
      // Tips cache (background.ts)
      'tips_data',
      'player_recommendations',
      'tips_timestamp',
      // Sync timestamps (client.ts)
      'lastPeriodicSync',
      // OAuth session data (in case sign out during OAuth flow)
      'oauth_nonce',
      'oauth_timestamp',
      // Initialization progress
      'initialization_progress',
    ]);
    setUser(null);
    setIsAuthenticated(false);
    setInitProgress({
      status: 'idle',
      percentage: 0,
      currentStep: '',
    });
  }

  // Function to trigger league data sync after successful authentication
  async function triggerLeagueDataSync(user: any, isFirstTimeUser: boolean) {
    try {
      console.log('Starting league data sync for user:', user.id, {
        isFirstTimeUser,
      });

      const startTime = Date.now();
      const estimatedDuration = isFirstTimeUser
        ? FIRST_TIME_USER_ESTIMATED_MS
        : RETURNING_USER_ESTIMATED_MS;

      // Set status to initializing with time-based progress
      const initialProgress: InitializationProgress = {
        status: 'initializing',
        percentage: 0,
        currentStep: isFirstTimeUser
          ? 'Setting up your leagues for the first time. This may take a few minutes...'
          : 'Syncing your league data...',
        startTime,
        estimatedDuration,
      };
      setInitProgress(initialProgress);

      // Start the progress bar animation
      startAnimation(startTime, estimatedDuration);

      // Store in chrome.storage so background can detect it and we can resume on popup reopen
      await chrome.storage.local.set({
        initialization_progress: initialProgress,
      });

      // Tell background script to start polling for status updates
      chrome.runtime.sendMessage({ type: 'START_INITIALIZATION_POLLING' });

      // Call the league data sync API via client
      const result = await apiClient.syncLeagueData();

      if (result.success) {
        console.log('League data sync started:', result.data);
        // Progress will continue to update via animation until background signals completion
      } else {
        console.error('League data sync failed:', result.error?.error);

        // Stop animation and polling on error
        stopAnimation();
        chrome.runtime.sendMessage({ type: 'STOP_INITIALIZATION_POLLING' });

        const errorProgress: InitializationProgress = {
          status: 'error',
          percentage: 0,
          currentStep: 'Initialization failed',
          errorMessage: result.error?.error,
        };
        setInitProgress(errorProgress);
        await chrome.storage.local.set({
          initialization_progress: errorProgress,
        });
      }
    } catch (error) {
      console.error('Error during league data sync:', error);

      // Stop animation and polling on error
      stopAnimation();
      chrome.runtime.sendMessage({ type: 'STOP_INITIALIZATION_POLLING' });

      const errorProgress: InitializationProgress = {
        status: 'error',
        percentage: 0,
        currentStep: 'Initialization failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      };
      setInitProgress(errorProgress);
      await chrome.storage.local.set({
        initialization_progress: errorProgress,
      });
    }
  }

  return (
    <div style={{ padding: '1rem', width: '300px' }}>
      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
      <h3>FantasyEdge</h3>

      {!isAuthenticated ? (
        <div>
          <p>Sign in with Yahoo to access your fantasy data</p>
          <button
            onClick={initiateYahooOAuth}
            disabled={loading}
            style={{
              padding: '8px 16px',
              backgroundColor: '#7c3aed',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              marginBottom: '16px',
              width: '100%',
            }}
          >
            {loading ? 'Loading...' : 'Sign in with Yahoo'}
          </button>

          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
            <p style={{ fontSize: '14px', marginBottom: '8px' }}>
              Enter the authorization code from Yahoo:
            </p>
            <input
              type="text"
              value={authCode}
              onChange={(e) => setAuthCode(e.target.value)}
              placeholder="Enter authorization code"
              style={{
                width: '100%',
                padding: '8px',
                marginBottom: '8px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                fontSize: '14px',
              }}
            />
            <button
              onClick={submitAuthCode}
              disabled={loading || !authCode.trim()}
              style={{
                padding: '8px 16px',
                backgroundColor: '#7c3aed',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: loading || !authCode.trim() ? 'not-allowed' : 'pointer',
                width: '100%',
              }}
            >
              {loading ? 'Authorizing...' : 'Submit Code'}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
            }}
          >
            <p style={{ margin: 0 }}>Welcome, {user?.name || user?.email}!</p>
            <button
              onClick={signOut}
              style={{
                padding: '4px 8px',
                backgroundColor: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              Sign Out
            </button>
          </div>

          {/* Initialization Progress */}
          {initProgress.status === 'initializing' && (
            <div
              style={{
                backgroundColor: '#f3f4f6',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '16px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  marginBottom: '8px',
                }}
              >
                <div
                  style={{
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    border: '2px solid #7c3aed',
                    borderTopColor: 'transparent',
                    animation: 'spin 1s linear infinite',
                    marginRight: '8px',
                  }}
                />
                <span style={{ fontWeight: 600, color: '#374151' }}>
                  Setting up your league...
                </span>
              </div>
              <div
                style={{
                  width: '100%',
                  height: '8px',
                  backgroundColor: '#e5e7eb',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  marginBottom: '8px',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    width: `${initProgress.percentage}%`,
                    height: '8px',
                    backgroundColor: '#7c3aed',
                    borderRadius: '4px',
                    transition: 'width 0.1s linear',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                  }}
                />
              </div>
              <p
                style={{
                  fontSize: '12px',
                  color: '#6b7280',
                  margin: 0,
                }}
              >
                {initProgress.currentStep}
              </p>
              <p
                style={{
                  fontSize: '11px',
                  color: '#9ca3af',
                  margin: '4px 0 0 0',
                }}
              >
                {Math.round(initProgress.percentage)}% complete
              </p>
            </div>
          )}

          {initProgress.status === 'ready' && (
            <div
              style={{
                backgroundColor: '#d1fae5',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <span style={{ marginRight: '8px' }}>✓</span>
              <span style={{ color: '#065f46' }}>
                Your league data is ready! Visit Yahoo Fantasy to see tips.
              </span>
            </div>
          )}

          {initProgress.status === 'error' && (
            <div
              style={{
                backgroundColor: '#fee2e2',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '16px',
              }}
            >
              <p style={{ color: '#991b1b', margin: 0, fontWeight: 600 }}>
                Initialization Error
              </p>
              <p
                style={{
                  color: '#991b1b',
                  margin: '4px 0 0 0',
                  fontSize: '12px',
                }}
              >
                {initProgress.errorMessage || 'An error occurred during setup'}
              </p>
            </div>
          )}
        </div>
      )}

      {loading && <div>Loading...</div>}
      {error && (
        <div style={{ color: 'red', fontSize: '12px', marginTop: '8px' }}>
          Error: {error}
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Popup />);
