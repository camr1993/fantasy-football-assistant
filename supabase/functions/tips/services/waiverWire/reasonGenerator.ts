import {
  calculateScoreBreakdown,
  comparePlayerBreakdowns,
  generateDetailedComparisonReason,
  type PlayerScoreBreakdown,
} from '../startBench/scoreBreakdown.ts';
import type {
  NormalizedStats,
  RosteredPlayerWithScore,
  WaiverPlayerWithStats,
} from './types.ts';

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
export function generateWaiverWireReason(
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

