import React from 'react';
import { styles, allClearStyles } from '../styles';

interface AllClearModalProps {
  playerName: string;
  slot?: string;
  onClose: () => void;
}

const BENCH_SLOTS = ['BN', 'BENCH', 'IR'];

/**
 * Shown for a rostered player we have no suggestions for. The absence of a
 * tip is itself useful information, so say so explicitly rather than leaving
 * the user wondering whether the extension simply failed to load.
 */
export function AllClearModal({
  playerName,
  slot,
  onClose,
}: AllClearModalProps) {
  const isBenched = BENCH_SLOTS.includes((slot || '').toUpperCase());

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h3 style={styles.title}>✅ No changes needed</h3>
          <button style={styles.closeButton} onClick={onClose}>
            ×
          </button>
        </div>

        <div style={styles.content}>
          <div style={allClearStyles.card}>
            <span style={allClearStyles.icon}>👍</span>
            <div>
              <p style={allClearStyles.heading}>
                {isBenched
                  ? `${playerName} is fine on your bench`
                  : `${playerName} is a good start this week`}
              </p>
              <p style={allClearStyles.body}>
                {isBenched
                  ? 'Nobody on your bench or the waiver wire scores high enough to move into your lineup ahead of your current starters.'
                  : 'Nobody on your bench or the waiver wire scores higher at this position, so leaving the lineup as-is is the best move.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
