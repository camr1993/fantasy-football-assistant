import { getLeagueRosterSlots } from './rosterSlots.ts';
import {
  fetchRosterEntries,
  fetchRosterScores,
  fetchPlayerStats,
  fetchPlayerInjuries,
  fetchByeWeekPlayerIds,
  fetchNormalizedStats,
} from './dataFetchers.ts';
import { groupPlayersByPositionAndTeam } from './playerGrouping.ts';
import {
  processStandardPositions,
  processFlexPositions,
} from './positionProcessors.ts';
import type { StartBenchRecommendation } from './types.ts';

export type { StartBenchRecommendation } from './types.ts';

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
