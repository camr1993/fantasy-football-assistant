import { extractYahooPlayerId } from '../../utils/yahooPlayerId.ts';
import {
  getRosteredPlayersWithScores,
  fetchNormalizedStatsForPlayers,
  fetchPlayerInjuryStatuses,
} from './dataFetchers.ts';
import { calculateWaiverConfidence } from './confidence.ts';
import { generateWaiverWireReason } from './reasonGenerator.ts';
import type {
  WaiverWirePlayer,
  WaiverWireRecommendation,
  WaiverPlayerWithStats,
} from './types.ts';

/**
 * Get waiver wire recommendations by comparing rostered players to available waiver wire players
 * Returns recommendations to ADD waiver players who have higher weighted scores than rostered players
 */
export async function getWaiverWireRecommendations(
  leagueId: string,
  leagueName: string,
  seasonYear: number,
  currentWeek: number,
  userTeamIds: string[],
  waiverWirePlayers: WaiverWirePlayer[]
): Promise<WaiverWireRecommendation[]> {
  if (userTeamIds.length === 0 || waiverWirePlayers.length === 0) {
    return [];
  }

  // Get rostered players with their scores
  const rosteredPlayers = await getRosteredPlayersWithScores(
    leagueId,
    seasonYear,
    currentWeek,
    userTeamIds
  );

  if (rosteredPlayers.length === 0) {
    return [];
  }

  // Collect all player IDs for normalized stats fetching
  const allPlayerIds = [
    ...waiverWirePlayers
      .filter((p) => p.league_id === leagueId)
      .map((p) => p.player_id),
    ...rosteredPlayers.map((p) => p.player_id),
  ];

  // Fetch normalized stats and injury statuses in parallel
  const [normalizedStatsMap, injuryStatusMap] = await Promise.all([
    fetchNormalizedStatsForPlayers(
      leagueId,
      seasonYear,
      currentWeek,
      allPlayerIds
    ),
    fetchPlayerInjuryStatuses(allPlayerIds),
  ]);

  // Attach normalized stats to rostered players
  for (const rostered of rosteredPlayers) {
    rostered.normalizedStats = normalizedStatsMap.get(rostered.player_id);
  }

  // Group waiver wire players by position with normalized stats
  const waiverByPosition = new Map<string, WaiverPlayerWithStats[]>();
  for (const player of waiverWirePlayers) {
    if (player.league_id !== leagueId) continue;
    if (!waiverByPosition.has(player.position)) {
      waiverByPosition.set(player.position, []);
    }
    const playerWithStats: WaiverPlayerWithStats = {
      ...player,
      normalizedStats: normalizedStatsMap.get(player.player_id),
    };
    waiverByPosition.get(player.position)!.push(playerWithStats);
  }

  const recommendations: WaiverWireRecommendation[] = [];

  // Compare each rostered player to waiver wire players at the same position
  for (const rostered of rosteredPlayers) {
    const positionWaiverPlayers = waiverByPosition.get(rostered.position);
    if (!positionWaiverPlayers || positionWaiverPlayers.length === 0) {
      continue;
    }

    // Find waiver wire players with higher weighted scores
    for (const waiverPlayer of positionWaiverPlayers) {
      // Determine if waiver player should be recommended over rostered player
      let shouldRecommend = false;

      if (rostered.weighted_score === null) {
        // Rostered player has no scores - recommend waiver player unless it's week 1 or 2
        shouldRecommend = currentWeek > 2;
      } else {
        // Compare weighted scores
        shouldRecommend = waiverPlayer.weighted_score > rostered.weighted_score;
      }

      if (shouldRecommend) {
        const reason = generateWaiverWireReason(waiverPlayer, rostered);
        const confidence = calculateWaiverConfidence(
          waiverPlayer.weighted_score,
          rostered.weighted_score ?? 0
        );
        recommendations.push({
          waiver_player_id: waiverPlayer.player_id,
          waiver_yahoo_player_id: extractYahooPlayerId(
            waiverPlayer.yahoo_player_id
          ),
          waiver_player_name: waiverPlayer.name,
          waiver_player_team: waiverPlayer.team,
          waiver_player_position: waiverPlayer.position,
          waiver_weighted_score: waiverPlayer.weighted_score,
          waiver_injury_status: injuryStatusMap.get(waiverPlayer.player_id),
          rostered_player_id: rostered.player_id,
          rostered_yahoo_player_id: rostered.yahoo_player_id,
          rostered_player_name: rostered.name,
          rostered_player_team: rostered.team,
          rostered_weighted_score: rostered.weighted_score ?? 0,
          rostered_injury_status: injuryStatusMap.get(rostered.player_id),
          league_id: leagueId,
          league_name: leagueName,
          team_id: rostered.team_id,
          team_name: rostered.team_name,
          recommendation: 'ADD',
          reason,
          confidence,
        });
      }
    }
  }

  // Sort by score difference (biggest improvements first)
  // Null rostered scores (no data) are treated as high priority recommendations
  recommendations.sort((a, b) => {
    const aRosteredHasNoData = a.rostered_weighted_score === 0;
    const bRosteredHasNoData = b.rostered_weighted_score === 0;

    // Prioritize recommendations where rostered player has no data
    if (aRosteredHasNoData && !bRosteredHasNoData) return -1;
    if (!aRosteredHasNoData && bRosteredHasNoData) return 1;

    const diffA = a.waiver_weighted_score - a.rostered_weighted_score;
    const diffB = b.waiver_weighted_score - b.rostered_weighted_score;
    return diffB - diffA;
  });

  return recommendations;
}

