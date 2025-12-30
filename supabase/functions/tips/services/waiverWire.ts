import { logger } from '../../utils/logger.ts';
import { supabase } from '../../utils/supabase.ts';
import { extractYahooPlayerId } from '../utils/yahooPlayerId.ts';
import {
  calculateScoreBreakdown,
  comparePlayerBreakdowns,
  generateDetailedComparisonReason,
  type PlayerScoreBreakdown,
} from './startBench/scoreBreakdown.ts';

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

export interface RecommendationConfidence {
  level: 1 | 2 | 3;
  label: string;
}

/**
 * Calculate confidence level for waiver wire recommendations
 */
function calculateWaiverConfidence(
  waiverScore: number,
  rosteredScore: number
): RecommendationConfidence {
  // Calculate percentage improvement
  const improvement =
    rosteredScore > 0
      ? ((waiverScore - rosteredScore) / rosteredScore) * 100
      : waiverScore > 0
        ? 100
        : 0;

  if (improvement >= 25) {
    return { level: 3, label: 'Strong Upgrade' };
  } else if (improvement >= 10) {
    return { level: 2, label: 'Good Upgrade' };
  } else {
    return { level: 1, label: 'Slight Upgrade' };
  }
}

export interface WaiverWireRecommendation {
  waiver_player_id: string;
  waiver_yahoo_player_id: string;
  waiver_player_name: string;
  waiver_player_team: string;
  waiver_player_position: string;
  waiver_weighted_score: number;
  waiver_injury_status?: string;
  rostered_player_id: string;
  rostered_yahoo_player_id: string;
  rostered_player_name: string;
  rostered_player_team: string;
  rostered_weighted_score: number;
  rostered_injury_status?: string;
  league_id: string;
  league_name: string;
  team_id: string;
  team_name: string;
  recommendation: 'ADD';
  reason: string;
  confidence: RecommendationConfidence;
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
  };
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
    yahoo_player_id: string;
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

interface NormalizedStats {
  player_id: string;
  recent_mean_norm: number | null;
  recent_std_norm: number | null;
  // QB
  passing_efficiency_3wk_avg_norm: number | null;
  turnovers_3wk_avg_norm: number | null;
  rushing_upside_3wk_avg_norm: number | null;
  // WR/TE
  targets_per_game_3wk_avg_norm: number | null;
  catch_rate_3wk_avg_norm: number | null;
  yards_per_target_3wk_avg_norm: number | null;
  // RB
  weighted_opportunity_3wk_avg_norm: number | null;
  touchdown_production_3wk_avg_norm: number | null;
  receiving_profile_3wk_avg_norm: number | null;
  yards_per_touch_3wk_avg_norm: number | null;
  // TE
  receiving_touchdowns_3wk_avg_norm: number | null;
  // K
  fg_profile_3wk_avg_norm: number | null;
  fg_pat_misses_3wk_avg_norm: number | null;
  fg_attempts_3wk_avg_norm: number | null;
  // DEF
  sacks_per_game_3wk_avg_norm: number | null;
  turnovers_forced_3wk_avg_norm: number | null;
  dst_tds_3wk_avg_norm: number | null;
  points_allowed_3wk_avg_norm: number | null;
  yards_allowed_3wk_avg_norm: number | null;
  block_kicks_3wk_avg_norm: number | null;
  safeties_3wk_avg_norm: number | null;
}

interface RosteredPlayerWithScore {
  player_id: string;
  yahoo_player_id: string;
  name: string;
  position: string;
  team: string;
  slot: string;
  weighted_score: number | null;
  fantasy_points: number | null;
  recent_mean: number | null;
  recent_std: number | null;
  team_id: string;
  team_name: string;
  normalizedStats?: NormalizedStats;
}

interface WaiverPlayerWithStats extends WaiverWirePlayer {
  normalizedStats?: NormalizedStats;
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

  // Collect all player IDs for normalized stats fetching
  const allPlayerIds = [
    ...waiverWirePlayers
      .filter((p) => p.league_id === leagueId)
      .map((p) => p.player_id),
    ...rosteredPlayers.map((p) => p.player_id),
  ];

  // Fetch normalized stats and injury statuses in parallel
  const [normalizedStatsMap, injuryStatusMap] = await Promise.all([
    fetchNormalizedStatsForPlayers(
      leagueId,
      seasonYear,
      currentWeek,
      allPlayerIds
    ),
    fetchPlayerInjuryStatuses(allPlayerIds),
  ]);

  // Attach normalized stats to rostered players
  for (const rostered of rosteredPlayers) {
    rostered.normalizedStats = normalizedStatsMap.get(rostered.player_id);
  }

  // Group waiver wire players by position with normalized stats
  const waiverByPosition = new Map<string, WaiverPlayerWithStats[]>();
  for (const player of waiverWirePlayers) {
    if (player.league_id !== leagueId) continue;
    if (!waiverByPosition.has(player.position)) {
      waiverByPosition.set(player.position, []);
    }
    const playerWithStats: WaiverPlayerWithStats = {
      ...player,
      normalizedStats: normalizedStatsMap.get(player.player_id),
    };
    waiverByPosition.get(player.position)!.push(playerWithStats);
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
      // Determine if waiver player should be recommended over rostered player
      let shouldRecommend = false;

      if (rostered.weighted_score === null) {
        // Rostered player has no scores - recommend waiver player unless it's week 1 or 2
        shouldRecommend = currentWeek > 2;
      } else {
        // Compare weighted scores
        shouldRecommend = waiverPlayer.weighted_score > rostered.weighted_score;
      }

      if (shouldRecommend) {
        const reason = generateWaiverWireReason(waiverPlayer, rostered);
        const confidence = calculateWaiverConfidence(
          waiverPlayer.weighted_score,
          rostered.weighted_score ?? 0
        );
        recommendations.push({
          waiver_player_id: waiverPlayer.player_id,
          waiver_yahoo_player_id: extractYahooPlayerId(
            waiverPlayer.yahoo_player_id
          ),
          waiver_player_name: waiverPlayer.name,
          waiver_player_team: waiverPlayer.team,
          waiver_player_position: waiverPlayer.position,
          waiver_weighted_score: waiverPlayer.weighted_score,
          waiver_injury_status: injuryStatusMap.get(waiverPlayer.player_id),
          rostered_player_id: rostered.player_id,
          rostered_yahoo_player_id: rostered.yahoo_player_id,
          rostered_player_name: rostered.name,
          rostered_player_team: rostered.team,
          rostered_weighted_score: rostered.weighted_score ?? 0,
          rostered_injury_status: injuryStatusMap.get(rostered.player_id),
          league_id: leagueId,
          league_name: leagueName,
          team_id: rostered.team_id,
          team_name: rostered.team_name,
          recommendation: 'ADD',
          reason,
          confidence,
        });
      }
    }
  }

  // Sort by score difference (biggest improvements first)
  // Null rostered scores (no data) are treated as high priority recommendations
  recommendations.sort((a, b) => {
    const aRosteredHasNoData = a.rostered_weighted_score === 0;
    const bRosteredHasNoData = b.rostered_weighted_score === 0;

    // Prioritize recommendations where rostered player has no data
    if (aRosteredHasNoData && !bRosteredHasNoData) return -1;
    if (!aRosteredHasNoData && bRosteredHasNoData) return 1;

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

// ─────────────────────────────────────────────────────────────────────────────
// Normalized stats fetching
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch normalized stats for players
 */
async function fetchNormalizedStatsForPlayers(
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
async function fetchPlayerInjuryStatuses(
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

// ─────────────────────────────────────────────────────────────────────────────
// Reason generation for waiver wire recommendations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a score breakdown from normalized stats
 */
function buildScoreBreakdown(
  playerId: string,
  position: string,
  weightedScore: number,
  normalizedStats?: NormalizedStats
): PlayerScoreBreakdown {
  if (!normalizedStats) {
    return {
      playerId,
      position,
      weightedScore,
      components: [],
    };
  }

  const leagueCalcs = {
    player_id: playerId,
    recent_mean_norm: normalizedStats.recent_mean_norm,
    recent_std_norm: normalizedStats.recent_std_norm,
    weighted_score: weightedScore,
  };

  const playerStats = {
    player_id: playerId,
    passing_efficiency_3wk_avg_norm:
      normalizedStats.passing_efficiency_3wk_avg_norm,
    turnovers_3wk_avg_norm: normalizedStats.turnovers_3wk_avg_norm,
    rushing_upside_3wk_avg_norm: normalizedStats.rushing_upside_3wk_avg_norm,
    targets_per_game_3wk_avg_norm:
      normalizedStats.targets_per_game_3wk_avg_norm,
    catch_rate_3wk_avg_norm: normalizedStats.catch_rate_3wk_avg_norm,
    yards_per_target_3wk_avg_norm:
      normalizedStats.yards_per_target_3wk_avg_norm,
    weighted_opportunity_3wk_avg_norm:
      normalizedStats.weighted_opportunity_3wk_avg_norm,
    touchdown_production_3wk_avg_norm:
      normalizedStats.touchdown_production_3wk_avg_norm,
    receiving_profile_3wk_avg_norm:
      normalizedStats.receiving_profile_3wk_avg_norm,
    yards_per_touch_3wk_avg_norm: normalizedStats.yards_per_touch_3wk_avg_norm,
    receiving_touchdowns_3wk_avg_norm:
      normalizedStats.receiving_touchdowns_3wk_avg_norm,
    fg_profile_3wk_avg_norm: normalizedStats.fg_profile_3wk_avg_norm,
    fg_pat_misses_3wk_avg_norm: normalizedStats.fg_pat_misses_3wk_avg_norm,
    fg_attempts_3wk_avg_norm: normalizedStats.fg_attempts_3wk_avg_norm,
    sacks_per_game_3wk_avg_norm: normalizedStats.sacks_per_game_3wk_avg_norm,
    turnovers_forced_3wk_avg_norm:
      normalizedStats.turnovers_forced_3wk_avg_norm,
    dst_tds_3wk_avg_norm: normalizedStats.dst_tds_3wk_avg_norm,
    points_allowed_3wk_avg_norm: normalizedStats.points_allowed_3wk_avg_norm,
    yards_allowed_3wk_avg_norm: normalizedStats.yards_allowed_3wk_avg_norm,
    block_kicks_3wk_avg_norm: normalizedStats.block_kicks_3wk_avg_norm,
    safeties_3wk_avg_norm: normalizedStats.safeties_3wk_avg_norm,
  };

  return calculateScoreBreakdown(
    playerId,
    position,
    leagueCalcs,
    playerStats,
    0
  );
}

/**
 * Generate a detailed reason for adding a waiver wire player over a rostered player
 * Uses the same detailed score breakdown comparison as start/bench recommendations
 */
function generateWaiverWireReason(
  waiverPlayer: WaiverPlayerWithStats,
  rosteredPlayer: RosteredPlayerWithScore
): string {
  // Handle case where rostered player has no score data
  if (rosteredPlayer.weighted_score === null) {
    const waiverBreakdown = buildScoreBreakdown(
      waiverPlayer.player_id,
      waiverPlayer.position,
      waiverPlayer.weighted_score,
      waiverPlayer.normalizedStats
    );

    // Get top factors for the waiver player
    const topFactors = waiverBreakdown.components
      .filter((c) => c.contribution > 0)
      .slice(0, 2)
      .map((c) => c.label.toLowerCase());

    let reason = `${waiverPlayer.name} (${waiverPlayer.team}) scores ${waiverPlayer.weighted_score.toFixed(2)}, `;
    reason += `while ${rosteredPlayer.name} (${rosteredPlayer.team}) has no scoring data. `;

    if (topFactors.length > 0) {
      reason += `${waiverPlayer.name}'s score is driven by ${topFactors.join(' and ')}.`;
    }

    return reason.trim();
  }

  // Build breakdowns for both players
  const waiverBreakdown = buildScoreBreakdown(
    waiverPlayer.player_id,
    waiverPlayer.position,
    waiverPlayer.weighted_score,
    waiverPlayer.normalizedStats
  );

  const rosteredBreakdown = buildScoreBreakdown(
    rosteredPlayer.player_id,
    rosteredPlayer.position,
    rosteredPlayer.weighted_score,
    rosteredPlayer.normalizedStats
  );

  // If both have component data, use detailed comparison
  if (
    waiverBreakdown.components.length > 0 &&
    rosteredBreakdown.components.length > 0
  ) {
    const comparison = comparePlayerBreakdowns(
      waiverBreakdown,
      rosteredBreakdown
    );
    return generateDetailedComparisonReason(
      comparison,
      waiverPlayer.name,
      rosteredPlayer.name,
      true // isStartRecommendation - we're recommending to add (start) the waiver player
    );
  }

  // Fallback to simpler reason if no component data
  const scoreDiff = waiverPlayer.weighted_score - rosteredPlayer.weighted_score;
  const percentImprovement =
    (scoreDiff / Math.abs(rosteredPlayer.weighted_score)) * 100;

  let reason = `${waiverPlayer.name} (${waiverPlayer.team}) outscores ${rosteredPlayer.name} (${rosteredPlayer.team}): `;
  reason += `${waiverPlayer.weighted_score.toFixed(2)} vs ${rosteredPlayer.weighted_score.toFixed(2)} `;
  reason += `(+${scoreDiff.toFixed(2)}, ${percentImprovement.toFixed(0)}% better).`;

  return reason.trim();
}
