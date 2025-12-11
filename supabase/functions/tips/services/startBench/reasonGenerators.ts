import type { PlayerGroup } from './types.ts';

/**
 * Generate detailed reason for starting a player at their position
 */
export function generateStartReason(
  player: PlayerGroup,
  sortedPlayers: PlayerGroup[],
  rank: number,
  startingSlots: number
): string {
  const { stats, position, weighted_score } = player;
  const worsePlayers = sortedPlayers.slice(rank + 1, startingSlots);

  let reason = `Ranked #${rank + 1} of ${sortedPlayers.length} ${position}s with weighted score ${weighted_score.toFixed(2)} (top ${startingSlots} should start). `;

  reason += getPositionStats(position, stats, player.fantasy_points, 'start');

  if (worsePlayers.length > 0) {
    const worsePlayer = worsePlayers[0];
    reason += `Better than ${worsePlayer.name} (${worsePlayer.weighted_score.toFixed(2)} vs ${weighted_score.toFixed(2)}).`;
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
  const { stats, position, weighted_score } = player;
  const betterPlayers = sortedPlayers.slice(0, startingSlots);

  let reason = `Ranked #${rank + 1} of ${sortedPlayers.length} ${position}s with weighted score ${weighted_score.toFixed(2)} (only top ${startingSlots} should start). `;

  reason += getPositionStats(position, stats, player.fantasy_points, 'bench');

  if (betterPlayers.length > 0) {
    const betterPlayer = betterPlayers[betterPlayers.length - 1];
    reason += `Worse than ${betterPlayer.name} (${weighted_score.toFixed(2)} vs ${betterPlayer.weighted_score.toFixed(2)}).`;
  }

  return reason.trim();
}

/**
 * Generate reason for benching an injured player
 */
export function generateInjuryReason(player: PlayerGroup): string {
  return `${player.name} is currently injured and should not be started. Weighted score: ${player.weighted_score.toFixed(2)}.`;
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
  const { stats, position, weighted_score } = player;
  const worsePlayers = sortedPlayers.slice(rank + 1, flexSlots);

  let reason = `Best available for W/R/T flex slot. Ranked #${rank + 1} of ${sortedPlayers.length} flex-eligible players (${position}) with weighted score ${weighted_score.toFixed(2)}. `;

  reason += getFlexPositionStats(position, stats);

  if (worsePlayers.length > 0) {
    const worsePlayer = worsePlayers[0];
    reason += `Better flex option than ${worsePlayer.name} (${worsePlayer.position}) (${weighted_score.toFixed(2)} vs ${worsePlayer.weighted_score.toFixed(2)}).`;
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
  const { stats, position, weighted_score } = player;
  const betterPlayers = sortedPlayers.slice(0, flexSlots);

  let reason = `Not the best option for W/R/T flex slot. Ranked #${rank + 1} of ${sortedPlayers.length} flex-eligible players (${position}) with weighted score ${weighted_score.toFixed(2)}. `;

  reason += getFlexPositionStats(position, stats);

  if (betterPlayers.length > 0) {
    const betterPlayer = betterPlayers[betterPlayers.length - 1];
    reason += `Worse flex option than ${betterPlayer.name} (${betterPlayer.position}) (${weighted_score.toFixed(2)} vs ${betterPlayer.weighted_score.toFixed(2)}).`;
  }

  return reason.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper functions for position-specific stats
// ─────────────────────────────────────────────────────────────────────────────

function getPositionStats(
  position: string,
  stats: PlayerGroup['stats'],
  fantasyPoints: number,
  type: 'start' | 'bench'
): string {
  if (!stats) return '';

  switch (position) {
    case 'QB':
      return getQBStats(stats, type);
    case 'RB':
      return getRBStats(stats, type);
    case 'WR':
    case 'TE':
      return getReceiverStats(stats, type);
    case 'K':
    case 'DEF':
      return `Projected fantasy points: ${fantasyPoints.toFixed(2)}. `;
    default:
      return '';
  }
}

function getQBStats(
  stats: NonNullable<PlayerGroup['stats']>,
  type: 'start' | 'bench'
): string {
  const yards = stats.passing_yards || 0;
  const tds = stats.passing_touchdowns || 0;
  const ints = stats.interceptions || 0;

  let result = `Projected: ${yards} pass yds, ${tds} TDs, ${ints} INTs. `;

  if (type === 'start' && stats.passing_efficiency_3wk_avg) {
    result += `3-wk passing efficiency: ${stats.passing_efficiency_3wk_avg.toFixed(2)}. `;
  } else if (type === 'bench' && stats.turnovers_3wk_avg) {
    result += `3-wk avg turnovers: ${stats.turnovers_3wk_avg.toFixed(2)}. `;
  }

  return result;
}

function getRBStats(
  stats: NonNullable<PlayerGroup['stats']>,
  type: 'start' | 'bench'
): string {
  const rushYds = stats.rushing_yards || 0;
  const rushTDs = stats.rushing_touchdowns || 0;
  const rec = stats.receptions || 0;
  const recYds = stats.receiving_yards || 0;

  let result =
    type === 'start'
      ? `Projected: ${rushYds} rush yds, ${rushTDs} rush TDs, ${rec} rec, ${recYds} rec yds. `
      : `Projected: ${rushYds} rush yds, ${rushTDs} rush TDs, ${rec} rec. `;

  if (stats.yards_per_touch_3wk_avg) {
    result += `3-wk avg: ${stats.yards_per_touch_3wk_avg.toFixed(1)} yds/touch. `;
  }

  return result;
}

function getReceiverStats(
  stats: NonNullable<PlayerGroup['stats']>,
  type: 'start' | 'bench'
): string {
  const targets = stats.targets || 0;
  const rec = stats.receptions || 0;
  const recYds = stats.receiving_yards || 0;
  const recTDs = stats.receiving_touchdowns || 0;

  let result =
    type === 'start'
      ? `Projected: ${targets} targets, ${rec} rec, ${recYds} rec yds, ${recTDs} rec TDs. `
      : `Projected: ${targets} targets, ${rec} rec, ${recYds} rec yds. `;

  if (stats.targets_per_game_3wk_avg) {
    result += `3-wk avg: ${stats.targets_per_game_3wk_avg.toFixed(1)} targets/game`;
    if (type === 'start' && stats.yards_per_target_3wk_avg) {
      result += `, ${stats.yards_per_target_3wk_avg.toFixed(1)} yds/target`;
    }
    result += '. ';
  }

  return result;
}

function getFlexPositionStats(
  position: string,
  stats: PlayerGroup['stats']
): string {
  if (!stats) return '';

  if (position === 'RB') {
    const rushYds = stats.rushing_yards || 0;
    const rushTDs = stats.rushing_touchdowns || 0;
    const rec = stats.receptions || 0;
    const recYds = stats.receiving_yards || 0;

    let result = `Projected: ${rushYds} rush yds, ${rushTDs} rush TDs, ${rec} rec, ${recYds} rec yds. `;
    if (stats.yards_per_touch_3wk_avg) {
      result += `3-wk avg: ${stats.yards_per_touch_3wk_avg.toFixed(1)} yds/touch. `;
    }
    return result;
  }

  if (position === 'WR' || position === 'TE') {
    const targets = stats.targets || 0;
    const rec = stats.receptions || 0;
    const recYds = stats.receiving_yards || 0;
    const recTDs = stats.receiving_touchdowns || 0;

    let result = `Projected: ${targets} targets, ${rec} rec, ${recYds} rec yds, ${recTDs} rec TDs. `;
    if (stats.targets_per_game_3wk_avg) {
      result += `3-wk avg: ${stats.targets_per_game_3wk_avg.toFixed(1)} targets/game. `;
    }
    return result;
  }

  return '';
}
