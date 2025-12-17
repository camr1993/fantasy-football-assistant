import { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { apiClient } from '../api/client';

function Popup() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [authCode, setAuthCode] = useState('');

  useEffect(() => {
    checkAuthStatus();
  }, []);

  async function checkAuthStatus() {
    // Check if user is already authenticated
    // This could be stored in chrome.storage.local or checked via API
    try {
      const result = await chrome.storage.local.get(['yahoo_user']);
      if (result.yahoo_user) {
        setUser(result.yahoo_user);
        setIsAuthenticated(true);

        // User is authenticated, no need to check tokens
        // Backend will handle token refresh automatically
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
    }
  }

  async function initiateYahooOAuth() {
    try {
      setLoading(true);
      setError(null);

      // Get the OAuth URL from our edge function
      const response = await fetch(
        'https://gauanzpirzdhbfbctlkg.supabase.co/functions/v1/oauth/auth',
        {
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );
      const data = await response.json();

      if (data.auth_url && data.nonce) {
        // Store nonce in Chrome storage for later validation
        await chrome.storage.local.set({
          oauth_nonce: data.nonce,
          oauth_timestamp: Date.now(),
        });

        // Open OAuth flow in a new tab
        chrome.tabs.create({ url: data.auth_url });
        // Clear any previous error
        setError(null);
      } else {
        setError('Failed to get OAuth URL or nonce');
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

      const response = await fetch(
        'https://gauanzpirzdhbfbctlkg.supabase.co/functions/v1/oauth/callback',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            code: authCode.trim(),
            state: 'fantasy-football-assistant',
            nonce: result.oauth_nonce, // Send the stored nonce
          }),
        }
      );

      const data = await response.json();

      if (data.success) {
        setUser(data.user);
        setIsAuthenticated(true);
        setError(null);
        setAuthCode('');
        // Store user data in chrome storage
        chrome.storage.local.set({ yahoo_user: data.user });
        // Clean up OAuth session data
        chrome.storage.local.remove(['oauth_nonce', 'oauth_timestamp']);

        // Trigger league data sync in the background
        triggerLeagueDataSync(data.user);
      } else {
        setError(data.error || 'Token exchange failed');
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
    ]);
    setUser(null);
    setIsAuthenticated(false);
  }

  // Function to trigger league data sync after successful authentication
  async function triggerLeagueDataSync(user: any) {
    try {
      console.log('Starting league data sync for user:', user.id);

      // Call the league data sync API via client
      const result = await apiClient.syncLeagueData();

      if (result.success) {
        console.log('League data sync completed successfully:', result.data);
      } else {
        console.error('League data sync failed:', result.error?.error);
      }
    } catch (error) {
      console.error('Error during league data sync:', error);
    }
  }

  return (
    <div style={{ padding: '1rem', width: '300px' }}>
      <h3>Fantasy Assistant</h3>

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
