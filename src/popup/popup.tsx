import { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { apiClient } from '../api/client';
import {
  supabase,
  getSupabaseSession,
  signOutSupabase,
} from '../supabaseClient';
import type { InitializationProgress, User } from './types';
import {
  FIRST_TIME_USER_ESTIMATED_MS,
  RETURNING_USER_ESTIMATED_MS,
  calculateExponentialProgress,
} from './utils/progress';
import { useProgressAnimation } from './hooks/useProgressAnimation';
import { AuthSection } from './components/AuthSection';
import { InitializationStatus } from './components/InitializationStatus';
import { UserHeader } from './components/UserHeader';

function Popup() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authCode, setAuthCode] = useState('');
  const [rosterUrl, setRosterUrl] = useState<string | null>(null);
  const [initProgress, setInitProgress] = useState<InitializationProgress>({
    status: 'idle',
    percentage: 0,
    currentStep: '',
  });

  const { startAnimation, stopAnimation } =
    useProgressAnimation(setInitProgress);

  useEffect(() => {
    checkAuthStatus();

    // Listen for Supabase auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session?.user?.id);

      if (event === 'SIGNED_OUT') {
        setUser(null);
        setIsAuthenticated(false);
        stopAnimation();
        setInitProgress({
          status: 'idle',
          percentage: 0,
          currentStep: '',
        });
      } else if (event === 'TOKEN_REFRESHED') {
        console.log('Session token refreshed');
      } else if (event === 'SIGNED_IN' && session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email || '',
          name: session.user.user_metadata?.name,
        });
        setIsAuthenticated(true);
      }
    });

    // Listen for storage changes from background script (completion signal)
    const storageListener = async (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName === 'local' && changes.initialization_progress) {
        const newProgress = changes.initialization_progress.newValue;
        if (newProgress) {
          if (
            newProgress.status === 'ready' ||
            newProgress.status === 'error'
          ) {
            stopAnimation();

            setInitProgress((prev) => ({
              ...prev,
              status: newProgress.status,
              percentage:
                newProgress.status === 'ready' ? 100 : prev.percentage,
              currentStep: newProgress.currentStep || prev.currentStep,
              errorMessage: newProgress.errorMessage,
            }));

            if (newProgress.status === 'ready') {
              const result = await chrome.storage.local.get(['user_teams']);
              if (result.user_teams && result.user_teams.length > 0) {
                setRosterUrl(result.user_teams[0].roster_url);
              }
            }
          }
        }
      }

      if (areaName === 'local' && changes.user_teams) {
        const newUserTeams = changes.user_teams.newValue;
        if (newUserTeams && newUserTeams.length > 0) {
          setRosterUrl(newUserTeams[0].roster_url);
        }
      }
    };

    chrome.storage.onChanged.addListener(storageListener);

    return () => {
      subscription.unsubscribe();
      chrome.storage.onChanged.removeListener(storageListener);
    };
  }, [stopAnimation]);

  async function checkAuthStatus() {
    try {
      const session = await getSupabaseSession();

      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email || '',
          name: session.user.user_metadata?.name,
        });
        setIsAuthenticated(true);

        const result = await chrome.storage.local.get([
          'initialization_progress',
          'user_teams',
        ]);

        if (result.user_teams && result.user_teams.length > 0) {
          setRosterUrl(result.user_teams[0].roster_url);
        }

        if (result.initialization_progress) {
          const storedProgress = result.initialization_progress;

          if (
            storedProgress.status === 'initializing' &&
            storedProgress.startTime &&
            storedProgress.estimatedDuration
          ) {
            const currentPercentage = calculateExponentialProgress(
              storedProgress.startTime,
              storedProgress.estimatedDuration
            );

            setInitProgress({
              ...storedProgress,
              percentage: currentPercentage,
            });

            startAnimation(
              storedProgress.startTime,
              storedProgress.estimatedDuration
            );

            chrome.runtime.sendMessage({
              type: 'START_INITIALIZATION_POLLING',
            });
          } else {
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
        await chrome.storage.local.set({
          oauth_nonce: response.data.nonce,
          oauth_timestamp: Date.now(),
        });

        chrome.tabs.create({ url: response.data.auth_url });
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

      const result = await chrome.storage.local.get([
        'oauth_nonce',
        'oauth_timestamp',
      ]);

      if (!result.oauth_nonce) {
        setError('No OAuth session found. Please initiate OAuth again.');
        return;
      }

      const now = Date.now();
      const maxAge = 10 * 60 * 1000; // 10 minutes
      if (now - result.oauth_timestamp > maxAge) {
        setError('OAuth session expired. Please initiate OAuth again.');
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
        chrome.storage.local.remove(['oauth_nonce', 'oauth_timestamp']);

        triggerLeagueDataSync(
          response.data.user,
          response.data.isFirstTimeUser ?? true
        );
      } else {
        setError(response.error?.error || 'Token exchange failed');
        chrome.storage.local.remove(['oauth_nonce', 'oauth_timestamp']);
      }
    } catch (error) {
      console.error('Token exchange error:', error);
      setError('Failed to exchange code for tokens');
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    stopAnimation();
    await signOutSupabase();

    chrome.storage.local.remove([
      'tips_data',
      'player_recommendations',
      'tips_timestamp',
      'lastPeriodicSync',
      'oauth_nonce',
      'oauth_timestamp',
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

  async function triggerLeagueDataSync(user: User, isFirstTimeUser: boolean) {
    try {
      console.log('Starting league data sync for user:', user.id, {
        isFirstTimeUser,
      });

      const startTime = Date.now();
      const estimatedDuration = isFirstTimeUser
        ? FIRST_TIME_USER_ESTIMATED_MS
        : RETURNING_USER_ESTIMATED_MS;

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

      startAnimation(startTime, estimatedDuration);

      await chrome.storage.local.set({
        initialization_progress: initialProgress,
      });

      chrome.runtime.sendMessage({ type: 'START_INITIALIZATION_POLLING' });

      const result = await apiClient.syncLeagueData();

      if (result.success) {
        console.log('League data sync started:', result.data);
      } else {
        console.error('League data sync failed:', result.error?.error);

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
        <AuthSection
          loading={loading}
          authCode={authCode}
          onAuthCodeChange={setAuthCode}
          onInitiateOAuth={initiateYahooOAuth}
          onSubmitCode={submitAuthCode}
        />
      ) : (
        <div>
          <UserHeader user={user} onSignOut={signOut} />
          <InitializationStatus progress={initProgress} rosterUrl={rosterUrl} />
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
