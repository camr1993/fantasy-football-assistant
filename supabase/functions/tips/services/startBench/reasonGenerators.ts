import type { PlayerGroup } from './types.ts';
import {
  calculateScoreBreakdown,
  comparePlayerBreakdowns,
  generateDetailedComparisonReason,
  getTopFactors,
} from './scoreBreakdown.ts';

/**
 * Build a score breakdown from player's normalized stats
 */
function buildPlayerBreakdown(player: PlayerGroup) {
  const normalizedStats = player.normalizedStats;
  if (!normalizedStats) {
    return {
      playerId: player.player_id,
      position: player.position,
      weightedScore: player.weighted_score,
      components: [],
    };
  }

  // Convert NormalizedStatsData to the format expected by calculateScoreBreakdown
  const leagueCalcs = {
    player_id: player.player_id,
    recent_mean_norm: normalizedStats.recent_mean_norm,
    recent_std_norm: normalizedStats.recent_std_norm,
    weighted_score: player.weighted_score,
  };

  const playerStats = {
    player_id: player.player_id,
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
    player.player_id,
    player.position,
    leagueCalcs,
    playerStats,
    0 // opponent difficulty not available in current data flow
  );
}

/**
 * Generate detailed reason for starting a player at their position
 */
export function generateStartReason(
  player: PlayerGroup,
  sortedPlayers: PlayerGroup[],
  rank: number,
  startingSlots: number
): string {
  const { position, weighted_score, name } = player;

  // Find the best player currently not starting (who should be starting)
  const playerToBenchIndex = sortedPlayers.findIndex(
    (p, idx) =>
      idx >= startingSlots &&
      p.slot &&
      !['BENCH', 'IR', 'BN'].includes(p.slot.toUpperCase())
  );

  // Or find the worst starter (last player who should start)
  const worstStarterIndex = Math.min(
    startingSlots - 1,
    sortedPlayers.length - 1
  );
  const comparisonPlayerIndex =
    playerToBenchIndex >= 0 ? playerToBenchIndex : worstStarterIndex;

  if (comparisonPlayerIndex >= 0 && comparisonPlayerIndex !== rank) {
    const comparisonPlayer = sortedPlayers[comparisonPlayerIndex];

    // Build breakdowns and compare
    const playerBreakdown = buildPlayerBreakdown(player);
    const comparisonBreakdown = buildPlayerBreakdown(comparisonPlayer);

    if (
      playerBreakdown.components.length > 0 &&
      comparisonBreakdown.components.length > 0
    ) {
      const comparison = comparePlayerBreakdowns(
        playerBreakdown,
        comparisonBreakdown
      );
      return generateDetailedComparisonReason(
        comparison,
        name,
        comparisonPlayer.name,
        true
      );
    }
  }

  // Fallback to simpler reason with score driver summary
  const breakdown = buildPlayerBreakdown(player);
  const topFactors = getTopFactors(breakdown, 2);

  let reason = `Ranked #${rank + 1} ${position} with score ${weighted_score.toFixed(2)}. `;

  if (topFactors.length > 0) {
    const factorLabels = topFactors.map((f) => f.label.toLowerCase());
    if (factorLabels.length === 1) {
      reason += `Strength: ${factorLabels[0]}.`;
    } else {
      reason += `Key strengths: ${factorLabels.join(' and ')}.`;
    }
  }

  return reason.trim();
}

/**
 * Generate detailed reason for benching a player at their position
 */
export function generateBenchReason(
  player: PlayerGroup,
  sortedPlayers: PlayerGroup[],
  rank: number,
  startingSlots: number
): string {
  const { position, weighted_score, name } = player;
  const betterPlayers = sortedPlayers.slice(0, startingSlots);

  if (betterPlayers.length === 0) {
    return `Ranked #${rank + 1} of ${sortedPlayers.length} ${position}s with weighted score ${weighted_score.toFixed(2)}.`;
  }

  // Compare against the last starter (the threshold player)
  const thresholdPlayer = betterPlayers[betterPlayers.length - 1];

  // Build breakdowns and compare
  const playerBreakdown = buildPlayerBreakdown(player);
  const thresholdBreakdown = buildPlayerBreakdown(thresholdPlayer);

  if (
    playerBreakdown.components.length > 0 &&
    thresholdBreakdown.components.length > 0
  ) {
    const comparison = comparePlayerBreakdowns(
      thresholdBreakdown,
      playerBreakdown
    );
    return generateDetailedComparisonReason(
      comparison,
      thresholdPlayer.name,
      name,
      false
    );
  }

  // Fallback to generic reason
  return `${name} trails ${thresholdPlayer.name} (${weighted_score.toFixed(2)} vs ${thresholdPlayer.weighted_score.toFixed(2)}). Not among top ${startingSlots} ${position}s.`;
}

/**
 * Generate reason for benching an injured player
 */
export function generateInjuryReason(player: PlayerGroup): string {
  return `${player.name} is currently injured and should not be started. Move to bench or IR slot.`;
}

/**
 * Generate reason for benching a player on bye week
 */
export function generateByeWeekReason(player: PlayerGroup): string {
  return `${player.name} has a bye week and cannot play. Move to bench.`;
}

/**
 * Generate detailed reason for starting a player in flex (W/R/T) slot
 */
export function generateFlexStartReason(
  player: PlayerGroup,
  sortedPlayers: PlayerGroup[],
  rank: number,
  flexSlots: number
): string {
  const { position, weighted_score, name } = player;

  // Find the player currently in the flex spot who shouldn't be
  const playerToBenchIndex = sortedPlayers.findIndex(
    (p, idx) =>
      idx >= flexSlots &&
      p.slot &&
      !['BENCH', 'IR', 'BN'].includes(p.slot.toUpperCase())
  );

  if (playerToBenchIndex >= 0) {
    const comparisonPlayer = sortedPlayers[playerToBenchIndex];

    // Build breakdowns and compare
    const playerBreakdown = buildPlayerBreakdown(player);
    const comparisonBreakdown = buildPlayerBreakdown(comparisonPlayer);

    if (
      playerBreakdown.components.length > 0 &&
      comparisonBreakdown.components.length > 0
    ) {
      const comparison = comparePlayerBreakdowns(
        playerBreakdown,
        comparisonBreakdown
      );
      const detailedReason = generateDetailedComparisonReason(
        comparison,
        name,
        comparisonPlayer.name,
        true
      );
      return `Best flex option. ${detailedReason}`;
    }
  }

  // Fallback reason
  const breakdown = buildPlayerBreakdown(player);
  const topFactors = getTopFactors(breakdown, 2);

  let reason = `Best available for W/R/T flex. Ranked #${rank + 1} flex-eligible (${position}) with score ${weighted_score.toFixed(2)}. `;

  if (topFactors.length > 0) {
    const factorLabels = topFactors.map((f) => f.label.toLowerCase());
    reason += `Strengths: ${factorLabels.join(', ')}.`;
  }

  return reason.trim();
}

/**
 * Generate detailed reason for benching a player from flex consideration
 */
export function generateFlexBenchReason(
  player: PlayerGroup,
  sortedPlayers: PlayerGroup[],
  rank: number,
  flexSlots: number
): string {
  const { position, weighted_score, name } = player;
  const betterPlayers = sortedPlayers.slice(0, flexSlots);

  if (betterPlayers.length === 0) {
    return `Ranked #${rank + 1} of ${sortedPlayers.length} flex-eligible players (${position}) with weighted score ${weighted_score.toFixed(2)}.`;
  }

  // Compare against the last flex starter
  const thresholdPlayer = betterPlayers[betterPlayers.length - 1];

  // Build breakdowns and compare
  const playerBreakdown = buildPlayerBreakdown(player);
  const thresholdBreakdown = buildPlayerBreakdown(thresholdPlayer);

  if (
    playerBreakdown.components.length > 0 &&
    thresholdBreakdown.components.length > 0
  ) {
    const comparison = comparePlayerBreakdowns(
      thresholdBreakdown,
      playerBreakdown
    );
    const detailedReason = generateDetailedComparisonReason(
      comparison,
      thresholdPlayer.name,
      name,
      false
    );
    return `Not best flex option. ${detailedReason}`;
  }

  // Fallback
  return `${name} (${position}) trails ${thresholdPlayer.name} (${thresholdPlayer.position}) for flex: ${weighted_score.toFixed(2)} vs ${thresholdPlayer.weighted_score.toFixed(2)}.`;
}
