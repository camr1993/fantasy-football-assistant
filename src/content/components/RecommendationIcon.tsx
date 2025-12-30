import React, { useState } from 'react';
import type { PlayerRecommendations } from '../../types/tips';
import { styles } from '../styles';
import { getUserTeams, getYahooLeagueIdFromCache } from '../utils/userTeams';
import { RecommendationModal } from './RecommendationModal';

interface RecommendationIconProps {
  recommendations: PlayerRecommendations;
  playerName: string;
}

export function RecommendationIcon({
  recommendations,
  playerName,
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

  // Determine icon and color based on recommendation type
  let icon = '💡';
  let bgColor = '#7c3aed'; // Default purple

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
        title="View FantasyEdge recommendations"
      >
        {icon}
      </button>

      {isModalOpen && (
        <RecommendationModal
          recommendations={recommendations}
          playerName={playerName}
          yahooLeagueId={yahooLeagueId}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </>
  );
}

