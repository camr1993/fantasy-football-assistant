import React from 'react';
import type { User } from '../types';

interface UserHeaderProps {
  user: User | null;
  onSignOut: () => void;
}

export function UserHeader({ user, onSignOut }: UserHeaderProps) {
  return (
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
        onClick={onSignOut}
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
  );
}

