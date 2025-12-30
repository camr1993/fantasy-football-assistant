import React from 'react';
import type { InitializationProgress } from '../types';

interface InitializationStatusProps {
  progress: InitializationProgress;
  rosterUrl: string | null;
}

export function InitializationStatus({
  progress,
  rosterUrl,
}: InitializationStatusProps) {
  if (progress.status === 'initializing') {
    return (
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
              width: `${progress.percentage}%`,
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
          {progress.currentStep}
        </p>
        <p
          style={{
            fontSize: '11px',
            color: '#9ca3af',
            margin: '4px 0 0 0',
          }}
        >
          {Math.round(progress.percentage)}% complete
        </p>
      </div>
    );
  }

  if (progress.status === 'ready') {
    return (
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
          Your league data is ready! Visit your{' '}
          {rosterUrl ? (
            <a
              href={rosterUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: '#065f46',
                fontWeight: 600,
                textDecoration: 'underline',
              }}
            >
              roster page
            </a>
          ) : (
            'Yahoo Fantasy'
          )}{' '}
          to see tips.
        </span>
      </div>
    );
  }

  if (progress.status === 'error') {
    return (
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
          {progress.errorMessage || 'An error occurred during setup'}
        </p>
      </div>
    );
  }

  return null;
}

