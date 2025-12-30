import React from 'react';
import type { PlayerRecommendations } from '../../types/tips';
import { styles } from '../styles';
import { shouldShowInjuryWarning } from '../utils/injuryStatus';
import { getPlayerSearchUrl } from '../utils/playerSearch';
import { ConfidenceIndicator } from './ConfidenceIndicator';
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

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h3 style={styles.title}>
            💡 Recommendations for{' '}
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
          </h3>
          <button style={styles.closeButton} onClick={onClose}>
            ×
          </button>
        </div>

        <div style={styles.content}>
          {/* Start/Bench Recommendation */}
          {startBench && (
            <div style={styles.section}>
              <div style={styles.rosterHeader}>
                <h4 style={styles.sectionTitle}>
                  {startBench.recommendation === 'START' ? '▲' : '▼'} Roster
                  Suggestions
                </h4>
                <div
                  style={{
                    ...styles.badge,
                    backgroundColor:
                      startBench.recommendation === 'START'
                        ? '#22c55e'
                        : '#ef4444',
                  }}
                >
                  {startBench.recommendation}
                </div>
              </div>
              <div style={styles.rosterCard}>
                <ConfidenceIndicator
                  level={startBench.confidence.level}
                  label={startBench.confidence.label}
                  type={
                    startBench.recommendation === 'START' ? 'start' : 'bench'
                  }
                />
                <p
                  style={{
                    ...styles.reason,
                    marginTop: '0px',
                  }}
                >
                  {startBench.reason}
                </p>
                {shouldShowInjuryWarning(startBench.injury_status) && (
                  <InjuryNote
                    status={startBench.injury_status!}
                    playerName={startBench.name}
                  />
                )}
                <p style={styles.meta}>
                  League: {startBench.league_name} • Team:{' '}
                  {startBench.team_name}
                </p>
              </div>
            </div>
          )}

          {/* Waiver Wire Upgrades */}
          {waiverUpgrades && waiverUpgrades.length > 0 && (
            <div style={styles.section}>
              <div style={styles.rosterHeader}>
                <h4 style={styles.sectionTitle}>🔄 Waiver Wire Upgrades</h4>
                <span style={styles.addBadge}>ADD</span>
              </div>
              {waiverUpgrades.map((upgrade, index) => (
                <div key={index} style={styles.upgradeCard}>
                  <div style={styles.upgradeHeader}>
                    <span style={styles.playerName}>
                      {yahooLeagueId ? (
                        <a
                          href={getPlayerSearchUrl(
                            yahooLeagueId,
                            upgrade.waiver_player_name
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={styles.playerLink}
                        >
                          {upgrade.waiver_player_name}
                        </a>
                      ) : (
                        upgrade.waiver_player_name
                      )}{' '}
                      ({upgrade.waiver_player_team})
                    </span>
                  </div>
                  <ConfidenceIndicator
                    level={upgrade.confidence.level}
                    label={upgrade.confidence.label}
                    type="add"
                  />
                  <p style={styles.reason}>{upgrade.reason}</p>
                  {shouldShowInjuryWarning(upgrade.waiver_injury_status) && (
                    <InjuryNote
                      status={upgrade.waiver_injury_status!}
                      playerName={upgrade.waiver_player_name}
                    />
                  )}
                  <p style={styles.meta}>
                    League: {upgrade.league_name} • Team: {upgrade.team_name}
                  </p>
                </div>
              ))}
            </div>
          )}

          {!startBench && (!waiverUpgrades || waiverUpgrades.length === 0) && (
            <p style={styles.noRecs}>
              No recommendations available for this player.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

