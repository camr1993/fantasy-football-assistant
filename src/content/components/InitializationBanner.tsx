import React from 'react';
import { bannerStyles } from '../styles';
import type { InitializationProgress } from '../types';

interface InitializationBannerProps {
  progress: InitializationProgress;
  rosterUrl: string | null;
  onDismiss: () => void;
}

export function InitializationBanner({
  progress,
  rosterUrl,
  onDismiss,
}: InitializationBannerProps) {
  const percentage = Math.round(progress.percentage || 0);

  if (progress.status === 'idle') return null;

  return (
    <div style={bannerStyles.container}>
      <style>
        {`
          @keyframes fantasy-edge-spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
      <div style={bannerStyles.content}>
        {progress.status === 'initializing' && (
          <>
            <div style={bannerStyles.spinnerContainer}>
              <div style={bannerStyles.spinner} />
            </div>
            <div style={bannerStyles.textContainer}>
              <span style={bannerStyles.title}>
                FantasyEdge is setting up your league data...
              </span>
              <span style={bannerStyles.step}>{progress.currentStep}</span>
            </div>
            <div style={bannerStyles.progressContainer}>
              <div style={bannerStyles.progressBar}>
                <div
                  style={{
                    ...bannerStyles.progressFill,
                    width: `${percentage}%`,
                  }}
                />
              </div>
              <span style={bannerStyles.progressText}>{percentage}%</span>
            </div>
          </>
        )}

        {progress.status === 'ready' && (
          <>
            <span style={bannerStyles.successIcon}>✓</span>
            <span style={bannerStyles.successText}>
              FantasyEdge is ready! Refresh your{' '}
              {rosterUrl ? (
                <a href={rosterUrl} style={bannerStyles.rosterLink}>
                  roster page
                </a>
              ) : (
                'roster page'
              )}{' '}
              to see recommendations.
            </span>
            <button style={bannerStyles.dismissButton} onClick={onDismiss}>
              ×
            </button>
          </>
        )}

        {progress.status === 'error' && (
          <>
            <span style={bannerStyles.errorIcon}>⚠</span>
            <span style={bannerStyles.errorText}>
              FantasyEdge setup encountered an error. Please try again later.
            </span>
            <button style={bannerStyles.dismissButton} onClick={onDismiss}>
              ×
            </button>
          </>
        )}
      </div>
    </div>
  );
}

