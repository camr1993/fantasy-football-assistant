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
