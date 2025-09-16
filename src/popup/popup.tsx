import { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { User } from '../types/api';
import { apiClient } from '../api/client';

function Popup() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [authCode, setAuthCode] = useState('');

  useEffect(() => {
    getUsers();
    checkAuthStatus();
  }, []);

  async function getUsers() {
    setLoading(true);
    setError(null);

    const response = await apiClient.getTestUsers();

    if (response.success && response.data) {
      setUsers(response.data.users);
    } else {
      setError(response.error?.error || 'Failed to fetch users');
      setUsers([]);
    }

    setLoading(false);
  }

  async function checkAuthStatus() {
    // Check if user is already authenticated
    // This could be stored in chrome.storage.local or checked via API
    try {
      const result = await chrome.storage.local.get(['yahoo_user']);
      if (result.yahoo_user) {
        setUser(result.yahoo_user);
        setIsAuthenticated(true);
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
        'https://gauanzpirzdhbfbctlkg.supabase.co/functions/v1/oath/auth',
        {
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );
      const data = await response.json();
      console.log('data', data);

      if (data.auth_url) {
        // Open OAuth flow in a new tab
        chrome.tabs.create({ url: data.auth_url });
        // Clear any previous error
        setError(null);
      } else {
        setError('Failed to get OAuth URL');
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

      const response = await fetch(
        'https://gauanzpirzdhbfbctlkg.supabase.co/functions/v1/oath/callback',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            code: authCode.trim(),
            state: 'fantasy-football-assistant',
          }),
        }
      );

      const data = await response.json();
      console.log('Token exchange response:', data);

      if (data.success) {
        setUser(data.user);
        setIsAuthenticated(true);
        setError(null);
        setAuthCode('');
        // Store user data in chrome storage
        chrome.storage.local.set({ yahoo_user: data.user });
      } else {
        setError(data.error || 'Token exchange failed');
      }
    } catch (error) {
      console.error('Token exchange error:', error);
      setError('Failed to exchange code for tokens');
    } finally {
      setLoading(false);
    }
  }

  function signOut() {
    chrome.storage.local.remove(['yahoo_user']);
    setUser(null);
    setIsAuthenticated(false);
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
        <button onClick={() => alert('Test tip!')}>Test</button>

        {users.length > 0 && (
          <div style={{ marginTop: '8px' }}>
            <h4>Users:</h4>
            {users.map((user) => (
              <div key={user.id} style={{ fontSize: '12px' }}>
                {user.name}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Popup />);
