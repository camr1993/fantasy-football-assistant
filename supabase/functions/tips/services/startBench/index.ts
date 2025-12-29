import {
  getLeagueRosterSlots,
  getStartingSlotsForPosition,
  isFlexSlot,
} from './rosterSlots.ts';
import {
  fetchRosterEntries,
  fetchRosterScores,
  fetchPlayerStats,
  fetchInjuredPlayerIds,
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
    injuredPlayerIds,
    byeWeekPlayerIds,
    rosterSlots,
  ] = await Promise.all([
    fetchRosterScores(leagueId, seasonYear, currentWeek, playerIds),
    fetchPlayerStats(seasonYear, currentWeek, playerIds),
    fetchNormalizedStats(leagueId, seasonYear, currentWeek, playerIds),
    fetchInjuredPlayerIds(),
    fetchByeWeekPlayerIds(currentWeek, playerIds),
    getLeagueRosterSlots(leagueId),
  ]);

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
      byeWeekPlayerIds
    );

  // Generate recommendations for flex positions
  const flexRecommendations = processFlexPositions(
    positionGroups,
    rosterSlots.flexSlots,
    playersFillingPositionSlots,
    injuredPlayerIds,
    byeWeekPlayerIds,
    recommendations
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
  byeWeekPlayerIds: Set<string>
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

      // Track players filling position slots (exclude injured and bye week players)
      if (shouldStartAtPosition && !isInjured && !isOnBye) {
        playersFillingPositionSlots.get(teamId)!.add(player.player_id);
      }

      // Skip flex-slotted players - evaluated in flex section
      if (isInFlexSlot && !shouldStartAtPosition) continue;

      // Handle injured players currently in a starting slot
      if (isPositionStartingSlot && isInjured) {
        recommendations.push(
          createRecommendation(player, 'BENCH', generateInjuryReason(player))
        );
        continue;
      }

      // Handle players on bye week currently in a starting slot
      if (isPositionStartingSlot && isOnBye) {
        recommendations.push(
          createRecommendation(player, 'BENCH', generateByeWeekReason(player))
        );
        continue;
      }

      // Recommend if slot doesn't match where they should be
      if (isPositionStartingSlot !== shouldStartAtPosition) {
        const reason = shouldStartAtPosition
          ? generateStartReason(player, sorted, rank, startingSlots)
          : generateBenchReason(player, sorted, rank, startingSlots);

        recommendations.push(
          createRecommendation(
            player,
            shouldStartAtPosition ? 'START' : 'BENCH',
            reason
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
  existingRecommendations: StartBenchRecommendation[]
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

      // Skip if already recommended
      const alreadyRecommended = existingRecommendations.some(
        (r) => r.player_id === player.player_id && r.team_id === player.team_id
      );
      if (alreadyRecommended) continue;

      // Handle injured players currently in a flex slot
      if (isInFlexSlot && !isBenchSlot && isInjured) {
        recommendations.push(
          createRecommendation(player, 'BENCH', generateInjuryReason(player))
        );
        continue;
      }

      // Handle players on bye week currently in a flex slot
      if (isInFlexSlot && !isBenchSlot && isOnBye) {
        recommendations.push(
          createRecommendation(player, 'BENCH', generateByeWeekReason(player))
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

        recommendations.push(
          createRecommendation(
            player,
            shouldStartAsFlex ? 'START' : 'BENCH',
            reason
          )
        );
      }
    }
  }

  return recommendations;
}

function createRecommendation(
  player: PlayerGroup,
  recommendation: 'START' | 'BENCH',
  reason: string
): StartBenchRecommendation {
  return {
    player_id: player.player_id,
    yahoo_player_id: player.yahoo_player_id,
    name: player.name,
    position: player.position,
    team: player.team,
    slot: player.slot,
    weighted_score: player.weighted_score,
    league_id: player.league_id,
    league_name: player.league_name,
    team_id: player.team_id,
    team_name: player.team_name,
    recommendation,
    reason,
  };
}
