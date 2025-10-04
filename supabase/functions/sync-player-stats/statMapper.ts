/**
 * Maps Yahoo Fantasy Sports stats to individual database columns
 * This allows for league-agnostic master data storage
 */

export interface YahooStat {
  stat: {
    stat_id: string;
    value: string | number;
  };
}

export interface MappedStats {
  // Passing
  passing_yards: number;
  passing_touchdowns: number;
  interceptions: number;

  // Rushing
  rushing_yards: number;
  rushing_touchdowns: number;
  fumbles_lost: number;
  rushing_attempts: number;

  // Receiving
  receptions: number;
  receiving_yards: number;
  receiving_touchdowns: number;
  targets: number;

  // Returns
  return_touchdowns: number;

  // Misc
  two_point_conversions: number;
  offensive_fumble_return_td: number;

  // Kicking
  fg_made_0_19: number;
  fg_made_20_29: number;
  fg_made_30_39: number;
  fg_made_40_49: number;
  fg_made_50_plus: number;
  fg_missed_0_19: number;
  fg_missed_20_29: number;
  pat_made: number;
  pat_missed: number;

  // Defense
  points_allowed: number;
  sacks: number;
  defensive_int: number;
  fumble_recoveries: number;
  defensive_touchdowns: number;
  safeties: number;
  block_kicks: number;

  // Points Allowed Ranges (mutually exclusive)
  points_allowed_0: number;
  points_allowed_1_6: number;
  points_allowed_7_13: number;
  points_allowed_14_20: number;
  points_allowed_21_27: number;
  points_allowed_28_34: number;
  points_allowed_35_plus: number;
}

/**
 * Maps Yahoo stats array to individual database columns
 */
export function mapYahooStatsToColumns(
  yahooStats: YahooStat[],
  playerKey?: string
): MappedStats {
  // Initialize all stats to 0
  const mappedStats: MappedStats = {
    // Passing
    passing_yards: 0,
    passing_touchdowns: 0,
    interceptions: 0,

    // Rushing
    rushing_yards: 0,
    rushing_touchdowns: 0,
    fumbles_lost: 0,
    rushing_attempts: 0,

    // Receiving
    receptions: 0,
    receiving_yards: 0,
    receiving_touchdowns: 0,
    targets: 0,

    // Returns
    return_touchdowns: 0,

    // Misc
    two_point_conversions: 0,
    offensive_fumble_return_td: 0,

    // Kicking
    fg_made_0_19: 0,
    fg_made_20_29: 0,
    fg_made_30_39: 0,
    fg_made_40_49: 0,
    fg_made_50_plus: 0,
    fg_missed_0_19: 0,
    fg_missed_20_29: 0,
    pat_made: 0,
    pat_missed: 0,

    // Defense
    points_allowed: 0,
    sacks: 0,
    defensive_int: 0,
    fumble_recoveries: 0,
    defensive_touchdowns: 0,
    safeties: 0,
    block_kicks: 0,

    // Points Allowed Ranges (mutually exclusive)
    points_allowed_0: 0,
    points_allowed_1_6: 0,
    points_allowed_7_13: 0,
    points_allowed_14_20: 0,
    points_allowed_21_27: 0,
    points_allowed_28_34: 0,
    points_allowed_35_plus: 0,
  };

  // Map each Yahoo stat to the appropriate column
  for (const stat of yahooStats) {
    // Skip invalid stats
    if (
      !stat ||
      !stat.stat ||
      !stat.stat.stat_id ||
      stat.stat.value === undefined ||
      stat.stat.value === null
    ) {
      continue;
    }

    const statId = parseInt(stat.stat.stat_id);
    const value =
      typeof stat.stat.value === 'string'
        ? parseFloat(stat.stat.value)
        : stat.stat.value;

    // Skip if statId is NaN or value is NaN/undefined
    if (isNaN(statId) || isNaN(value)) {
      continue;
    }

    switch (statId) {
      // Passing
      case 4:
        mappedStats.passing_yards = value;
        break;
      case 5:
        mappedStats.passing_touchdowns = value;
        break;
      case 6:
        mappedStats.interceptions = value;
        break;

      // Rushing
      case 8:
        mappedStats.rushing_attempts = value;
        break;
      case 9:
        mappedStats.rushing_yards = value;
        break;
      case 10:
        mappedStats.rushing_touchdowns = value;
        break;

      // Receiving
      case 11:
        mappedStats.receptions = value;
        break;
      case 12:
        mappedStats.receiving_yards = value;
        break;
      case 13:
        mappedStats.receiving_touchdowns = value;
        break;
      case 78:
        mappedStats.targets = value;
        break;

      // Returns
      case 15:
        mappedStats.return_touchdowns = value;
        break;

      // Misc
      case 16:
        mappedStats.two_point_conversions = value;
        break;
      case 18:
        mappedStats.fumbles_lost = value;
        break;
      case 57:
        mappedStats.offensive_fumble_return_td = value;
        break;

      // Additional stats that might not be in main documentation

      // Kicking
      case 19:
        mappedStats.fg_made_0_19 = value;
        break;
      case 20:
        mappedStats.fg_made_20_29 = value;
        break;
      case 21:
        mappedStats.fg_made_30_39 = value;
        break;
      case 22:
        mappedStats.fg_made_40_49 = value;
        break;
      case 23:
        mappedStats.fg_made_50_plus = value;
        break;
      case 24:
        mappedStats.fg_missed_0_19 = value;
        break;
      case 25:
        mappedStats.fg_missed_20_29 = value;
        break;
      case 29:
        mappedStats.pat_made = value;
        break;
      case 30:
        mappedStats.pat_missed = value;
        break;

      // Defense
      case 31:
        mappedStats.points_allowed = value;
        break;
      case 32:
        mappedStats.sacks = value;
        break;
      case 33:
        mappedStats.defensive_int = value;
        break;
      case 34:
        mappedStats.fumble_recoveries = value;
        break;
      case 35:
        mappedStats.defensive_touchdowns = value;
        break;
      case 36:
        mappedStats.safeties = value;
        break;
      case 37:
        mappedStats.block_kicks = value;
        break;

      // Points Allowed Ranges (mutually exclusive)
      case 50:
        mappedStats.points_allowed_0 = value;
        break;
      case 51:
        mappedStats.points_allowed_1_6 = value;
        break;
      case 52:
        mappedStats.points_allowed_7_13 = value;
        break;
      case 53:
        mappedStats.points_allowed_14_20 = value;
        break;
      case 54:
        mappedStats.points_allowed_21_27 = value;
        break;
      case 55:
        mappedStats.points_allowed_28_34 = value;
        break;
      case 56:
        mappedStats.points_allowed_35_plus = value;
        break;

      // Advanced stats (not stored in individual columns yet)
      case 1001:
      case 1002:
      case 1003:
      case 1004:
      case 1005:
      case 1006:
      case 1007:
      case 1008:
      case 1009:
      case 1010:
      case 1011:
      case 1012:
      case 1013:
        // These are advanced stats that we're not storing individually yet
        // They could be added to a separate advanced_stats JSONB column if needed
        break;

      default:
        // Unknown stat ID - log it for debugging (but only if it's a reasonable stat ID)
        // if (statId > 0 && statId < 10000) {
        //   console.warn(`Unknown stat ID: ${statId} with value: ${value}`, {
        //     statId,
        //     value,
        //     playerKey: playerKey || 'unknown',
        //     allStatIds: yahooStats.map((s) => s?.stat?.stat_id).filter(Boolean),
        //   });
        // }
        break;
    }
  }

  return mappedStats;
}

/**
 * Calculates fantasy points for a player using league-specific modifiers
 * This would typically be done in a database query, but this is a helper for reference
 */
export function calculateFantasyPoints(
  mappedStats: MappedStats,
  leagueModifiers: Record<number, number>
): number {
  let totalPoints = 0;

  // Passing
  totalPoints += mappedStats.passing_yards * (leagueModifiers[4] || 0);
  totalPoints += mappedStats.passing_touchdowns * (leagueModifiers[5] || 0);
  totalPoints += mappedStats.interceptions * (leagueModifiers[6] || 0);

  // Rushing
  totalPoints += mappedStats.rushing_yards * (leagueModifiers[9] || 0);
  totalPoints += mappedStats.rushing_touchdowns * (leagueModifiers[10] || 0);

  // Receiving
  totalPoints += mappedStats.receptions * (leagueModifiers[11] || 0);
  totalPoints += mappedStats.receiving_yards * (leagueModifiers[12] || 0);
  totalPoints += mappedStats.receiving_touchdowns * (leagueModifiers[13] || 0);

  // Returns
  totalPoints += mappedStats.return_touchdowns * (leagueModifiers[15] || 0);

  // Misc
  totalPoints += mappedStats.two_point_conversions * (leagueModifiers[16] || 0);
  totalPoints += mappedStats.fumbles_lost * (leagueModifiers[18] || 0);
  totalPoints +=
    mappedStats.offensive_fumble_return_td * (leagueModifiers[57] || 0);

  // Kicking
  totalPoints += mappedStats.fg_made_0_19 * (leagueModifiers[19] || 0);
  totalPoints += mappedStats.fg_made_20_29 * (leagueModifiers[20] || 0);
  totalPoints += mappedStats.fg_made_30_39 * (leagueModifiers[21] || 0);
  totalPoints += mappedStats.fg_made_40_49 * (leagueModifiers[22] || 0);
  totalPoints += mappedStats.fg_made_50_plus * (leagueModifiers[23] || 0);
  totalPoints += mappedStats.fg_missed_0_19 * (leagueModifiers[24] || 0);
  totalPoints += mappedStats.fg_missed_20_29 * (leagueModifiers[25] || 0);
  totalPoints += mappedStats.pat_made * (leagueModifiers[29] || 0);
  totalPoints += mappedStats.pat_missed * (leagueModifiers[30] || 0);

  // Defense
  totalPoints += mappedStats.points_allowed * (leagueModifiers[31] || 0);
  totalPoints += mappedStats.sacks * (leagueModifiers[32] || 0);
  totalPoints += mappedStats.defensive_int * (leagueModifiers[33] || 0);
  totalPoints += mappedStats.fumble_recoveries * (leagueModifiers[34] || 0);
  totalPoints += mappedStats.defensive_touchdowns * (leagueModifiers[35] || 0);
  totalPoints += mappedStats.safeties * (leagueModifiers[36] || 0);
  totalPoints += mappedStats.block_kicks * (leagueModifiers[37] || 0);

  // Points Allowed Ranges (mutually exclusive)
  totalPoints += mappedStats.points_allowed_0 * (leagueModifiers[50] || 0);
  totalPoints += mappedStats.points_allowed_1_6 * (leagueModifiers[51] || 0);
  totalPoints += mappedStats.points_allowed_7_13 * (leagueModifiers[52] || 0);
  totalPoints += mappedStats.points_allowed_14_20 * (leagueModifiers[53] || 0);
  totalPoints += mappedStats.points_allowed_21_27 * (leagueModifiers[54] || 0);
  totalPoints += mappedStats.points_allowed_28_34 * (leagueModifiers[55] || 0);
  totalPoints +=
    mappedStats.points_allowed_35_plus * (leagueModifiers[56] || 0);

  return totalPoints;
}
