import { supabase } from '../../utils/supabase.ts';
import { getStartingSlotsForPosition } from '../utils/helpers.ts';

export interface StartBenchRecommendation {
  player_id: string;
  name: string;
  position: string;
  team: string;
  slot: string;
  weighted_score: number;
  league_id: string;
  league_name: string;
  team_id: string;
  team_name: string;
  recommendation: 'START' | 'BENCH';
  reason: string;
}

interface RosterEntryResponse {
  player_id: string;
  slot: string;
  players: {
    id: string;
    name: string;
    position: string;
    team: string;
    yahoo_player_id: string;
  } | null;
  teams: {
    id: string;
    name: string;
    league_id: string;
  } | null;
}

interface RosterScore {
  player_id: string;
  weighted_score: number;
  fantasy_points: number;
  recent_mean: number | null;
  recent_std: number | null;
}

interface PlayerStatsData {
  player_id: string;
  // Passing
  passing_yards: number;
  passing_touchdowns: number;
  interceptions: number;
  // Rushing
  rushing_yards: number;
  rushing_attempts: number;
  rushing_touchdowns: number;
  // Receiving
  receptions: number;
  receiving_yards: number;
  receiving_touchdowns: number;
  targets: number;
  // Efficiency metrics (3-week averages)
  targets_per_game_3wk_avg: number | null;
  catch_rate_3wk_avg: number | null;
  yards_per_target_3wk_avg: number | null;
  yards_per_touch_3wk_avg: number | null;
  passing_efficiency_3wk_avg: number | null;
  turnovers_3wk_avg: number | null;
  rushing_upside_3wk_avg: number | null;
}

interface PlayerGroup {
  player_id: string;
  name: string;
  position: string;
  team: string;
  slot: string;
  weighted_score: number;
  fantasy_points: number;
  league_id: string;
  league_name: string;
  team_id: string;
  team_name: string;
  stats?: PlayerStatsData;
}

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
  if (userTeamIds.length === 0) {
    return [];
  }

  // Get roster entries for user's teams
  const { data: rosterEntries } = await supabase
    .from('roster_entry')
    .select(
      `
      player_id,
      slot,
      teams!inner(
        id,
        name,
        league_id
      ),
      players!inner(
        id,
        name,
        position,
        team,
        yahoo_player_id
      )
    `
    )
    .in('team_id', userTeamIds);

  // Get weighted scores for these players
  const rosterPlayerIds =
    rosterEntries?.map((re) => re.player_id).filter(Boolean) || [];

  if (rosterPlayerIds.length === 0) {
    return [];
  }

  // Get weighted scores and fantasy points from league_calcs
  const { data: rosterScores } = await supabase
    .from('league_calcs')
    .select(
      'player_id, weighted_score, fantasy_points, recent_mean, recent_std'
    )
    .eq('league_id', leagueId)
    .eq('season_year', seasonYear)
    .eq('week', currentWeek)
    .in('player_id', rosterPlayerIds)
    .not('weighted_score', 'is', null);

  const scoresMap = new Map<string, RosterScore>(
    (rosterScores as RosterScore[] | null)?.map((s) => [
      s.player_id,
      {
        player_id: s.player_id,
        weighted_score: s.weighted_score,
        fantasy_points: s.fantasy_points,
        recent_mean: s.recent_mean,
        recent_std: s.recent_std,
      },
    ]) || []
  );

  // Get player stats for detailed reasons
  // Use projected stats for current week (if available), otherwise use actual stats
  // 3-week averages are stored on both actual and projected records
  const { data: playerStats } = await supabase
    .from('player_stats')
    .select(
      `
      player_id,
      source,
      passing_yards,
      passing_touchdowns,
      interceptions,
      rushing_yards,
      rushing_attempts,
      rushing_touchdowns,
      receptions,
      receiving_yards,
      receiving_touchdowns,
      targets,
      targets_per_game_3wk_avg,
      catch_rate_3wk_avg,
      yards_per_target_3wk_avg,
      yards_per_touch_3wk_avg,
      passing_efficiency_3wk_avg,
      turnovers_3wk_avg,
      rushing_upside_3wk_avg
    `
    )
    .eq('season_year', seasonYear)
    .eq('week', currentWeek)
    .in('player_id', rosterPlayerIds);

  // Deduplicate by player_id, preferring 'projected' over 'actual'
  const statsMapDeduped = new Map<
    string,
    PlayerStatsData & { source?: string }
  >();
  for (const stat of (playerStats as
    | (PlayerStatsData & { source?: string })[]
    | null) || []) {
    const existing = statsMapDeduped.get(stat.player_id);
    // Prefer projected over actual, or first one if neither is projected
    if (
      !existing ||
      (stat.source === 'projected' && existing.source !== 'projected')
    ) {
      statsMapDeduped.set(stat.player_id, stat);
    }
  }

  const statsMap = new Map<string, PlayerStatsData>();
  for (const s of statsMapDeduped.values()) {
    statsMap.set(s.player_id, {
      player_id: s.player_id,
      passing_yards: s.passing_yards || 0,
      passing_touchdowns: s.passing_touchdowns || 0,
      interceptions: s.interceptions || 0,
      rushing_yards: s.rushing_yards || 0,
      rushing_attempts: s.rushing_attempts || 0,
      rushing_touchdowns: s.rushing_touchdowns || 0,
      receptions: s.receptions || 0,
      receiving_yards: s.receiving_yards || 0,
      receiving_touchdowns: s.receiving_touchdowns || 0,
      targets: s.targets || 0,
      targets_per_game_3wk_avg: s.targets_per_game_3wk_avg,
      catch_rate_3wk_avg: s.catch_rate_3wk_avg,
      yards_per_target_3wk_avg: s.yards_per_target_3wk_avg,
      yards_per_touch_3wk_avg: s.yards_per_touch_3wk_avg,
      passing_efficiency_3wk_avg: s.passing_efficiency_3wk_avg,
      turnovers_3wk_avg: s.turnovers_3wk_avg,
      rushing_upside_3wk_avg: s.rushing_upside_3wk_avg,
    });
  }

  // Get injured players (exclude from START recommendations)
  const { data: injuredPlayers } = await supabase
    .from('player_injuries')
    .select('player_id, status')
    .in('status', ['O', 'IR', 'PUP-R', 'D', 'SUSP', 'NFI-R', 'IR-R']);

  const injuredPlayerIds = new Set(
    (injuredPlayers || []).map((ip: { player_id: string }) => ip.player_id)
  );

  // Group by position and team (each team is treated separately)
  // Key format: `${position}_${team_id}` ensures teams are separate
  const positionGroups = new Map<string, PlayerGroup[]>();
  for (const entry of (rosterEntries as RosterEntryResponse[] | null) || []) {
    const player = entry.players;
    const team = entry.teams;
    const scoreData = scoresMap.get(entry.player_id);
    const stats = statsMap.get(entry.player_id);

    if (!player || !player.position || !scoreData || !team) {
      continue;
    }

    // Key includes team_id, so each team gets separate position groups
    const key = `${player.position}_${team.id}`;
    if (!positionGroups.has(key)) {
      positionGroups.set(key, []);
    }

    positionGroups.get(key)!.push({
      player_id: entry.player_id,
      name: player.name,
      position: player.position,
      team: player.team,
      slot: entry.slot,
      weighted_score: scoreData.weighted_score,
      fantasy_points: scoreData.fantasy_points,
      league_id: leagueId,
      league_name: leagueName,
      team_id: team.id,
      team_name: team.name,
      stats: stats,
    });
  }

  // For each position group (per team), recommend start/bench
  const recommendations: StartBenchRecommendation[] = [];
  for (const [_key, players] of positionGroups) {
    const sorted = players.sort(
      (a, b) => (b.weighted_score || 0) - (a.weighted_score || 0)
    );

    // Get position from first player (all players in group have same position and team)
    const position = sorted[0]?.position;
    if (!position) continue;

    // Get starting slots for this position in this league
    const startingSlots = await getStartingSlotsForPosition(leagueId, position);

    // Determine if players should start or bench based on slot and score
    for (const player of sorted) {
      const isStartingSlot = !['BENCH', 'IR', 'BN'].includes(
        player.slot?.toUpperCase() || ''
      );
      const rank = sorted.indexOf(player);
      const shouldStart = rank < startingSlots;

      // Skip if player is injured - don't recommend to start injured players
      if (shouldStart && injuredPlayerIds.has(player.player_id)) {
        recommendations.push({
          player_id: player.player_id,
          name: player.name,
          position: player.position,
          team: player.team,
          slot: player.slot,
          weighted_score: player.weighted_score,
          league_id: player.league_id,
          league_name: player.league_name,
          team_id: player.team_id,
          team_name: player.team_name,
          recommendation: 'BENCH',
          reason: generateInjuryReason(player),
        });
        continue;
      }

      // Only recommend if current slot doesn't match recommended slot
      if (isStartingSlot !== shouldStart) {
        const reason = shouldStart
          ? generateStartReason(player, sorted, rank, startingSlots)
          : generateBenchReason(player, sorted, rank, startingSlots);

        recommendations.push({
          player_id: player.player_id,
          name: player.name,
          position: player.position,
          team: player.team,
          slot: player.slot,
          weighted_score: player.weighted_score,
          league_id: player.league_id,
          league_name: player.league_name,
          team_id: player.team_id,
          team_name: player.team_name,
          recommendation: shouldStart ? 'START' : 'BENCH',
          reason: reason,
        });
      }
    }
  }

  return recommendations;
}

/**
 * Generate detailed reason for starting a player
 */
function generateStartReason(
  player: PlayerGroup,
  sortedPlayers: PlayerGroup[],
  rank: number,
  startingSlots: number
): string {
  const stats = player.stats;
  const position = player.position;
  const worsePlayers = sortedPlayers.slice(rank + 1, startingSlots);

  let reason = `Ranked #${rank + 1} of ${sortedPlayers.length} ${position}s with weighted score ${player.weighted_score.toFixed(2)} (top ${startingSlots} should start). `;

  // Add position-specific stats
  if (stats) {
    if (position === 'QB') {
      const avgYards = stats.passing_yards || 0;
      const avgTDs = stats.passing_touchdowns || 0;
      const avgINTs = stats.interceptions || 0;
      reason += `Projected: ${avgYards} pass yds, ${avgTDs} TDs, ${avgINTs} INTs. `;
      if (stats.passing_efficiency_3wk_avg) {
        reason += `3-wk passing efficiency: ${stats.passing_efficiency_3wk_avg.toFixed(2)}. `;
      }
    } else if (position === 'RB') {
      const avgRushYds = stats.rushing_yards || 0;
      const avgRushTDs = stats.rushing_touchdowns || 0;
      const avgRec = stats.receptions || 0;
      const avgRecYds = stats.receiving_yards || 0;
      reason += `Projected: ${avgRushYds} rush yds, ${avgRushTDs} rush TDs, ${avgRec} rec, ${avgRecYds} rec yds. `;
      if (stats.yards_per_touch_3wk_avg) {
        reason += `3-wk avg: ${stats.yards_per_touch_3wk_avg.toFixed(1)} yds/touch. `;
      }
    } else if (position === 'WR' || position === 'TE') {
      const avgRec = stats.receptions || 0;
      const avgRecYds = stats.receiving_yards || 0;
      const avgRecTDs = stats.receiving_touchdowns || 0;
      const avgTargets = stats.targets || 0;
      reason += `Projected: ${avgTargets} targets, ${avgRec} rec, ${avgRecYds} rec yds, ${avgRecTDs} rec TDs. `;
      if (stats.targets_per_game_3wk_avg) {
        reason += `3-wk avg: ${stats.targets_per_game_3wk_avg.toFixed(1)} targets/game, `;
      }
      if (stats.yards_per_target_3wk_avg) {
        reason += `${stats.yards_per_target_3wk_avg.toFixed(1)} yds/target. `;
      }
    } else if (position === 'K') {
      reason += `Projected fantasy points: ${player.fantasy_points.toFixed(2)}. `;
    } else if (position === 'DEF') {
      reason += `Projected fantasy points: ${player.fantasy_points.toFixed(2)}. `;
    }
  }

  // Compare to players currently starting
  if (worsePlayers.length > 0) {
    const worsePlayer = worsePlayers[0];
    reason += `Better than ${worsePlayer.name} (${worsePlayer.weighted_score.toFixed(2)} vs ${player.weighted_score.toFixed(2)}).`;
  }

  return reason.trim();
}

/**
 * Generate detailed reason for benching a player
 */
function generateBenchReason(
  player: PlayerGroup,
  sortedPlayers: PlayerGroup[],
  rank: number,
  startingSlots: number
): string {
  const stats = player.stats;
  const position = player.position;
  const betterPlayers = sortedPlayers.slice(0, startingSlots);

  let reason = `Ranked #${rank + 1} of ${sortedPlayers.length} ${position}s with weighted score ${player.weighted_score.toFixed(2)} (only top ${startingSlots} should start). `;

  // Add position-specific stats
  if (stats) {
    if (position === 'QB') {
      const avgYards = stats.passing_yards || 0;
      const avgTDs = stats.passing_touchdowns || 0;
      const avgINTs = stats.interceptions || 0;
      reason += `Projected: ${avgYards} pass yds, ${avgTDs} TDs, ${avgINTs} INTs. `;
      if (stats.turnovers_3wk_avg) {
        reason += `3-wk avg turnovers: ${stats.turnovers_3wk_avg.toFixed(2)}. `;
      }
    } else if (position === 'RB') {
      const avgRushYds = stats.rushing_yards || 0;
      const avgRushTDs = stats.rushing_touchdowns || 0;
      const avgRec = stats.receptions || 0;
      reason += `Projected: ${avgRushYds} rush yds, ${avgRushTDs} rush TDs, ${avgRec} rec. `;
      if (stats.yards_per_touch_3wk_avg) {
        reason += `3-wk avg: ${stats.yards_per_touch_3wk_avg.toFixed(1)} yds/touch. `;
      }
    } else if (position === 'WR' || position === 'TE') {
      const avgTargets = stats.targets || 0;
      const avgRec = stats.receptions || 0;
      const avgRecYds = stats.receiving_yards || 0;
      reason += `Projected: ${avgTargets} targets, ${avgRec} rec, ${avgRecYds} rec yds. `;
      if (stats.targets_per_game_3wk_avg) {
        reason += `3-wk avg: ${stats.targets_per_game_3wk_avg.toFixed(1)} targets/game. `;
      }
    } else if (position === 'K') {
      reason += `Projected fantasy points: ${player.fantasy_points.toFixed(2)}. `;
    } else if (position === 'DEF') {
      reason += `Projected fantasy points: ${player.fantasy_points.toFixed(2)}. `;
    }
  }

  // Compare to players who should start
  if (betterPlayers.length > 0) {
    const betterPlayer = betterPlayers[betterPlayers.length - 1];
    reason += `Worse than ${betterPlayer.name} (${player.weighted_score.toFixed(2)} vs ${betterPlayer.weighted_score.toFixed(2)}).`;
  }

  return reason.trim();
}

/**
 * Generate reason for benching an injured player
 */
function generateInjuryReason(player: PlayerGroup): string {
  return `${player.name} is currently injured and should not be started. Weighted score: ${player.weighted_score.toFixed(2)}.`;
}
