import React from 'react';
import { styles } from '../styles';

interface ConfidenceIndicatorProps {
  level: 1 | 2 | 3;
  label: string;
  type: 'start' | 'bench' | 'add';
}

/**
 * Get color based on confidence level and recommendation type
 */
function getConfidenceColor(
  level: 1 | 2 | 3,
  type: 'start' | 'bench' | 'add'
): string {
  if (type === 'bench') {
    // Red shades for bench
    const colors = { 1: '#fca5a5', 2: '#ef4444', 3: '#dc2626' };
    return colors[level];
  } else {
    // Green shades for start/add
    const colors = { 1: '#86efac', 2: '#22c55e', 3: '#16a34a' };
    return colors[level];
  }
}

export function ConfidenceIndicator({
  level,
  label,
  type,
}: ConfidenceIndicatorProps) {
  const color = getConfidenceColor(level, type);

  return (
    <div style={styles.strengthContainer}>
      <div style={styles.strengthDots}>
        {[1, 2, 3].map((dot) => (
          <span
            key={dot}
            style={{
              ...styles.strengthDot,
              backgroundColor: dot <= level ? color : '#e5e7eb',
            }}
          />
        ))}
      </div>
      <span style={{ ...styles.strengthLabel, color }}>{label}</span>
    </div>
  );
}

