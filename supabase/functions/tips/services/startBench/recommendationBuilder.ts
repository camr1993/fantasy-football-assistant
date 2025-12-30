import type { StartBenchRecommendation, PlayerGroup } from './types.ts';
import { calculateConfidence } from './confidence.ts';

export interface ComparisonInfo {
  score: number;
  name: string;
}

/**
 * Create a recommendation object from player data and comparison info
 */
export function createRecommendation(
  player: PlayerGroup,
  recommendation: 'START' | 'BENCH',
  reason: string,
  comparison: ComparisonInfo,
  injuryStatus?: string
): StartBenchRecommendation {
  const confidence = calculateConfidence(
    player.weighted_score,
    comparison.score,
    recommendation
  );

  return {
    player_id: player.player_id,
    yahoo_player_id: player.yahoo_player_id,
    name: player.name,
    position: player.position,
    team: player.team,
    slot: player.slot,
    weighted_score: player.weighted_score,
    comparison_score: comparison.score,
    comparison_name: comparison.name,
    league_id: player.league_id,
    league_name: player.league_name,
    team_id: player.team_id,
    team_name: player.team_name,
    recommendation,
    reason,
    confidence,
    injury_status: injuryStatus,
  };
}

