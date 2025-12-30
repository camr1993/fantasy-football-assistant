import { getStartingSlotsForPosition, isFlexSlot } from './rosterSlots.ts';
import {
  generateStartReason,
  generateBenchReason,
  generateInjuryReason,
  generateByeWeekReason,
  generateFlexStartReason,
  generateFlexBenchReason,
} from './reasonGenerators.ts';
import {
  createRecommendation,
  type ComparisonInfo,
} from './recommendationBuilder.ts';
import type { StartBenchRecommendation, PlayerGroup } from './types.ts';

const BENCH_SLOTS = ['BENCH', 'IR', 'BN'];
const FLEX_ELIGIBLE_POSITIONS = ['WR', 'RB', 'TE'];

interface RosterSlots {
  positions: Map<string, number>;
  flexSlots: number;
}

/**
 * Process standard (non-flex) position slots and generate recommendations
 */
export function processStandardPositions(
  positionGroups: Map<string, PlayerGroup[]>,
  rosterSlots: RosterSlots,
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
        const replacement = sorted.find(
          (p) =>
            p.player_id !== player.player_id &&
            !injuredPlayerIds.has(p.player_id) &&
            !byeWeekPlayerIds.has(p.player_id)
        );
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

      // Handle players on bye week currently in a starting slot
      if (isPositionStartingSlot && isOnBye) {
        const replacement = sorted.find(
          (p) =>
            p.player_id !== player.player_id &&
            !injuredPlayerIds.has(p.player_id) &&
            !byeWeekPlayerIds.has(p.player_id)
        );
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

      // Recommend if slot doesn't match where they should be
      if (isPositionStartingSlot !== shouldStartAtPosition) {
        const reason = shouldStartAtPosition
          ? generateStartReason(player, sorted, rank, startingSlots)
          : generateBenchReason(player, sorted, rank, startingSlots);

        let comparison: ComparisonInfo;
        if (shouldStartAtPosition) {
          const playerToReplace = sorted[startingSlots];
          comparison = playerToReplace
            ? {
                score: playerToReplace.weighted_score,
                name: playerToReplace.name,
              }
            : { score: 0, name: 'starter' };
        } else {
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

/**
 * Process flex position slots and generate recommendations
 */
export function processFlexPositions(
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

      const alreadyRecommended = existingRecommendations.some(
        (r) => r.player_id === player.player_id && r.team_id === player.team_id
      );
      if (alreadyRecommended) continue;

      // Handle injured players currently in a flex slot
      if (isInFlexSlot && !isBenchSlot && isInjured) {
        const teamFlexPlayers = flexEligibleByTeam.get(player.team_id) || [];
        const replacement = teamFlexPlayers[0];
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
        const teamFlexPlayers = flexEligibleByTeam.get(player.team_id) || [];
        const replacement = teamFlexPlayers[0];
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

      const alreadyRecommended = [
        ...existingRecommendations,
        ...recommendations,
      ].some((r) => r.player_id === player.player_id && r.team_id === teamId);
      if (alreadyRecommended) continue;

      if (isStartingSlot !== shouldStartAsFlex) {
        const reason = shouldStartAsFlex
          ? generateFlexStartReason(player, sortedFlex, i, flexSlots)
          : generateFlexBenchReason(player, sortedFlex, i, flexSlots);

        let comparison: ComparisonInfo;
        if (shouldStartAsFlex) {
          const playerToReplace = sortedFlex[flexSlots];
          comparison = playerToReplace
            ? {
                score: playerToReplace.weighted_score,
                name: playerToReplace.name,
              }
            : { score: 0, name: 'flex starter' };
        } else {
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

