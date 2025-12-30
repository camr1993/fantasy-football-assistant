import {
  getLeagueRosterSlots,
  getStartingSlotsForPosition,
  isFlexSlot,
} from './rosterSlots.ts';
import {
  fetchRosterEntries,
  fetchRosterScores,
  fetchPlayerStats,
  fetchPlayerInjuries,
  fetchByeWeekPlayerIds,
  fetchNormalizedStats,
} from './dataFetchers.ts';
import {
  generateStartReason,
  generateBenchReason,
  generateInjuryReason,
  generateByeWeekReason,
  generateFlexStartReason,
  generateFlexBenchReason,
} from './reasonGenerators.ts';
import type {
  StartBenchRecommendation,
  RosterEntryResponse,
  PlayerGroup,
  RecommendationConfidence,
} from './types.ts';
import { extractYahooPlayerId } from '../../utils/yahooPlayerId.ts';

export type { StartBenchRecommendation } from './types.ts';

const BENCH_SLOTS = ['BENCH', 'IR', 'BN'];
const FLEX_ELIGIBLE_POSITIONS = ['WR', 'RB', 'TE'];

/**
 * Get start/bench recommendations for user's teams in a league
 */
export async function getStartBenchRecommendations(
  leagueId: string,
  leagueName: string,
  seasonYear: number,
  currentWeek: number,
  userTeamIds: string[]
): Promise<StartBenchRecommendation[]> {
  if (userTeamIds.length === 0) return [];

  // Fetch all required data
  const rosterEntries = await fetchRosterEntries(userTeamIds);
  const playerIds = rosterEntries.map((re) => re.player_id).filter(Boolean);

  if (playerIds.length === 0) return [];

  const [
    scoresMap,
    statsMap,
    normalizedStatsMap,
    playerInjuries,
    byeWeekPlayerIds,
    rosterSlots,
  ] = await Promise.all([
    fetchRosterScores(leagueId, seasonYear, currentWeek, playerIds),
    fetchPlayerStats(seasonYear, currentWeek, playerIds),
    fetchNormalizedStats(leagueId, seasonYear, currentWeek, playerIds),
    fetchPlayerInjuries(playerIds),
    fetchByeWeekPlayerIds(currentWeek, playerIds),
    getLeagueRosterSlots(leagueId),
  ]);

  // Destructure the combined injury data
  const { statusMap: injuryStatusMap, injuredPlayerIds } = playerInjuries;

  // Group players by position and team
  const positionGroups = groupPlayersByPositionAndTeam(
    rosterEntries,
    scoresMap,
    statsMap,
    normalizedStatsMap,
    leagueId,
    leagueName
  );

  // Generate recommendations for standard positions
  const { recommendations, playersFillingPositionSlots } =
    processStandardPositions(
      positionGroups,
      rosterSlots,
      injuredPlayerIds,
      byeWeekPlayerIds,
      injuryStatusMap
    );

  // Generate recommendations for flex positions
  const flexRecommendations = processFlexPositions(
    positionGroups,
    rosterSlots.flexSlots,
    playersFillingPositionSlots,
    injuredPlayerIds,
    byeWeekPlayerIds,
    recommendations,
    injuryStatusMap
  );

  return [...recommendations, ...flexRecommendations];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper functions
// ─────────────────────────────────────────────────────────────────────────────

function groupPlayersByPositionAndTeam(
  rosterEntries: RosterEntryResponse[],
  scoresMap: Map<string, { weighted_score: number; fantasy_points: number }>,
  statsMap: Map<string, PlayerGroup['stats']>,
  normalizedStatsMap: Map<string, PlayerGroup['normalizedStats']>,
  leagueId: string,
  leagueName: string
): Map<string, PlayerGroup[]> {
  const positionGroups = new Map<string, PlayerGroup[]>();

  for (const entry of rosterEntries) {
    const player = entry.players;
    const team = entry.teams;
    const scoreData = scoresMap.get(entry.player_id);
    const stats = statsMap.get(entry.player_id);
    const normalizedStats = normalizedStatsMap.get(entry.player_id);

    // Skip only if missing essential player/team info
    // Players without scoreData should still be included for injury/bye checks
    if (!player?.position || !team) continue;

    const key = `${player.position}_${team.id}`;
    if (!positionGroups.has(key)) {
      positionGroups.set(key, []);
    }

    positionGroups.get(key)!.push({
      player_id: entry.player_id,
      yahoo_player_id: extractYahooPlayerId(player.yahoo_player_id),
      name: player.name,
      position: player.position,
      team: player.team,
      slot: entry.slot,
      weighted_score: scoreData?.weighted_score ?? 0,
      fantasy_points: scoreData?.fantasy_points ?? 0,
      league_id: leagueId,
      league_name: leagueName,
      team_id: team.id,
      team_name: team.name,
      stats,
      normalizedStats,
    });
  }

  return positionGroups;
}

function processStandardPositions(
  positionGroups: Map<string, PlayerGroup[]>,
  rosterSlots: { positions: Map<string, number>; flexSlots: number },
  injuredPlayerIds: Set<string>,
  byeWeekPlayerIds: Set<string>,
  injuryStatusMap: Map<string, string>
): {
  recommendations: StartBenchRecommendation[];
  playersFillingPositionSlots: Map<string, Set<string>>;
} {
  const recommendations: StartBenchRecommendation[] = [];
  const playersFillingPositionSlots = new Map<string, Set<string>>();

  for (const [, players] of positionGroups) {
    const sorted = [...players].sort(
      (a, b) => (b.weighted_score || 0) - (a.weighted_score || 0)
    );

    const position = sorted[0]?.position;
    const teamId = sorted[0]?.team_id;
    if (!position || !teamId) continue;

    const startingSlots = getStartingSlotsForPosition(rosterSlots, position);

    if (!playersFillingPositionSlots.has(teamId)) {
      playersFillingPositionSlots.set(teamId, new Set());
    }

    for (let rank = 0; rank < sorted.length; rank++) {
      const player = sorted[rank];
      const slotUpper = player.slot?.toUpperCase() || '';
      const isBenchSlot = BENCH_SLOTS.includes(slotUpper);
      const isInFlexSlot = isFlexSlot(player.slot);
      const isPositionStartingSlot = !isBenchSlot && !isInFlexSlot;
      const shouldStartAtPosition = rank < startingSlots;
      const isInjured = injuredPlayerIds.has(player.player_id);
      const isOnBye = byeWeekPlayerIds.has(player.player_id);
      const injuryStatus = injuryStatusMap.get(player.player_id);

      // Skip flex-slotted players entirely - they're already starting and will be evaluated in flex section
      if (isInFlexSlot) continue;

      // Track players filling position slots (exclude injured, bye week, and flex players)
      if (shouldStartAtPosition && !isInjured && !isOnBye) {
        playersFillingPositionSlots.get(teamId)!.add(player.player_id);
      }

      // Handle injured players currently in a starting slot
      if (isPositionStartingSlot && isInjured) {
        // Find the best available player to replace them (anyone healthy, not on bye)
        const replacement = sorted.find(
          (p) =>
            p.player_id !== player.player_id &&
            !injuredPlayerIds.has(p.player_id) &&
            !byeWeekPlayerIds.has(p.player_id)
        );
        // For injured players, confidence is high by default (they can't play!)
        // Compare to the best healthy replacement
        const comparison = replacement
          ? { score: replacement.weighted_score, name: replacement.name }
          : { score: 100, name: 'any healthy player' }; // High score = high confidence to bench

        recommendations.push(
          createRecommendation(
            player,
            'BENCH',
            generateInjuryReason(player),
            comparison,
            injuryStatus
          )
        );
        continue;
      }

      // Handle players on bye week currently in a starting slot
      if (isPositionStartingSlot && isOnBye) {
        // Find the best available player to replace them (anyone not on bye, not injured)
        const replacement = sorted.find(
          (p) =>
            p.player_id !== player.player_id &&
            !injuredPlayerIds.has(p.player_id) &&
            !byeWeekPlayerIds.has(p.player_id)
        );
        // For bye week players, confidence is high by default (they can't play!)
        // Compare to the best available replacement
        const comparison = replacement
          ? { score: replacement.weighted_score, name: replacement.name }
          : { score: 100, name: 'any available player' }; // High score = high confidence to bench

        recommendations.push(
          createRecommendation(
            player,
            'BENCH',
            generateByeWeekReason(player),
            comparison,
            injuryStatus
          )
        );
        continue;
      }

      // Recommend if slot doesn't match where they should be
      if (isPositionStartingSlot !== shouldStartAtPosition) {
        const reason = shouldStartAtPosition
          ? generateStartReason(player, sorted, rank, startingSlots)
          : generateBenchReason(player, sorted, rank, startingSlots);

        // For START: compare to the player they're replacing (worst player who shouldn't start)
        // For BENCH: compare to the player who should take their spot (best player who should start)
        let comparison: ComparisonInfo;
        if (shouldStartAtPosition) {
          // Player should start - compare to the first "should NOT start" player (they're replacing them)
          const playerToReplace = sorted[startingSlots];
          comparison = playerToReplace
            ? {
                score: playerToReplace.weighted_score,
                name: playerToReplace.name,
              }
            : { score: 0, name: 'starter' };
        } else {
          // Player should bench - compare to the last "should start" player (who should take their spot)
          const playerTakingSpot = sorted[startingSlots - 1];
          comparison = playerTakingSpot
            ? {
                score: playerTakingSpot.weighted_score,
                name: playerTakingSpot.name,
              }
            : { score: 0, name: 'bench' };
        }

        recommendations.push(
          createRecommendation(
            player,
            shouldStartAtPosition ? 'START' : 'BENCH',
            reason,
            comparison,
            injuryStatus
          )
        );
      }
    }
  }

  return { recommendations, playersFillingPositionSlots };
}

function processFlexPositions(
  positionGroups: Map<string, PlayerGroup[]>,
  flexSlots: number,
  playersFillingPositionSlots: Map<string, Set<string>>,
  injuredPlayerIds: Set<string>,
  byeWeekPlayerIds: Set<string>,
  existingRecommendations: StartBenchRecommendation[],
  injuryStatusMap: Map<string, string>
): StartBenchRecommendation[] {
  if (flexSlots <= 0) return [];

  const recommendations: StartBenchRecommendation[] = [];
  const flexEligibleByTeam = new Map<string, PlayerGroup[]>();

  // Collect flex-eligible players (exclude injured and bye week players from flex consideration)
  for (const [, players] of positionGroups) {
    for (const player of players) {
      if (!FLEX_ELIGIBLE_POSITIONS.includes(player.position)) continue;
      if (
        playersFillingPositionSlots.get(player.team_id)?.has(player.player_id)
      )
        continue;
      if (injuredPlayerIds.has(player.player_id)) continue;
      if (byeWeekPlayerIds.has(player.player_id)) continue;

      if (!flexEligibleByTeam.has(player.team_id)) {
        flexEligibleByTeam.set(player.team_id, []);
      }
      flexEligibleByTeam.get(player.team_id)!.push(player);
    }
  }

  // Check for injured or bye week players currently in flex slots that need to be benched
  for (const [, players] of positionGroups) {
    for (const player of players) {
      if (!FLEX_ELIGIBLE_POSITIONS.includes(player.position)) continue;

      const slotUpper = player.slot?.toUpperCase() || '';
      const isBenchSlot = BENCH_SLOTS.includes(slotUpper);
      const isInFlexSlot = isFlexSlot(player.slot);
      const isInjured = injuredPlayerIds.has(player.player_id);
      const isOnBye = byeWeekPlayerIds.has(player.player_id);
      const injuryStatus = injuryStatusMap.get(player.player_id);

      // Skip if already recommended
      const alreadyRecommended = existingRecommendations.some(
        (r) => r.player_id === player.player_id && r.team_id === player.team_id
      );
      if (alreadyRecommended) continue;

      // Handle injured players currently in a flex slot
      if (isInFlexSlot && !isBenchSlot && isInjured) {
        // Find best available flex replacement from team's flex-eligible players
        const teamFlexPlayers = flexEligibleByTeam.get(player.team_id) || [];
        const replacement = teamFlexPlayers[0]; // Already sorted by score, first is best
        // For injured players, confidence is high by default (they can't play!)
        const comparison = replacement
          ? { score: replacement.weighted_score, name: replacement.name }
          : { score: 100, name: 'any healthy player' };

        recommendations.push(
          createRecommendation(
            player,
            'BENCH',
            generateInjuryReason(player),
            comparison,
            injuryStatus
          )
        );
        continue;
      }

      // Handle players on bye week currently in a flex slot
      if (isInFlexSlot && !isBenchSlot && isOnBye) {
        // Find best available flex replacement from team's flex-eligible players
        const teamFlexPlayers = flexEligibleByTeam.get(player.team_id) || [];
        const replacement = teamFlexPlayers[0]; // Already sorted by score, first is best
        // For bye week players, confidence is high by default (they can't play!)
        const comparison = replacement
          ? { score: replacement.weighted_score, name: replacement.name }
          : { score: 100, name: 'any available player' };

        recommendations.push(
          createRecommendation(
            player,
            'BENCH',
            generateByeWeekReason(player),
            comparison,
            injuryStatus
          )
        );
        continue;
      }
    }
  }

  // Generate flex recommendations per team
  for (const [teamId, players] of flexEligibleByTeam) {
    const sortedFlex = [...players].sort(
      (a, b) => (b.weighted_score || 0) - (a.weighted_score || 0)
    );

    for (let i = 0; i < sortedFlex.length; i++) {
      const player = sortedFlex[i];
      const isStartingSlot = !BENCH_SLOTS.includes(
        player.slot?.toUpperCase() || ''
      );
      const shouldStartAsFlex = i < flexSlots;
      const injuryStatus = injuryStatusMap.get(player.player_id);

      // Skip if already recommended (including from injured/bye check above)
      const alreadyRecommended = [
        ...existingRecommendations,
        ...recommendations,
      ].some((r) => r.player_id === player.player_id && r.team_id === teamId);
      if (alreadyRecommended) continue;

      if (isStartingSlot !== shouldStartAsFlex) {
        const reason = shouldStartAsFlex
          ? generateFlexStartReason(player, sortedFlex, i, flexSlots)
          : generateFlexBenchReason(player, sortedFlex, i, flexSlots);

        // For flex START: compare to player they're replacing (first who shouldn't start)
        // For flex BENCH: compare to player taking their spot (last who should start)
        let comparison: ComparisonInfo;
        if (shouldStartAsFlex) {
          // Player should start in flex - compare to the player they're replacing
          const playerToReplace = sortedFlex[flexSlots];
          comparison = playerToReplace
            ? {
                score: playerToReplace.weighted_score,
                name: playerToReplace.name,
              }
            : { score: 0, name: 'flex starter' };
        } else {
          // Player should bench from flex - compare to player who should take their spot
          const playerTakingSpot = sortedFlex[flexSlots - 1];
          comparison = playerTakingSpot
            ? {
                score: playerTakingSpot.weighted_score,
                name: playerTakingSpot.name,
              }
            : { score: 0, name: 'flex bench' };
        }

        recommendations.push(
          createRecommendation(
            player,
            shouldStartAsFlex ? 'START' : 'BENCH',
            reason,
            comparison,
            injuryStatus
          )
        );
      }
    }
  }

  return recommendations;
}

/**
 * Calculate confidence level based on percentage difference between scores
 */
function calculateConfidence(
  playerScore: number,
  comparisonScore: number,
  recommendation: 'START' | 'BENCH'
): RecommendationConfidence {
  // For START: how much better is the benched player vs the current starter
  // For BENCH: how much better is the bench alternative vs the current starter
  const scoreDiff = Math.abs(playerScore - comparisonScore);
  const baseScore = Math.max(playerScore, comparisonScore, 1); // Avoid division by zero
  const percentDiff = (scoreDiff / baseScore) * 100;

  if (recommendation === 'START') {
    // Player should start - they're better than current starter
    if (percentDiff >= 25) {
      return { level: 3, label: 'Must Start' };
    } else if (percentDiff >= 10) {
      return { level: 2, label: 'Strong Start' };
    } else {
      return { level: 1, label: 'Lean Start' };
    }
  } else {
    // Player should be benched - someone else is better
    if (percentDiff >= 25) {
      return { level: 3, label: 'Must Bench' };
    } else if (percentDiff >= 10) {
      return { level: 2, label: 'Strong Bench' };
    } else {
      return { level: 1, label: 'Lean Bench' };
    }
  }
}

interface ComparisonInfo {
  score: number;
  name: string;
}

function createRecommendation(
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
