import React from 'react';
import type { PlayerRecommendations } from '../../types/tips';
import { styles, comparisonStyles } from '../styles';
import { shouldShowInjuryWarning } from '../utils/injuryStatus';
import { getPlayerSearchUrl } from '../utils/playerSearch';
import { buildComparisonView } from '../utils/buildComparison';
import { ComparisonList } from './ComparisonList';
import { InjuryNote } from './InjuryNote';

interface RecommendationModalProps {
  recommendations: PlayerRecommendations;
  playerName: string;
  yahooLeagueId: string | null;
  onClose: () => void;
}

export function RecommendationModal({
  recommendations,
  playerName,
  yahooLeagueId,
  onClose,
}: RecommendationModalProps) {
  const { startBench, waiverUpgrades } = recommendations;
  const hasAny =
    !!startBench || !!(waiverUpgrades && waiverUpgrades.length > 0);

  if (!hasAny) {
    return (
      <div style={styles.overlay} onClick={onClose}>
        <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
          <div style={styles.header}>
            <h3 style={styles.title}>{playerName}</h3>
            <button style={styles.closeButton} onClick={onClose}>
              ×
            </button>
          </div>
          <div style={styles.content}>
            <p style={styles.noRecs}>
              No recommendations available for this player.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const view = buildComparisonView(recommendations, playerName);
  const current = view.entries[view.currentIndex];

  // Prefer whichever injury note belongs to the move being recommended
  const injuredEntry = view.entries.find(
    (e) => e.injuryStatus && shouldShowInjuryWarning(e.injuryStatus)
  );

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h3 style={styles.title}>
            {yahooLeagueId ? (
              <a
                href={getPlayerSearchUrl(yahooLeagueId, playerName)}
                target="_blank"
                rel="noopener noreferrer"
                style={styles.titlePlayerLink}
              >
                {playerName}
              </a>
            ) : (
              playerName
            )}
            {view.position ? ` · ${view.position}` : ''}
          </h3>
          <button style={styles.closeButton} onClick={onClose}>
            ×
          </button>
        </div>

        <div style={styles.content}>
          {view.headline && (
            <p
              style={
                view.isMarginal
                  ? comparisonStyles.headlineMarginal
                  : comparisonStyles.headline
              }
            >
              {view.headline}
            </p>
          )}

          <p style={comparisonStyles.subhead}>
            {view.leagueName}
            {view.teamName ? ` · ${view.teamName}` : ''}
          </p>

          <ComparisonList view={view} yahooLeagueId={yahooLeagueId} />

          {view.factors.length > 0 && !view.isMarginal && (
            <div style={comparisonStyles.factorsRow}>
              <span style={comparisonStyles.factorsLabel}>Why:</span>
              {view.factors.map((factor) => (
                <span key={factor} style={comparisonStyles.chip}>
                  {factor} ↑
                </span>
              ))}
            </div>
          )}

          {view.isMarginal && (
            <p style={comparisonStyles.marginalNote}>
              The difference here is small enough that either option is
              reasonable. Worth a look if you were already considering a change,
              but not worth using a waiver claim on its own.
            </p>
          )}

          {injuredEntry && (
            <InjuryNote
              status={injuredEntry.injuryStatus!}
              playerName={injuredEntry.name}
            />
          )}

          {startBench?.reason && !view.isMarginal && (
            <p style={comparisonStyles.marginalNote}>{startBench.reason}</p>
          )}

          {!startBench && current && (
            <p style={comparisonStyles.marginalNote}>
              {current.name} is in the right spot for your roster as it stands.
              The players above are free agents who grade out higher, so picking
              one up would mean dropping someone.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
