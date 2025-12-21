import { supabase } from '../../../utils/supabase.ts';
import {
  POSITION_WEIGHTS,
  type Position,
} from '../../../../../vm/src/sync-functions/leagueCalcs/constants.ts';

export interface ScoreComponent {
  factor: string;
  label: string;
  weight: number;
  normalizedValue: number;
  contribution: number;
  percentOfTotal: number;
}

export interface PlayerScoreBreakdown {
  playerId: string;
  position: string;
  weightedScore: number;
  components: ScoreComponent[];
}

export interface ScoreComparison {
  betterPlayer: PlayerScoreBreakdown;
  worsePlayer: PlayerScoreBreakdown;
  keyAdvantages: Array<{
    factor: string;
    label: string;
    difference: number;
    betterPlayerValue: number;
    worsePlayerValue: number;
  }>;
}

interface LeagueCalcsData {
  player_id: string;
  recent_mean_norm: number | null;
  recent_std_norm: number | null;
  weighted_score: number | null;
}

interface PlayerStatsData {
  player_id: string;
  // QB
  passing_efficiency_3wk_avg_norm?: number | null;
  turnovers_3wk_avg_norm?: number | null;
  rushing_upside_3wk_avg_norm?: number | null;
  // WR
  targets_per_game_3wk_avg_norm?: number | null;
  catch_rate_3wk_avg_norm?: number | null;
  yards_per_target_3wk_avg_norm?: number | null;
  // RB
  weighted_opportunity_3wk_avg_norm?: number | null;
  touchdown_production_3wk_avg_norm?: number | null;
  receiving_profile_3wk_avg_norm?: number | null;
  yards_per_touch_3wk_avg_norm?: number | null;
  // TE
  receiving_touchdowns_3wk_avg_norm?: number | null;
  // K
  fg_profile_3wk_avg_norm?: number | null;
  fg_pat_misses_3wk_avg_norm?: number | null;
  fg_attempts_3wk_avg_norm?: number | null;
  // DEF
  sacks_per_game_3wk_avg_norm?: number | null;
  turnovers_forced_3wk_avg_norm?: number | null;
  dst_tds_3wk_avg_norm?: number | null;
  points_allowed_3wk_avg_norm?: number | null;
  yards_allowed_3wk_avg_norm?: number | null;
  block_kicks_3wk_avg_norm?: number | null;
  safeties_3wk_avg_norm?: number | null;
}

/**
 * Fetch normalized component data for players
 */
export async function fetchScoreComponents(
  leagueId: string,
  seasonYear: number,
  currentWeek: number,
  playerIds: string[]
): Promise<
  Map<
    string,
    { leagueCalcs: LeagueCalcsData; playerStats: PlayerStatsData | null }
  >
> {
  const result = new Map<
    string,
    { leagueCalcs: LeagueCalcsData; playerStats: PlayerStatsData | null }
  >();

  if (playerIds.length === 0) return result;

  // Fetch league_calcs data (recent_mean_norm, recent_std_norm)
  const { data: leagueCalcsData } = await supabase
    .from('league_calcs')
    .select('player_id, recent_mean_norm, recent_std_norm, weighted_score')
    .eq('league_id', leagueId)
    .eq('season_year', seasonYear)
    .eq('week', currentWeek)
    .in('player_id', playerIds);

  // Fetch player_stats data (all normalized efficiency metrics)
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
  const statsMap = new Map<string, PlayerStatsData>();
  for (const stat of (playerStatsData as PlayerStatsData[]) || []) {
    statsMap.set(stat.player_id, stat);
  }

  // Combine data
  for (const calc of (leagueCalcsData as LeagueCalcsData[]) || []) {
    result.set(calc.player_id, {
      leagueCalcs: calc,
      playerStats: statsMap.get(calc.player_id) || null,
    });
  }

  return result;
}

/**
 * Calculate score breakdown for a player based on their position
 */
export function calculateScoreBreakdown(
  playerId: string,
  position: string,
  leagueCalcs: LeagueCalcsData,
  playerStats: PlayerStatsData | null,
  opponentDifficulty: number = 0
): PlayerScoreBreakdown {
  const positionWeights = POSITION_WEIGHTS[position as Position];
  if (!positionWeights) {
    return {
      playerId,
      position,
      weightedScore: leagueCalcs.weighted_score || 0,
      components: [],
    };
  }

  const components: ScoreComponent[] = [];
  const recentMean = leagueCalcs.recent_mean_norm || 0;
  const recentStd = Math.max(-2, Math.min(2, leagueCalcs.recent_std_norm || 0));

  // Build component values based on position
  const componentValues = getComponentValues(
    position,
    recentMean,
    recentStd,
    playerStats,
    opponentDifficulty
  );

  // Calculate contributions
  let totalPositive = 0;
  for (const [factor, config] of Object.entries(positionWeights)) {
    const normalizedValue = componentValues[factor] || 0;
    const contribution = config.weight * normalizedValue;
    if (contribution > 0) {
      totalPositive += contribution;
    }
  }

  // Build components with percentage
  for (const [factor, config] of Object.entries(positionWeights)) {
    const normalizedValue = componentValues[factor] || 0;
    const contribution = config.weight * normalizedValue;

    components.push({
      factor,
      label: config.label,
      weight: config.weight,
      normalizedValue,
      contribution: Math.round(contribution * 1000) / 1000,
      percentOfTotal:
        totalPositive > 0
          ? Math.round((Math.max(0, contribution) / totalPositive) * 100)
          : 0,
    });
  }

  // Sort by absolute contribution (highest impact first)
  components.sort(
    (a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)
  );

  return {
    playerId,
    position,
    weightedScore: leagueCalcs.weighted_score || 0,
    components,
  };
}

function getComponentValues(
  position: string,
  recentMean: number,
  recentStd: number,
  playerStats: PlayerStatsData | null,
  opponentDifficulty: number
): Record<string, number> {
  const base = {
    recent_mean: recentMean,
    volatility: recentStd,
    opponent_difficulty: opponentDifficulty,
  };

  if (!playerStats) return base;

  switch (position) {
    case 'QB':
      return {
        ...base,
        passing_efficiency: playerStats.passing_efficiency_3wk_avg_norm || 0,
        turnovers: playerStats.turnovers_3wk_avg_norm || 0,
        rushing_upside: playerStats.rushing_upside_3wk_avg_norm || 0,
      };
    case 'WR':
      return {
        ...base,
        targets_per_game: playerStats.targets_per_game_3wk_avg_norm || 0,
        yards_per_target: playerStats.yards_per_target_3wk_avg_norm || 0,
        catch_rate: playerStats.catch_rate_3wk_avg_norm || 0,
      };
    case 'RB':
      return {
        ...base,
        weighted_opportunity:
          playerStats.weighted_opportunity_3wk_avg_norm || 0,
        touchdown_production:
          playerStats.touchdown_production_3wk_avg_norm || 0,
        receiving_profile: playerStats.receiving_profile_3wk_avg_norm || 0,
        efficiency: playerStats.yards_per_touch_3wk_avg_norm || 0,
      };
    case 'TE':
      return {
        ...base,
        targets_per_game: playerStats.targets_per_game_3wk_avg_norm || 0,
        receiving_touchdowns:
          playerStats.receiving_touchdowns_3wk_avg_norm || 0,
        yards_per_target: playerStats.yards_per_target_3wk_avg_norm || 0,
      };
    case 'K':
      return {
        ...base,
        fg_profile: playerStats.fg_profile_3wk_avg_norm || 0,
        fg_pat_misses: playerStats.fg_pat_misses_3wk_avg_norm || 0,
        fg_attempts: playerStats.fg_attempts_3wk_avg_norm || 0,
      };
    case 'DEF':
      return {
        ...base,
        sacks_per_game: playerStats.sacks_per_game_3wk_avg_norm || 0,
        turnovers_forced: playerStats.turnovers_forced_3wk_avg_norm || 0,
        dst_tds: playerStats.dst_tds_3wk_avg_norm || 0,
        points_allowed: playerStats.points_allowed_3wk_avg_norm || 0,
        yards_allowed: playerStats.yards_allowed_3wk_avg_norm || 0,
        blocked_kicks: playerStats.block_kicks_3wk_avg_norm || 0,
        safeties: playerStats.safeties_3wk_avg_norm || 0,
      };
    default:
      return base;
  }
}

/**
 * Compare two players and identify key advantages
 */
export function comparePlayerBreakdowns(
  betterPlayer: PlayerScoreBreakdown,
  worsePlayer: PlayerScoreBreakdown
): ScoreComparison {
  const keyAdvantages: ScoreComparison['keyAdvantages'] = [];

  // Find components where the better player has an advantage
  for (const betterComp of betterPlayer.components) {
    const worseComp = worsePlayer.components.find(
      (c) => c.factor === betterComp.factor
    );
    if (!worseComp) continue;

    const difference = betterComp.contribution - worseComp.contribution;

    // Only include meaningful differences (contribution diff > 0.01)
    if (difference > 0.01) {
      keyAdvantages.push({
        factor: betterComp.factor,
        label: betterComp.label,
        difference: Math.round(difference * 1000) / 1000,
        betterPlayerValue: betterComp.normalizedValue,
        worsePlayerValue: worseComp.normalizedValue,
      });
    }
  }

  // Sort by difference (biggest advantages first)
  keyAdvantages.sort((a, b) => b.difference - a.difference);

  return {
    betterPlayer,
    worsePlayer,
    keyAdvantages,
  };
}

/**
 * Generate a human-readable reason based on score comparison
 */
export function generateDetailedComparisonReason(
  comparison: ScoreComparison,
  betterPlayerName: string,
  worsePlayerName: string,
  isStartRecommendation: boolean
): string {
  const { keyAdvantages, betterPlayer, worsePlayer } = comparison;

  if (keyAdvantages.length === 0) {
    // Fallback to generic reason if no clear advantages
    return isStartRecommendation
      ? `${betterPlayerName} has a slightly higher weighted score (${betterPlayer.weightedScore.toFixed(2)} vs ${worsePlayer.weightedScore.toFixed(2)}).`
      : `${worsePlayerName} has a lower weighted score than ${betterPlayerName} (${worsePlayer.weightedScore.toFixed(2)} vs ${betterPlayer.weightedScore.toFixed(2)}).`;
  }

  // Get top 2-3 advantages for the reason
  const topAdvantages = keyAdvantages.slice(0, 3);

  let reason = '';

  if (isStartRecommendation) {
    // "Start Player A" reason
    reason = `${betterPlayerName} outscores ${worsePlayerName} (${betterPlayer.weightedScore.toFixed(2)} vs ${worsePlayer.weightedScore.toFixed(2)}) `;

    if (topAdvantages.length === 1) {
      reason += `primarily due to ${formatAdvantage(topAdvantages[0], true)}.`;
    } else if (topAdvantages.length === 2) {
      reason += `due to ${formatAdvantage(topAdvantages[0], true)} and ${formatAdvantage(topAdvantages[1], true)}.`;
    } else {
      reason += `due to ${formatAdvantage(topAdvantages[0], true)}, ${formatAdvantage(topAdvantages[1], true)}, and ${formatAdvantage(topAdvantages[2], true)}.`;
    }
  } else {
    // "Bench Player B" reason
    reason = `${worsePlayerName} trails ${betterPlayerName} (${worsePlayer.weightedScore.toFixed(2)} vs ${betterPlayer.weightedScore.toFixed(2)}) `;

    if (topAdvantages.length === 1) {
      reason += `mainly because of weaker ${topAdvantages[0].label.toLowerCase()}.`;
    } else if (topAdvantages.length === 2) {
      reason += `due to lower ${topAdvantages[0].label.toLowerCase()} and ${topAdvantages[1].label.toLowerCase()}.`;
    } else {
      reason += `with gaps in ${topAdvantages[0].label.toLowerCase()}, ${topAdvantages[1].label.toLowerCase()}, and ${topAdvantages[2].label.toLowerCase()}.`;
    }
  }

  return reason;
}

function formatAdvantage(
  advantage: ScoreComparison['keyAdvantages'][0],
  isPositive: boolean
): string {
  const label = advantage.label.toLowerCase();

  // Format based on the type of advantage
  if (advantage.factor === 'opponent_difficulty') {
    return 'a better matchup';
  }

  if (advantage.factor === 'volatility') {
    return isPositive ? 'greater consistency' : 'inconsistency';
  }

  if (
    advantage.factor.includes('turnovers') &&
    !advantage.factor.includes('forced')
  ) {
    return isPositive ? 'fewer turnovers' : 'turnover concerns';
  }

  if (
    advantage.factor === 'points_allowed' ||
    advantage.factor === 'yards_allowed'
  ) {
    return isPositive ? `better ${label}` : `worse ${label}`;
  }

  return isPositive ? `stronger ${label}` : `weaker ${label}`;
}

/**
 * Get the top contributing factors for a player's score
 */
export function getTopFactors(
  breakdown: PlayerScoreBreakdown,
  count: number = 3
): ScoreComponent[] {
  // Filter to only positive contributions and get top N
  return breakdown.components.filter((c) => c.contribution > 0).slice(0, count);
}

/**
 * Generate a summary of what drives a player's score
 */
export function generateScoreDriversSummary(
  breakdown: PlayerScoreBreakdown,
  playerName: string
): string {
  const topFactors = getTopFactors(breakdown, 3);

  if (topFactors.length === 0) {
    return `${playerName}'s weighted score is ${breakdown.weightedScore.toFixed(2)}.`;
  }

  const totalPercent = topFactors.reduce((sum, f) => sum + f.percentOfTotal, 0);
  const factorLabels = topFactors.map((f) => f.label.toLowerCase());

  let summary = `${playerName}'s score (${breakdown.weightedScore.toFixed(2)}) is driven by `;

  if (factorLabels.length === 1) {
    summary += `${factorLabels[0]} (${topFactors[0].percentOfTotal}% of score).`;
  } else if (factorLabels.length === 2) {
    summary += `${factorLabels[0]} and ${factorLabels[1]} (${totalPercent}% combined).`;
  } else {
    summary += `${factorLabels[0]}, ${factorLabels[1]}, and ${factorLabels[2]} (${totalPercent}% combined).`;
  }

  return summary;
}
