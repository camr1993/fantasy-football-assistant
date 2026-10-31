import { getStartingSlotsForPosition, isFlexSlot } from './rosterSlots.ts';
import {
  generateStartReason,
  generateBenchReason,
  generateInjuryReason,
  generateByeWeekReason,
  generateFlexStartReason,
  generateFlexBenchReason,
  getComparisonFactors,
} from './reasonGenerators.ts';
import {
  createRecommendation,
  type ComparisonInfo,
} from './recommendationBuilder.ts';
import type { StartBenchRecommendation, PlayerGroup } from './types.ts';

const BENCH_SLOTS = ['BENCH', 'IR', 'BN'];
const FLEX_ELIGIBLE_POSITIONS = ['WR', 'RB', 'TE'];

/**
 * Describe the player on the other side of a recommendation, including why
 * they come out ahead, so the UI can rank them against the current player.
 */
function toComparison(
  better: PlayerGroup | undefined,
  worse: PlayerGroup,
  fallback: ComparisonInfo
): ComparisonInfo {
  if (!better) return fallback;

  return {
    score: better.weighted_score,
    name: better.name,
    team: better.team,
    slot: better.slot,
    factors: getComparisonFactors(better, worse),
  };
}

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
    const position = players[0]?.position;
    const teamId = players[0]?.team_id;
    if (!position || !teamId) continue;

    // Players already in a flex slot are starting and are evaluated by the
    // flex pass, so they do not compete for position slots as well.
    const candidates = players.filter((p) => !isFlexSlot(p.slot));

    // Rank only the players who can actually start this week. Anyone who
    // cannot - injured, or on bye - still consumed a rank previously, which
    // both pushed eligible players out of the starting slots and let an
    // unavailable player be recommended to start.
    const sorted = candidates
      .filter(
        (p) =>
          !injuredPlayerIds.has(p.player_id) &&
          !byeWeekPlayerIds.has(p.player_id)
      )
      .sort((a, b) => (b.weighted_score || 0) - (a.weighted_score || 0));

    const rankByPlayerId = new Map(sorted.map((p, i) => [p.player_id, i]));
    const startingSlots = getStartingSlotsForPosition(rosterSlots, position);

    if (!playersFillingPositionSlots.has(teamId)) {
      playersFillingPositionSlots.set(teamId, new Set());
    }

    for (const player of candidates) {
      const slotUpper = player.slot?.toUpperCase() || '';
      const isBenchSlot = BENCH_SLOTS.includes(slotUpper);
      const isPositionStartingSlot = !isBenchSlot;
      const isInjured = injuredPlayerIds.has(player.player_id);
      const isOnBye = byeWeekPlayerIds.has(player.player_id);
      const injuryStatus = injuryStatusMap.get(player.player_id);
      const rank = rankByPlayerId.get(player.player_id);
      const shouldStartAtPosition = rank !== undefined && rank < startingSlots;

      // Track players filling position slots
      if (shouldStartAtPosition) {
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
        const comparison = toComparison(replacement, player, {
          score: 100,
          name: 'any healthy player',
        });

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
        const comparison = toComparison(replacement, player, {
          score: 100,
          name: 'any available player',
        });

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

      // An unavailable player sitting on the bench is already where they
      // should be, so there is nothing to recommend
      if (isInjured || isOnBye) continue;

      // Recommend if slot doesn't match where they should be
      if (isPositionStartingSlot !== shouldStartAtPosition) {
        const reason = shouldStartAtPosition
          ? generateStartReason(player, sorted, rank, startingSlots)
          : generateBenchReason(player, sorted, rank, startingSlots);

        let comparison: ComparisonInfo;
        if (shouldStartAtPosition) {
          // The player being displaced, so the UI can show who moves out
          comparison = toComparison(sorted[startingSlots], player, {
            score: 0,
            name: 'starter',
          });
        } else {
          comparison = toComparison(sorted[startingSlots - 1], player, {
            score: 0,
            name: 'bench',
          });
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
        const comparison = toComparison(teamFlexPlayers[0], player, {
          score: 100,
          name: 'any healthy player',
        });

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
        const comparison = toComparison(teamFlexPlayers[0], player, {
          score: 100,
          name: 'any available player',
        });

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
          comparison = toComparison(sortedFlex[flexSlots], player, {
            score: 0,
            name: 'flex starter',
          });
        } else {
          comparison = toComparison(sortedFlex[flexSlots - 1], player, {
            score: 0,
            name: 'flex bench',
          });
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
