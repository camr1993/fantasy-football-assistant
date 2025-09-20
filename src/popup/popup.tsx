import { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { apiClient } from '../api/client';
import { tokenManager } from '../utils/tokenManager';

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

        // Check if tokens are still valid and attempt refresh if needed
        const hasValidTokens = await tokenManager.hasValidTokens();
        if (!hasValidTokens) {
          console.log('Tokens are expired, attempting to refresh...');
          try {
            // Attempt to refresh tokens
            const accessToken = await tokenManager.getValidAccessToken();
            if (!accessToken) {
              console.log('Token refresh failed, signing out user');
              signOut();
              setError('Session expired. Please sign in again.');
            } else {
              console.log('Tokens refreshed successfully');
              // Update user data with refreshed tokens
              const updatedResult = await chrome.storage.local.get([
                'yahoo_user',
              ]);
              if (updatedResult.yahoo_user) {
                setUser(updatedResult.yahoo_user);
              }
            }
          } catch (refreshError) {
            console.error('Error refreshing tokens:', refreshError);
            signOut();
            setError('Session expired. Please sign in again.');
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
    tokenManager.clearTokens();
    setUser(null);
    setIsAuthenticated(false);
  }

  async function testYahooApi() {
    try {
      setLoading(true);
      setError(null);

      const response = await apiClient.getLeagues();

      if (response.success) {
        console.log('Yahoo API response:', response.data);
        setError('Yahoo API call successful! Check console for data.');
      } else {
        setError(response.error?.error || 'Yahoo API call failed');
      }
    } catch (error) {
      console.error('Yahoo API test error:', error);
      setError('Failed to test Yahoo API');
    } finally {
      setLoading(false);
    }
  }

  async function testLeagueDetails() {
    try {
      setLoading(true);
      setError(null);

      // First get leagues to find a league key
      const leaguesResponse = await apiClient.getLeagues();
      if (!leaguesResponse.success) {
        setError('Failed to get leagues first');
        return;
      }
      console.log('Leagues response:', leaguesResponse.data);

      const leagues =
        leaguesResponse.data?.data?.fantasy_content?.users?.[0]?.user?.[1]
          ?.games?.[0]?.game?.[1]?.leagues;

      if (!leagues || leagues.length === 0) {
        setError('No leagues found');
        return;
      }

      const leagueKey = leagues[0].league?.[0]?.league_key;
      if (!leagueKey) {
        setError('No league key found');
        return;
      }

      const response = await apiClient.getLeagueDetails(leagueKey);
      if (response.success) {
        console.log('League details response:', response.data);
        setError(
          'League details fetched successfully! Check console for data.'
        );
      } else {
        setError(response.error?.error || 'League details call failed');
      }
    } catch (error) {
      console.error('League details test error:', error);
      setError('Failed to test league details');
    } finally {
      setLoading(false);
    }
  }

  async function testRoster() {
    try {
      setLoading(true);
      setError(null);

      // First get teams to find a team key
      const teamsResponse = await apiClient.getTeams();
      if (!teamsResponse.success) {
        setError('Failed to get teams first');
        return;
      }

      const teams =
        teamsResponse?.data?.data?.fantasy_content?.users?.[0]?.user?.[1]
          ?.games?.[0]?.game?.[1]?.teams;
      if (!teams || teams.length === 0) {
        setError('No teams found');
        return;
      }

      const teamKey = teams[0].team?.[0]?.[0]?.team_key;
      if (!teamKey) {
        setError('No team key found');
        return;
      }

      const response = await apiClient.getRoster(teamKey);
      if (response.success) {
        console.log('Roster response:', response.data);
        setError('Roster fetched successfully! Check console for data.');
      } else {
        setError(response.error?.error || 'Roster call failed');
      }
    } catch (error) {
      console.error('Roster test error:', error);
      setError('Failed to test roster');
    } finally {
      setLoading(false);
    }
  }

  async function testPlayerStats() {
    try {
      setLoading(true);
      setError(null);

      // First get leagues to find a league key
      const leaguesResponse = await apiClient.getLeagues();
      if (!leaguesResponse.success) {
        setError('Failed to get leagues first');
        return;
      }

      const leagues =
        leaguesResponse.data?.data?.fantasy_content?.users?.[0]?.user?.[1]
          ?.games?.[0]?.game?.[1]?.leagues;
      if (!leagues || leagues.length === 0) {
        setError('No leagues found');
        return;
      }

      const leagueKey = leagues[0].league?.[0]?.league_key;
      if (!leagueKey) {
        setError('No league key found');
        return;
      }

      const response = await apiClient.getPlayerStats(leagueKey, { week: '1' });
      if (response.success) {
        console.log('Player stats response:', response.data);
        setError('Player stats fetched successfully! Check console for data.');
      } else {
        setError(response.error?.error || 'Player stats call failed');
      }
    } catch (error) {
      console.error('Player stats test error:', error);
      setError('Failed to test player stats');
    } finally {
      setLoading(false);
    }
  }

  async function testWaiverWire() {
    try {
      setLoading(true);
      setError(null);

      // First get leagues to find a league key
      const leaguesResponse = await apiClient.getLeagues();
      if (!leaguesResponse.success) {
        setError('Failed to get leagues first');
        return;
      }

      const leagues =
        leaguesResponse.data?.data?.fantasy_content?.users?.[0]?.user?.[1]
          ?.games?.[0]?.game?.[1]?.leagues;
      if (!leagues || leagues.length === 0) {
        setError('No leagues found');
        return;
      }

      const leagueKey = leagues[0].league?.[0]?.league_key;
      if (!leagueKey) {
        setError('No league key found');
        return;
      }

      const response = await apiClient.getWaiverWire(leagueKey, {
        status: 'A',
        count: '10',
      });
      if (response.success) {
        console.log('Waiver wire response:', response.data);
        setError('Waiver wire fetched successfully! Check console for data.');
      } else {
        setError(response.error?.error || 'Waiver wire call failed');
      }
    } catch (error) {
      console.error('Waiver wire test error:', error);
      setError('Failed to test waiver wire');
    } finally {
      setLoading(false);
    }
  }

  async function testTransactions() {
    try {
      setLoading(true);
      setError(null);

      // First get leagues to find a league key
      const leaguesResponse = await apiClient.getLeagues();
      if (!leaguesResponse.success) {
        setError('Failed to get leagues first');
        return;
      }

      const leagues =
        leaguesResponse.data?.data?.fantasy_content?.users?.[0]?.user?.[1]
          ?.games?.[0]?.game?.[1]?.leagues;
      if (!leagues || leagues.length === 0) {
        setError('No leagues found');
        return;
      }

      const leagueKey = leagues[0].league?.[0]?.league_key;
      if (!leagueKey) {
        setError('No league key found');
        return;
      }

      const response = await apiClient.getTransactions(leagueKey, {
        type: 'all',
        count: '10',
      });
      if (response.success) {
        console.log('Transactions response:', response.data);
        setError('Transactions fetched successfully! Check console for data.');
      } else {
        setError(response.error?.error || 'Transactions call failed');
      }
    } catch (error) {
      console.error('Transactions test error:', error);
      setError('Failed to test transactions');
    } finally {
      setLoading(false);
    }
  }

  async function testMatchups() {
    try {
      setLoading(true);
      setError(null);

      // First get leagues to find a league key
      const leaguesResponse = await apiClient.getLeagues();
      if (!leaguesResponse.success) {
        setError('Failed to get leagues first');
        return;
      }

      const leagues =
        leaguesResponse.data?.data?.fantasy_content?.users?.[0]?.user?.[1]
          ?.games?.[0]?.game?.[1]?.leagues;
      if (!leagues || leagues.length === 0) {
        setError('No leagues found');
        return;
      }

      const leagueKey = leagues[0].league?.[0]?.league_key;
      if (!leagueKey) {
        setError('No league key found');
        return;
      }

      const response = await apiClient.getMatchups(leagueKey, { week: '1' });
      if (response.success) {
        console.log('Matchups response:', response.data);
        setError('Matchups fetched successfully! Check console for data.');
      } else {
        setError(response.error?.error || 'Matchups call failed');
      }
    } catch (error) {
      console.error('Matchups test error:', error);
      setError('Failed to test matchups');
    } finally {
      setLoading(false);
    }
  }

  async function testTokenRefresh() {
    try {
      setLoading(true);
      setError(null);

      console.log('Testing token refresh...');

      // Get current token info before refresh
      const result = await chrome.storage.local.get(['yahoo_user']);
      const user = result.yahoo_user;

      if (!user) {
        setError('No user found. Please sign in first.');
        return;
      }

      console.log('Current token expires at:', user.yahoo_token_expires_at);
      console.log(
        'Current access token (first 20 chars):',
        user.yahoo_access_token?.substring(0, 20) + '...'
      );

      // Force token refresh by calling getValidAccessToken
      const newAccessToken = await tokenManager.getValidAccessToken();

      if (newAccessToken) {
        // Get updated user data to show the new token
        const updatedResult = await chrome.storage.local.get(['yahoo_user']);
        const updatedUser = updatedResult.yahoo_user;

        console.log(
          'New token expires at:',
          updatedUser.yahoo_token_expires_at
        );
        console.log(
          'New access token (first 20 chars):',
          updatedUser.yahoo_access_token?.substring(0, 20) + '...'
        );

        setError('Token refresh successful! Check console for details.');

        // Update the user state to reflect any changes
        setUser(updatedUser);
      } else {
        setError('Token refresh failed. Check console for details.');
      }
    } catch (error) {
      console.error('Token refresh test error:', error);
      setError('Failed to test token refresh');
    } finally {
      setLoading(false);
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
              {loading ? 'Exchanging...' : 'Submit Code'}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <p>Welcome, {user?.name || user?.email}!</p>
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
      )}

      {loading && <div>Loading...</div>}
      {error && (
        <div style={{ color: 'red', fontSize: '12px', marginTop: '8px' }}>
          Error: {error}
        </div>
      )}

      <div style={{ marginTop: '16px' }}>
        {isAuthenticated && (
          <>
            <div
              style={{
                marginBottom: '16px',
                borderBottom: '1px solid #e5e7eb',
                paddingBottom: '8px',
              }}
            >
              <h4
                style={{
                  margin: '0 0 8px 0',
                  fontSize: '14px',
                  fontWeight: 'bold',
                }}
              >
                Basic API Tests
              </h4>
              <button
                onClick={testYahooApi}
                disabled={loading}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  marginBottom: '4px',
                  width: '100%',
                  fontSize: '12px',
                }}
              >
                {loading ? 'Testing...' : 'Test Leagues API'}
              </button>

              <button
                onClick={testTokenRefresh}
                disabled={loading}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#f59e0b',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  marginBottom: '4px',
                  width: '100%',
                  fontSize: '12px',
                }}
              >
                {loading ? 'Refreshing...' : 'Test Token Refresh'}
              </button>
            </div>

            <div
              style={{
                marginBottom: '16px',
                borderBottom: '1px solid #e5e7eb',
                paddingBottom: '8px',
              }}
            >
              <h4
                style={{
                  margin: '0 0 8px 0',
                  fontSize: '14px',
                  fontWeight: 'bold',
                }}
              >
                Fantasy Data Tests
              </h4>
              <button
                onClick={testLeagueDetails}
                disabled={loading}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  marginBottom: '4px',
                  width: '100%',
                  fontSize: '12px',
                }}
              >
                {loading ? 'Testing...' : 'Test League Details'}
              </button>

              <button
                onClick={testRoster}
                disabled={loading}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#8b5cf6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  marginBottom: '4px',
                  width: '100%',
                  fontSize: '12px',
                }}
              >
                {loading ? 'Testing...' : 'Test Team Roster'}
              </button>

              <button
                onClick={testPlayerStats}
                disabled={loading}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#06b6d4',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  marginBottom: '4px',
                  width: '100%',
                  fontSize: '12px',
                }}
              >
                {loading ? 'Testing...' : 'Test Player Stats'}
              </button>

              <button
                onClick={testWaiverWire}
                disabled={loading}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  marginBottom: '4px',
                  width: '100%',
                  fontSize: '12px',
                }}
              >
                {loading ? 'Testing...' : 'Test Waiver Wire'}
              </button>

              <button
                onClick={testTransactions}
                disabled={loading}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#f59e0b',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  marginBottom: '4px',
                  width: '100%',
                  fontSize: '12px',
                }}
              >
                {loading ? 'Testing...' : 'Test Transactions'}
              </button>

              <button
                onClick={testMatchups}
                disabled={loading}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  marginBottom: '4px',
                  width: '100%',
                  fontSize: '12px',
                }}
              >
                {loading ? 'Testing...' : 'Test Matchups'}
              </button>
            </div>
          </>
        )}

        <button
          onClick={() => alert('Test tip!')}
          style={{
            padding: '6px 12px',
            backgroundColor: '#6b7280',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            width: '100%',
            fontSize: '12px',
          }}
        >
          Test Tip (Coming Soon)
        </button>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Popup />);
