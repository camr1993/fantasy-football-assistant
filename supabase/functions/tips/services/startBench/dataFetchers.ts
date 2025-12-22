import { supabase } from '../../../utils/supabase.ts';
import type {
  RosterEntryResponse,
  RosterScore,
  PlayerStatsData,
  NormalizedStatsData,
} from './types.ts';

/**
 * Fetch roster entries for the given team IDs
 */
export async function fetchRosterEntries(
  userTeamIds: string[]
): Promise<RosterEntryResponse[]> {
  const { data } = await supabase
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

  return (data as RosterEntryResponse[] | null) || [];
}

/**
 * Fetch weighted scores and fantasy points for players
 */
export async function fetchRosterScores(
  leagueId: string,
  seasonYear: number,
  currentWeek: number,
  playerIds: string[]
): Promise<Map<string, RosterScore>> {
  const { data } = await supabase
    .from('league_calcs')
    .select(
      'player_id, weighted_score, fantasy_points, recent_mean, recent_std'
    )
    .eq('league_id', leagueId)
    .eq('season_year', seasonYear)
    .eq('week', currentWeek)
    .in('player_id', playerIds)
    .not('weighted_score', 'is', null);

  return new Map(
    (data as RosterScore[] | null)?.map((s) => [
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
}

/**
 * Fetch player stats, preferring projected over actual
 */
export async function fetchPlayerStats(
  seasonYear: number,
  currentWeek: number,
  playerIds: string[]
): Promise<Map<string, PlayerStatsData>> {
  const { data } = await supabase
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
    .in('player_id', playerIds);

  // Deduplicate by player_id, preferring 'projected' over 'actual'
  const statsMapDeduped = new Map<
    string,
    PlayerStatsData & { source?: string }
  >();

  for (const stat of (data as
    | (PlayerStatsData & { source?: string })[]
    | null) || []) {
    const existing = statsMapDeduped.get(stat.player_id);
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

  return statsMap;
}

/**
 * Fetch IDs of injured players (those who should not start)
 */
export async function fetchInjuredPlayerIds(): Promise<Set<string>> {
  const { data } = await supabase
    .from('player_injuries')
    .select('player_id, status')
    .in('status', ['O', 'IR', 'PUP-R', 'D', 'SUSP', 'NFI-R', 'IR-R']);

  return new Set((data || []).map((ip: { player_id: string }) => ip.player_id));
}

/**
 * Fetch IDs of players on bye week (those who should not start)
 */
export async function fetchByeWeekPlayerIds(
  currentWeek: number,
  playerIds: string[]
): Promise<Set<string>> {
  if (playerIds.length === 0) {
    return new Set();
  }

  const { data } = await supabase
    .from('players')
    .select('id, bye_week')
    .in('id', playerIds)
    .eq('bye_week', currentWeek);

  return new Set((data || []).map((p: { id: string }) => p.id));
}

/**
 * Fetch normalized stats for score breakdown analysis
 */
export async function fetchNormalizedStats(
  leagueId: string,
  seasonYear: number,
  currentWeek: number,
  playerIds: string[]
): Promise<Map<string, NormalizedStatsData>> {
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

  const statsMap = new Map<string, NormalizedStatsData>();
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
