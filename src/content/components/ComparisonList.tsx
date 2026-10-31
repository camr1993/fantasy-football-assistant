import React from 'react';
import { comparisonStyles } from '../styles';
import { getPlayerSearchUrl } from '../utils/playerSearch';
import type { ComparisonEntry, ComparisonView } from '../utils/buildComparison';

interface ComparisonListProps {
  view: ComparisonView;
  yahooLeagueId: string | null;
}

const SOURCE_LABELS: Record<ComparisonEntry['source'], string> = {
  current: 'you',
  bench: 'your bench',
  starting: 'starting',
  free_agent: 'free agent',
};

const ACTION_COLORS: Record<string, string> = {
  START: '#22c55e',
  ADD: '#f59e0b',
};

function formatGap(gap: number): string {
  const rounded = Math.round(gap * 100) / 100;
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(2)}`;
}

/**
 * Every option at a roster spot, ranked, with the user's player among them.
 *
 * Showing the gap rather than only a confidence label is what separates an
 * obvious swap from a coin flip - both previously read as a confident green
 * "Upgrade".
 */
export function ComparisonList({ view, yahooLeagueId }: ComparisonListProps) {
  const { entries } = view;

  // Scale bars across the full range on show, so differences stay visible
  // even when every option clusters together
  const scores = entries.map((e) => e.score);
  const max = Math.max(...scores);
  const min = Math.min(...scores, 0);
  const span = max - min || 1;

  return (
    <div>
      {entries.map((entry, index) => {
        const isCurrent = entry.source === 'current';
        const width = `${Math.max(4, ((entry.score - min) / span) * 100)}%`;
        const barStyle = isCurrent
          ? comparisonStyles.barCurrent
          : (entry.gap ?? 0) > 0
            ? comparisonStyles.barBetter
            : comparisonStyles.bar;

        return (
          <div
            key={`${entry.name}-${index}`}
            style={{
              ...comparisonStyles.row,
              ...(isCurrent ? comparisonStyles.rowCurrent : {}),
            }}
          >
            <div style={comparisonStyles.nameCell}>
              {yahooLeagueId && !isCurrent ? (
                <a
                  href={getPlayerSearchUrl(yahooLeagueId, entry.name)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={comparisonStyles.nameLink}
                >
                  {entry.name}
                </a>
              ) : (
                <span style={comparisonStyles.name}>{entry.name}</span>
              )}
              {entry.team && (
                <span style={comparisonStyles.teamTag}>{entry.team}</span>
              )}
            </div>

            <span style={comparisonStyles.sourceTag}>
              {SOURCE_LABELS[entry.source]}
            </span>

            <div style={{ ...barStyle, width }} />

            {entry.gap !== undefined ? (
              <span
                style={
                  entry.gap > 0
                    ? comparisonStyles.gap
                    : comparisonStyles.gapMuted
                }
              >
                {formatGap(entry.gap)}
              </span>
            ) : (
              <span style={comparisonStyles.gapMuted}>—</span>
            )}

            {entry.action ? (
              <span
                style={{
                  ...comparisonStyles.actionPill,
                  backgroundColor: ACTION_COLORS[entry.action],
                }}
              >
                {entry.action}
              </span>
            ) : (
              <span />
            )}
          </div>
        );
      })}
    </div>
  );
}
