import React from 'react';
import { serviceNoticeStyles } from '../styles';

export type ServiceNoticeKind = 'reauth';

interface ServiceNoticeBannerProps {
  kind: ServiceNoticeKind;
  onDismiss: () => void;
}

const NOTICES: Record<
  ServiceNoticeKind,
  { title: string; body: React.ReactNode }
> = {
  reauth: {
    title: 'Reconnect your Yahoo account',
    body: (
      <>
        FantasyEdge needs you to sign in with Yahoo again to keep showing
        recommendations. Open the FantasyEdge extension and sign in - it only
        takes a moment.
      </>
    ),
  },
};

/**
 * Notice shown at the top of Yahoo Fantasy pages when the extension needs
 * something from the user. Dismissing hides it for that browser profile.
 */
export function ServiceNoticeBanner({
  kind,
  onDismiss,
}: ServiceNoticeBannerProps) {
  const notice = NOTICES[kind];

  return (
    <div style={serviceNoticeStyles.container}>
      <div style={serviceNoticeStyles.content}>
        <span style={serviceNoticeStyles.icon}>⚠</span>
        <div style={serviceNoticeStyles.textContainer}>
          <span style={serviceNoticeStyles.title}>{notice.title}</span>
          <span style={serviceNoticeStyles.body}>{notice.body}</span>
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
