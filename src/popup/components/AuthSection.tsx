import React from 'react';

interface AuthSectionProps {
  loading: boolean;
  authCode: string;
  onAuthCodeChange: (code: string) => void;
  onInitiateOAuth: () => void;
  onSubmitCode: () => void;
}

export function AuthSection({
  loading,
  authCode,
  onAuthCodeChange,
  onInitiateOAuth,
  onSubmitCode,
}: AuthSectionProps) {
  return (
    <div>
      <p>Sign in with Yahoo to access your fantasy data</p>
      <button
        onClick={onInitiateOAuth}
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
          onChange={(e) => onAuthCodeChange(e.target.value)}
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
          onClick={onSubmitCode}
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
  );
}

