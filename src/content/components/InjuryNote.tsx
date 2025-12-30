import React from 'react';
import { styles } from '../styles';
import { getInjuryStatusLabel } from '../utils/injuryStatus';

interface InjuryNoteProps {
  status: string;
  playerName: string;
}

export function InjuryNote({ status, playerName }: InjuryNoteProps) {
  return (
    <div style={styles.injuryNote}>
      <span style={styles.injuryIcon}>⚠️</span>
      <span>
        <strong>{playerName}</strong> is listed as{' '}
        <strong>{getInjuryStatusLabel(status)}</strong>. Check injury reports
        before making lineup decisions.
      </span>
    </div>
  );
}

