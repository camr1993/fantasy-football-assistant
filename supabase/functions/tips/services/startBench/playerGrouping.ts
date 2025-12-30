import type {
  RosterEntryResponse,
  PlayerGroup,
  PlayerStatsData,
  NormalizedStatsData,
} from './types.ts';
import { extractYahooPlayerId } from '../../utils/yahooPlayerId.ts';

/**
 * Group roster entries by position and team, enriching with score and stats data
 */
export function groupPlayersByPositionAndTeam(
  rosterEntries: RosterEntryResponse[],
  scoresMap: Map<string, { weighted_score: number; fantasy_points: number }>,
  statsMap: Map<string, PlayerStatsData>,
  normalizedStatsMap: Map<string, NormalizedStatsData>,
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

