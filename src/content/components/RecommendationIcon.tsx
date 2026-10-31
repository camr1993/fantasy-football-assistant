import React, { useState } from 'react';
import type { PlayerRecommendations } from '../../types/tips';
import { styles, iconStateStyles } from '../styles';
import { getUserTeams, getYahooLeagueIdFromCache } from '../utils/userTeams';
import { RecommendationModal } from './RecommendationModal';
import { AllClearModal } from './AllClearModal';
import { IconGlyph, type GlyphKind } from './IconGlyph';

interface RecommendationIconProps {
  recommendations: PlayerRecommendations;
  playerName: string;
  /** Tips are being refreshed - show a spinner instead of a verdict */
  isLoading?: boolean;
  /** The player's roster slot, used to word the all-clear message */
  slot?: string;
}

export function RecommendationIcon({
  recommendations,
  playerName,
  isLoading = false,
  slot,
}: RecommendationIconProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [yahooLeagueId, setYahooLeagueId] = useState<string | null>(null);

  const hasStartBench = !!recommendations.startBench;
  const hasWaiverUpgrade =
    recommendations.waiverUpgrades && recommendations.waiverUpgrades.length > 0;

  // Look up the Yahoo league ID from cached user teams
  const leagueId =
    recommendations.startBench?.league_id ||
    recommendations.waiverUpgrades?.[0]?.league_id;

  // Load yahoo_league_id when opening modal
  const handleOpenModal = async () => {
    // Ensure user teams are loaded
    await getUserTeams();
    if (leagueId) {
      const yLeagueId = getYahooLeagueIdFromCache(leagueId);
      setYahooLeagueId(yLeagueId);
    }
    setIsModalOpen(true);
  };

  const hasAnyRecommendation = hasStartBench || hasWaiverUpgrade;

  // Determine glyph and colour based on recommendation type
  let glyph: GlyphKind = 'clear';
  let bgColor = '#9ca3af'; // Muted grey, so it reads as "fine" not "act"
  let title = 'No changes needed';

  if (hasStartBench) {
    const isStart = recommendations.startBench!.recommendation === 'START';
    glyph = isStart ? 'start' : 'bench';
    bgColor = isStart ? '#16a34a' : '#dc2626';
    title = isStart
      ? 'FantasyEdge suggests starting this player'
      : 'FantasyEdge suggests benching this player';
  } else if (hasWaiverUpgrade) {
    glyph = 'waiver';
    bgColor = '#d97706';
    title = 'Better options are available on the waiver wire';
  }

  if (isLoading) {
    return (
      <span
        style={{ ...styles.iconButton, backgroundColor: '#9ca3af' }}
        title="Loading FantasyEdge recommendations…"
        aria-label="Loading recommendations"
        role="status"
      >
        <span style={iconStateStyles.spinner} />
      </span>
    );
  }

  return (
    <>
      <button
        style={{
          ...styles.iconButton,
          backgroundColor: bgColor,
        }}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          handleOpenModal();
        }}
        title={title}
        aria-label={title}
      >
        <IconGlyph kind={glyph} />
      </button>

      {isModalOpen &&
        (hasAnyRecommendation ? (
          <RecommendationModal
            recommendations={recommendations}
            playerName={playerName}
            yahooLeagueId={yahooLeagueId}
            onClose={() => setIsModalOpen(false)}
          />
        ) : (
          <AllClearModal
            playerName={playerName}
            slot={slot}
            onClose={() => setIsModalOpen(false)}
          />
        ))}
    </>
  );
}
