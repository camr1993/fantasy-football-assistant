import { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { User } from '../types/api';
import { apiClient } from '../api/client';

function Popup() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getUsers();
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
  return (
    <div style={{ padding: '1rem', width: '200px' }}>
      <h3>Fantasy Assistant</h3>
      <button onClick={() => alert('Test tip!')}>Test</button>

      {loading && <div>Loading...</div>}
      {error && <div style={{ color: 'red' }}>Error: {error}</div>}

      <div>
        {users.map((user) => (
          <div key={user.id}>{user.name}</div>
        ))}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Popup />);
