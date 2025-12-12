import { supabase } from '../../../utils/supabase.ts';
import type {
  RosterEntryResponse,
  RosterScore,
  PlayerStatsData,
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
