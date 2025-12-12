import { logger } from '../../utils/logger.ts';
import { supabase } from '../../utils/supabase.ts';

export interface WaiverWirePlayer {
  position: string;
  player_id: string;
  name: string;
  team: string;
  yahoo_player_id: string;
  weighted_score: number;
  league_id: string;
  league_name: string;
}

export interface WaiverWireRecommendation {
  waiver_player_id: string;
  waiver_player_name: string;
  waiver_player_team: string;
  waiver_player_position: string;
  waiver_weighted_score: number;
  rostered_player_id: string;
  rostered_player_name: string;
  rostered_player_team: string;
  rostered_weighted_score: number;
  league_id: string;
  league_name: string;
  team_id: string;
  team_name: string;
  recommendation: 'ADD';
  reason: string;
}

interface RosteredPlayer {
  player_id: string;
}

interface InjuredPlayer {
  player_id: string;
}

interface ByePlayer {
  id: string;
}

interface LeagueCalcWithPlayer {
  player_id: string;
  weighted_score: number;
  players: {
    id: string;
    name: string;
    position: string;
    team: string;
    yahoo_player_id: string;
  } | null;
}

interface WaiverWireRpcResult {
  position: string;
  player_id: string;
  name: string;
  team: string;
  yahoo_player_id: string;
  weighted_score: number;
  rank: number;
}

interface RosterEntryWithPlayer {
  player_id: string;
  slot: string;
  players: {
    id: string;
    name: string;
    position: string;
    team: string;
  } | null;
  teams: {
    id: string;
    name: string;
  } | null;
}

interface LeagueCalcScore {
  player_id: string;
  weighted_score: number;
  fantasy_points: number;
  recent_mean: number | null;
  recent_std: number | null;
}

interface RosteredPlayerWithScore {
  player_id: string;
  name: string;
  position: string;
  team: string;
  slot: string;
  weighted_score: number;
  fantasy_points: number;
  recent_mean: number | null;
  recent_std: number | null;
  team_id: string;
  team_name: string;
}

/**
 * Get top available waiver wire players for a league
 */
export async function getWaiverWirePlayers(
  leagueId: string,
  leagueName: string,
  seasonYear: number,
  currentWeek: number,
  nextWeek: number
): Promise<WaiverWirePlayer[]> {
  // Try using the database function first
  const { data: waiverWireData, error: waiverWireError } = await supabase.rpc(
    'get_waiver_wire_players',
    {
      p_league_id: leagueId,
      p_season_year: seasonYear,
      p_current_week: currentWeek,
      p_next_week: nextWeek,
    }
  );

  // If function works, transform and return results
  if (!waiverWireError && waiverWireData) {
    return (waiverWireData as WaiverWireRpcResult[]).map((player) => ({
      position: player.position,
      player_id: player.player_id,
      name: player.name,
      team: player.team,
      yahoo_player_id: player.yahoo_player_id,
      weighted_score: player.weighted_score,
      league_id: leagueId,
      league_name: leagueName,
    }));
  }

  // Fallback to direct query if function doesn't exist or fails
  logger.warn('Database function not available, using direct query', {
    error: waiverWireError,
  });

  return await getWaiverWirePlayersFallback(
    leagueId,
    leagueName,
    seasonYear,
    currentWeek,
    nextWeek
  );
}

/**
 * Get waiver wire players using direct Supabase queries
 */
async function getWaiverWirePlayersFallback(
  leagueId: string,
  leagueName: string,
  seasonYear: number,
  currentWeek: number,
  nextWeek: number
): Promise<WaiverWirePlayer[]> {
  // Get all teams in league
  const { data: leagueTeams } = await supabase
    .from('teams')
    .select('id')
    .eq('league_id', leagueId);

  const teamIds = leagueTeams?.map((t) => t.id) || [];

  // Get rostered players
  const { data: rosteredData } =
    teamIds.length > 0
      ? await supabase
          .from('roster_entry')
          .select('player_id')
          .in('team_id', teamIds)
      : { data: [] };

  const rosteredPlayerIds = new Set(
    ((rosteredData as RosteredPlayer[] | null) || []).map((r) => r.player_id)
  );

  // Get injured players (player_injuries table only tracks current status, no season/year/week)
  const { data: injuredData } = await supabase
    .from('player_injuries')
    .select('player_id')
    .in('status', ['O', 'IR', 'PUP-R', 'D', 'SUSP', 'NFI-R', 'IR-R']);

  const injuredPlayerIds = new Set(
    ((injuredData as InjuredPlayer[] | null) || []).map((i) => i.player_id)
  );

  // Get players on bye next week
  const { data: byePlayers } = await supabase
    .from('players')
    .select('id')
    .eq('bye_week', nextWeek);

  const byePlayerIds = new Set(
    ((byePlayers as ByePlayer[] | null) || []).map((p) => p.id)
  );

  // Get available players with weighted scores
  const { data: leagueCalcsData } = await supabase
    .from('league_calcs')
    .select(
      `
      player_id,
      weighted_score,
      players!inner(
        id,
        name,
        position,
        team,
        yahoo_player_id
      )
    `
    )
    .eq('league_id', leagueId)
    .eq('season_year', seasonYear)
    .eq('week', currentWeek)
    .not('weighted_score', 'is', null)
    .order('weighted_score', { ascending: false });

  // Filter and group by position
  const playersByPosition = new Map<string, WaiverWirePlayer[]>();
  for (const calc of (leagueCalcsData as LeagueCalcWithPlayer[] | null) || []) {
    const player = calc.players;
    if (
      !player ||
      !player.position ||
      rosteredPlayerIds.has(calc.player_id) ||
      injuredPlayerIds.has(calc.player_id) ||
      byePlayerIds.has(calc.player_id)
    ) {
      continue;
    }

    if (!playersByPosition.has(player.position)) {
      playersByPosition.set(player.position, []);
    }

    const positionPlayers = playersByPosition.get(player.position)!;
    if (positionPlayers.length < 3) {
      positionPlayers.push({
        position: player.position,
        player_id: calc.player_id,
        name: player.name,
        team: player.team,
        yahoo_player_id: player.yahoo_player_id,
        weighted_score: calc.weighted_score,
        league_id: leagueId,
        league_name: leagueName,
      });
    }
  }

  return Array.from(playersByPosition.values()).flat();
}

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

  // Group waiver wire players by position for easy lookup
  const waiverByPosition = new Map<string, WaiverWirePlayer[]>();
  for (const player of waiverWirePlayers) {
    if (player.league_id !== leagueId) continue;
    if (!waiverByPosition.has(player.position)) {
      waiverByPosition.set(player.position, []);
    }
    waiverByPosition.get(player.position)!.push(player);
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
      if (waiverPlayer.weighted_score > rostered.weighted_score) {
        const reason = generateWaiverWireReason(waiverPlayer, rostered);
        recommendations.push({
          waiver_player_id: waiverPlayer.player_id,
          waiver_player_name: waiverPlayer.name,
          waiver_player_team: waiverPlayer.team,
          waiver_player_position: waiverPlayer.position,
          waiver_weighted_score: waiverPlayer.weighted_score,
          rostered_player_id: rostered.player_id,
          rostered_player_name: rostered.name,
          rostered_player_team: rostered.team,
          rostered_weighted_score: rostered.weighted_score,
          league_id: leagueId,
          league_name: leagueName,
          team_id: rostered.team_id,
          team_name: rostered.team_name,
          recommendation: 'ADD',
          reason,
        });
      }
    }
  }

  // Sort by score difference (biggest improvements first)
  recommendations.sort((a, b) => {
    const diffA = a.waiver_weighted_score - a.rostered_weighted_score;
    const diffB = b.waiver_weighted_score - b.rostered_weighted_score;
    return diffB - diffA;
  });

  return recommendations;
}

/**
 * Get rostered players with their weighted scores for the given teams
 */
async function getRosteredPlayersWithScores(
  leagueId: string,
  seasonYear: number,
  currentWeek: number,
  userTeamIds: string[]
): Promise<RosteredPlayerWithScore[]> {
  // Fetch roster entries with player and team info
  const { data: rosterData, error: rosterError } = await supabase
    .from('roster_entry')
    .select(
      `
      player_id,
      slot,
      players!inner(
        id,
        name,
        position,
        team
      ),
      teams!inner(
        id,
        name
      )
    `
    )
    .in('team_id', userTeamIds);

  if (rosterError || !rosterData) {
    logger.warn('Failed to fetch roster entries for waiver comparison', {
      error: rosterError,
    });
    return [];
  }

  const rosterEntries = rosterData as unknown as RosterEntryWithPlayer[];
  const playerIds = rosterEntries.map((r) => r.player_id).filter(Boolean);

  if (playerIds.length === 0) {
    return [];
  }

  // Fetch weighted scores for rostered players
  const { data: scoresData, error: scoresError } = await supabase
    .from('league_calcs')
    .select(
      'player_id, weighted_score, fantasy_points, recent_mean, recent_std'
    )
    .eq('league_id', leagueId)
    .eq('season_year', seasonYear)
    .eq('week', currentWeek)
    .in('player_id', playerIds)
    .not('weighted_score', 'is', null);

  if (scoresError || !scoresData) {
    logger.warn('Failed to fetch roster scores for waiver comparison', {
      error: scoresError,
    });
    return [];
  }

  // Create a map of player_id -> score data
  const scoresMap = new Map<string, LeagueCalcScore>(
    (scoresData as LeagueCalcScore[]).map((s) => [s.player_id, s])
  );

  // Combine roster entries with scores
  const result: RosteredPlayerWithScore[] = [];
  for (const entry of rosterEntries) {
    const player = entry.players;
    const team = entry.teams;
    const scoreData = scoresMap.get(entry.player_id);

    if (!player || !team || !scoreData || !player.position) {
      continue;
    }

    result.push({
      player_id: entry.player_id,
      name: player.name,
      position: player.position,
      team: player.team,
      slot: entry.slot,
      weighted_score: scoreData.weighted_score,
      fantasy_points: scoreData.fantasy_points,
      recent_mean: scoreData.recent_mean,
      recent_std: scoreData.recent_std,
      team_id: team.id,
      team_name: team.name,
    });
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reason generation for waiver wire recommendations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a detailed reason for adding a waiver wire player over a rostered player
 */
function generateWaiverWireReason(
  waiverPlayer: WaiverWirePlayer,
  rosteredPlayer: RosteredPlayerWithScore
): string {
  const scoreDiff = waiverPlayer.weighted_score - rosteredPlayer.weighted_score;
  const percentImprovement = (scoreDiff / rosteredPlayer.weighted_score) * 100;

  let reason = `${waiverPlayer.name} (${waiverPlayer.team}) has a higher weighted score than ${rosteredPlayer.name} (${rosteredPlayer.team}): `;
  reason += `${waiverPlayer.weighted_score.toFixed(2)} vs ${rosteredPlayer.weighted_score.toFixed(2)} `;
  reason += `(+${scoreDiff.toFixed(2)} points, ${percentImprovement.toFixed(1)}% improvement). `;

  // Add context based on position
  reason += getPositionContext(waiverPlayer.position, rosteredPlayer);

  // Add slot context if rostered player is on bench
  const benchSlots = ['BENCH', 'BN', 'IR'];
  if (benchSlots.includes(rosteredPlayer.slot?.toUpperCase() || '')) {
    reason += `${rosteredPlayer.name} is currently on your bench. `;
  }

  // Add consistency context if available
  if (
    rosteredPlayer.recent_std !== null &&
    rosteredPlayer.recent_mean !== null
  ) {
    const cv =
      rosteredPlayer.recent_std / Math.max(rosteredPlayer.recent_mean, 0.1);
    if (cv > 0.5) {
      reason += `${rosteredPlayer.name} has been inconsistent recently (high variance). `;
    }
  }

  return reason.trim();
}

/**
 * Get position-specific context for the recommendation
 */
function getPositionContext(
  position: string,
  rosteredPlayer: RosteredPlayerWithScore
): string {
  switch (position) {
    case 'QB':
      return `Consider upgrading your QB depth. `;
    case 'RB':
      if (
        rosteredPlayer.recent_mean !== null &&
        rosteredPlayer.recent_mean < 8
      ) {
        return `${rosteredPlayer.name} has been underperforming at RB. `;
      }
      return `This RB could provide better production. `;
    case 'WR':
      if (
        rosteredPlayer.recent_mean !== null &&
        rosteredPlayer.recent_mean < 6
      ) {
        return `${rosteredPlayer.name} hasn't seen much production at WR. `;
      }
      return `This WR offers more upside. `;
    case 'TE':
      return `TE is a thin position - consider this upgrade. `;
    case 'K':
      return `Kicker streaming can boost your weekly ceiling. `;
    case 'DEF':
      return `Consider streaming this defense for a better matchup. `;
    default:
      return '';
  }
}
