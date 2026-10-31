import React, { useState } from 'react';
import type { PlayerRecommendations } from '../../types/tips';
import { styles, iconStateStyles } from '../styles';
import { getUserTeams, getYahooLeagueIdFromCache } from '../utils/userTeams';
import { RecommendationModal } from './RecommendationModal';
import { AllClearModal } from './AllClearModal';

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

  // Determine icon and color based on recommendation type
  let icon = '💡';
  let bgColor = '#7c3aed'; // Default purple
  let title = 'View FantasyEdge recommendations';

  if (hasStartBench) {
    if (recommendations.startBench!.recommendation === 'START') {
      icon = '▲';
      bgColor = '#22c55e'; // Green
    } else {
      icon = '▼';
      bgColor = '#ef4444'; // Red
    }
  } else if (hasWaiverUpgrade) {
    icon = '🔄';
    bgColor = '#f59e0b'; // Orange/amber
  } else {
    // Nothing to change - say so rather than showing nothing at all
    icon = '✓';
    bgColor = '#9ca3af'; // Muted grey, so it reads as "fine" not "act"
    title = 'No changes needed';
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
      >
        {icon}
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
