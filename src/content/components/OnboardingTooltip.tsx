import React, { useEffect, useState, useRef } from 'react';

interface OnboardingTooltipProps {
  targetElement: HTMLElement;
  onDismiss: () => void;
}

export function OnboardingTooltip({
  targetElement,
  onDismiss,
}: OnboardingTooltipProps) {
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updatePosition = () => {
      const rect = targetElement.getBoundingClientRect();
      const tooltipWidth = 320;

      // Position tooltip to the right of the icon, vertically centered
      let left = rect.right + 12;
      let top = rect.top + rect.height / 2;

      // If tooltip would go off screen to the right, position it to the left
      if (left + tooltipWidth > window.innerWidth - 20) {
        left = rect.left - tooltipWidth - 12;
      }

      // Adjust vertical position to account for tooltip height
      if (tooltipRef.current) {
        const tooltipHeight = tooltipRef.current.offsetHeight;
        top = top - tooltipHeight / 2;

        // Keep within viewport bounds
        if (top < 10) top = 10;
        if (top + tooltipHeight > window.innerHeight - 10) {
          top = window.innerHeight - tooltipHeight - 10;
        }
      }

      setPosition({ top, left });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [targetElement]);

  // Handle click outside to dismiss
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target as Node) &&
        !targetElement.contains(e.target as Node)
      ) {
        onDismiss();
      }
    };

    // Delay adding listener to prevent immediate dismissal
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [onDismiss, targetElement]);

  return (
    <>
      {/* Backdrop overlay */}
      <div style={styles.backdrop} />

      {/* Spotlight on target element */}
      <div
        style={{
          ...styles.spotlight,
          top: targetElement.getBoundingClientRect().top - 4,
          left: targetElement.getBoundingClientRect().left - 4,
          width: targetElement.offsetWidth + 8,
          height: targetElement.offsetHeight + 8,
        }}
      />

      {/* Tooltip */}
      <div ref={tooltipRef} style={{ ...styles.tooltip, ...position }}>
        <div style={styles.header}>
          <span style={styles.badge}>Welcome to FantasyEdge!</span>
          <button style={styles.closeButton} onClick={onDismiss}>
            ×
          </button>
        </div>

        <div style={styles.content}>
          <p style={styles.intro}>
            These icons show personalized recommendations for your roster:
          </p>

          <div style={styles.iconList}>
            <div style={styles.iconRow}>
              <span style={{ ...styles.icon, backgroundColor: '#22c55e' }}>
                ▲
              </span>
              <div>
                <strong style={styles.iconLabel}>START</strong>
                <span style={styles.iconDesc}>
                  {' '}
                  — This player should be in your starting lineup
                </span>
              </div>
            </div>

            <div style={styles.iconRow}>
              <span style={{ ...styles.icon, backgroundColor: '#ef4444' }}>
                ▼
              </span>
              <div>
                <strong style={styles.iconLabel}>BENCH</strong>
                <span style={styles.iconDesc}>
                  {' '}
                  — Consider benching this player this week
                </span>
              </div>
            </div>

            <div style={styles.iconRow}>
              <span style={{ ...styles.icon, backgroundColor: '#f59e0b' }}>
                🔄
              </span>
              <div>
                <strong style={styles.iconLabel}>WAIVER</strong>
                <span style={styles.iconDesc}>
                  {' '}
                  — A better player is available on waivers
                </span>
              </div>
            </div>
          </div>

          <p style={styles.hint}>
            <strong>Tip:</strong> Click any icon to see detailed reasoning and
            analysis.
          </p>
        </div>

        <button style={styles.gotItButton} onClick={onDismiss}>
          Got it!
        </button>
      </div>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    zIndex: 999997,
  },
  spotlight: {
    position: 'fixed',
    borderRadius: '50%',
    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6)',
    zIndex: 999998,
    pointerEvents: 'none',
  },
  tooltip: {
    position: 'fixed',
    width: '320px',
    backgroundColor: '#1a1a2e',
    borderRadius: '12px',
    boxShadow:
      '0 20px 40px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.1)',
    zIndex: 999999,
    overflow: 'hidden',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 16px 0 16px',
  },
  badge: {
    backgroundColor: '#7c3aed',
    color: 'white',
    padding: '6px 12px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: 600,
  },
  closeButton: {
    background: 'none',
    border: 'none',
    color: '#9ca3af',
    fontSize: '24px',
    cursor: 'pointer',
    padding: '0 4px',
    lineHeight: 1,
  },
  content: {
    padding: '16px',
    color: '#e5e7eb',
  },
  intro: {
    margin: '0 0 16px 0',
    fontSize: '14px',
    lineHeight: 1.5,
    color: '#d1d5db',
  },
  iconList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  iconRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
  },
  icon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    color: 'white',
    fontSize: '12px',
    fontWeight: 'bold',
    flexShrink: 0,
  },
  iconLabel: {
    color: '#f3f4f6',
    fontSize: '13px',
  },
  iconDesc: {
    color: '#9ca3af',
    fontSize: '13px',
  },
  hint: {
    marginTop: '16px',
    marginBottom: 0,
    padding: '12px',
    backgroundColor: 'rgba(124, 58, 237, 0.15)',
    borderRadius: '8px',
    fontSize: '13px',
    color: '#c4b5fd',
    lineHeight: 1.4,
  },
  gotItButton: {
    width: '100%',
    padding: '14px',
    backgroundColor: '#7c3aed',
    color: 'white',
    border: 'none',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
};


