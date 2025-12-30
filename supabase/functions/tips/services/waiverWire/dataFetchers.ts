import { logger } from '../../../utils/logger.ts';
import { supabase } from '../../../utils/supabase.ts';
import { extractYahooPlayerId } from '../../utils/yahooPlayerId.ts';
import type {
  WaiverWirePlayer,
  RosteredPlayerWithScore,
  NormalizedStats,
  RosteredPlayer,
  InjuredPlayer,
  ByePlayer,
  LeagueCalcWithPlayer,
  WaiverWireRpcResult,
  RosterEntryWithPlayer,
  LeagueCalcScore,
} from './types.ts';

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
  for (const rawCalc of leagueCalcsData || []) {
    // Cast through unknown to handle Supabase type inference quirks
    const calc = rawCalc as unknown as LeagueCalcWithPlayer;
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
 * Get rostered players with their weighted scores for the given teams
 */
export async function getRosteredPlayersWithScores(
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
        team,
        yahoo_player_id
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

  // Fetch weighted scores for rostered players - get all scores for this season
  // to find the most recent score for each player
  const { data: scoresData, error: scoresError } = await supabase
    .from('league_calcs')
    .select(
      'player_id, weighted_score, fantasy_points, recent_mean, recent_std, week'
    )
    .eq('league_id', leagueId)
    .eq('season_year', seasonYear)
    .lte('week', currentWeek)
    .in('player_id', playerIds)
    .not('weighted_score', 'is', null)
    .order('week', { ascending: false });

  if (scoresError) {
    logger.warn('Failed to fetch roster scores for waiver comparison', {
      error: scoresError,
    });
    return [];
  }

  // Create a map of player_id -> most recent score data
  // Since results are ordered by week desc, the first entry for each player is the most recent
  const scoresMap = new Map<string, LeagueCalcScore>();
  for (const score of (scoresData as (LeagueCalcScore & { week: number })[]) ||
    []) {
    if (!scoresMap.has(score.player_id)) {
      scoresMap.set(score.player_id, score);
    }
  }

  // Combine roster entries with scores
  // Include players even if they have no scores (score will be null)
  const result: RosteredPlayerWithScore[] = [];
  for (const entry of rosterEntries) {
    const player = entry.players;
    const team = entry.teams;
    const scoreData = scoresMap.get(entry.player_id);

    if (!player || !team || !player.position) {
      continue;
    }

    result.push({
      player_id: entry.player_id,
      yahoo_player_id: extractYahooPlayerId(player.yahoo_player_id),
      name: player.name,
      position: player.position,
      team: player.team,
      slot: entry.slot,
      weighted_score: scoreData?.weighted_score ?? null,
      fantasy_points: scoreData?.fantasy_points ?? null,
      recent_mean: scoreData?.recent_mean ?? null,
      recent_std: scoreData?.recent_std ?? null,
      team_id: team.id,
      team_name: team.name,
    });
  }

  return result;
}

/**
 * Fetch normalized stats for players
 */
export async function fetchNormalizedStatsForPlayers(
  leagueId: string,
  seasonYear: number,
  currentWeek: number,
  playerIds: string[]
): Promise<Map<string, NormalizedStats>> {
  if (playerIds.length === 0) {
    return new Map();
  }

  // Fetch league_calcs data (recent_mean_norm, recent_std_norm)
  const { data: leagueCalcsData } = await supabase
    .from('league_calcs')
    .select('player_id, recent_mean_norm, recent_std_norm')
    .eq('league_id', leagueId)
    .eq('season_year', seasonYear)
    .eq('week', currentWeek)
    .in('player_id', playerIds);

  // Fetch player_stats normalized data
  const { data: playerStatsData } = await supabase
    .from('player_stats')
    .select(
      `
      player_id,
      passing_efficiency_3wk_avg_norm,
      turnovers_3wk_avg_norm,
      rushing_upside_3wk_avg_norm,
      targets_per_game_3wk_avg_norm,
      catch_rate_3wk_avg_norm,
      yards_per_target_3wk_avg_norm,
      weighted_opportunity_3wk_avg_norm,
      touchdown_production_3wk_avg_norm,
      receiving_profile_3wk_avg_norm,
      yards_per_touch_3wk_avg_norm,
      receiving_touchdowns_3wk_avg_norm,
      fg_profile_3wk_avg_norm,
      fg_pat_misses_3wk_avg_norm,
      fg_attempts_3wk_avg_norm,
      sacks_per_game_3wk_avg_norm,
      turnovers_forced_3wk_avg_norm,
      dst_tds_3wk_avg_norm,
      points_allowed_3wk_avg_norm,
      yards_allowed_3wk_avg_norm,
      block_kicks_3wk_avg_norm,
      safeties_3wk_avg_norm
    `
    )
    .eq('season_year', seasonYear)
    .eq('week', currentWeek)
    .eq('source', 'actual')
    .in('player_id', playerIds);

  // Build lookup maps
  const leagueCalcsMap = new Map<
    string,
    { recent_mean_norm: number | null; recent_std_norm: number | null }
  >();
  for (const calc of leagueCalcsData || []) {
    leagueCalcsMap.set(calc.player_id, {
      recent_mean_norm: calc.recent_mean_norm,
      recent_std_norm: calc.recent_std_norm,
    });
  }

  const statsMap = new Map<string, NormalizedStats>();
  for (const stat of playerStatsData || []) {
    const leagueCalc = leagueCalcsMap.get(stat.player_id);
    statsMap.set(stat.player_id, {
      player_id: stat.player_id,
      recent_mean_norm: leagueCalc?.recent_mean_norm ?? null,
      recent_std_norm: leagueCalc?.recent_std_norm ?? null,
      passing_efficiency_3wk_avg_norm:
        stat.passing_efficiency_3wk_avg_norm ?? null,
      turnovers_3wk_avg_norm: stat.turnovers_3wk_avg_norm ?? null,
      rushing_upside_3wk_avg_norm: stat.rushing_upside_3wk_avg_norm ?? null,
      targets_per_game_3wk_avg_norm: stat.targets_per_game_3wk_avg_norm ?? null,
      catch_rate_3wk_avg_norm: stat.catch_rate_3wk_avg_norm ?? null,
      yards_per_target_3wk_avg_norm: stat.yards_per_target_3wk_avg_norm ?? null,
      weighted_opportunity_3wk_avg_norm:
        stat.weighted_opportunity_3wk_avg_norm ?? null,
      touchdown_production_3wk_avg_norm:
        stat.touchdown_production_3wk_avg_norm ?? null,
      receiving_profile_3wk_avg_norm:
        stat.receiving_profile_3wk_avg_norm ?? null,
      yards_per_touch_3wk_avg_norm: stat.yards_per_touch_3wk_avg_norm ?? null,
      receiving_touchdowns_3wk_avg_norm:
        stat.receiving_touchdowns_3wk_avg_norm ?? null,
      fg_profile_3wk_avg_norm: stat.fg_profile_3wk_avg_norm ?? null,
      fg_pat_misses_3wk_avg_norm: stat.fg_pat_misses_3wk_avg_norm ?? null,
      fg_attempts_3wk_avg_norm: stat.fg_attempts_3wk_avg_norm ?? null,
      sacks_per_game_3wk_avg_norm: stat.sacks_per_game_3wk_avg_norm ?? null,
      turnovers_forced_3wk_avg_norm: stat.turnovers_forced_3wk_avg_norm ?? null,
      dst_tds_3wk_avg_norm: stat.dst_tds_3wk_avg_norm ?? null,
      points_allowed_3wk_avg_norm: stat.points_allowed_3wk_avg_norm ?? null,
      yards_allowed_3wk_avg_norm: stat.yards_allowed_3wk_avg_norm ?? null,
      block_kicks_3wk_avg_norm: stat.block_kicks_3wk_avg_norm ?? null,
      safeties_3wk_avg_norm: stat.safeties_3wk_avg_norm ?? null,
    });
  }

  // Also add entries for players who have league_calcs but no player_stats
  for (const [playerId, leagueCalc] of leagueCalcsMap) {
    if (!statsMap.has(playerId)) {
      statsMap.set(playerId, {
        player_id: playerId,
        recent_mean_norm: leagueCalc.recent_mean_norm,
        recent_std_norm: leagueCalc.recent_std_norm,
        passing_efficiency_3wk_avg_norm: null,
        turnovers_3wk_avg_norm: null,
        rushing_upside_3wk_avg_norm: null,
        targets_per_game_3wk_avg_norm: null,
        catch_rate_3wk_avg_norm: null,
        yards_per_target_3wk_avg_norm: null,
        weighted_opportunity_3wk_avg_norm: null,
        touchdown_production_3wk_avg_norm: null,
        receiving_profile_3wk_avg_norm: null,
        yards_per_touch_3wk_avg_norm: null,
        receiving_touchdowns_3wk_avg_norm: null,
        fg_profile_3wk_avg_norm: null,
        fg_pat_misses_3wk_avg_norm: null,
        fg_attempts_3wk_avg_norm: null,
        sacks_per_game_3wk_avg_norm: null,
        turnovers_forced_3wk_avg_norm: null,
        dst_tds_3wk_avg_norm: null,
        points_allowed_3wk_avg_norm: null,
        yards_allowed_3wk_avg_norm: null,
        block_kicks_3wk_avg_norm: null,
        safeties_3wk_avg_norm: null,
      });
    }
  }

  return statsMap;
}

/**
 * Fetch injury statuses for players
 */
export async function fetchPlayerInjuryStatuses(
  playerIds: string[]
): Promise<Map<string, string>> {
  if (playerIds.length === 0) {
    return new Map();
  }

  const { data } = await supabase
    .from('player_injuries')
    .select('player_id, status')
    .in('player_id', playerIds);

  return new Map(
    (data || []).map((ip: { player_id: string; status: string }) => [
      ip.player_id,
      ip.status,
    ])
  );
}

