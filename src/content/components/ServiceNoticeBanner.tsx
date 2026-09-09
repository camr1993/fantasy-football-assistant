import React from 'react';
import { serviceNoticeStyles } from '../styles';

interface ServiceNoticeBannerProps {
  onDismiss: () => void;
}

/**
 * Temporary notice shown to signed-in users while Yahoo API access is
 * unavailable. Dismissing it hides it permanently on that browser profile.
 */
export function ServiceNoticeBanner({ onDismiss }: ServiceNoticeBannerProps) {
  return (
    <div style={serviceNoticeStyles.container}>
      <div style={serviceNoticeStyles.content}>
        <span style={serviceNoticeStyles.icon}>⚠</span>
        <div style={serviceNoticeStyles.textContainer}>
          <span style={serviceNoticeStyles.title}>
            FantasyEdge recommendations are paused
          </span>
          <span style={serviceNoticeStyles.body}>
            Yahoo now requires approval for Fantasy Sports API access, and ours
            is pending. Recommendations will return once access is restored -
            nothing is wrong with your account or your data.
          </span>
        </div>
        <button
          style={serviceNoticeStyles.dismissButton}
          onClick={onDismiss}
          aria-label="Dismiss notice"
        >
          ×
        </button>
      </div>
    </div>
  );
}
