import { logger } from '../../../../supabase/functions/utils/logger.ts';
import { supabase } from '../../../../supabase/functions/utils/supabase.ts';
import { mapYahooStatsToColumns } from '../statMapper.ts';
import type { PlayerStatsData } from './types.ts';
import {
  calculateWREfficiencyMetrics,
  calculateRBEfficiencyMetrics,
  calculateTEEfficiencyMetrics,
  calculateQBEfficiencyMetrics,
  calculateKEfficiencyMetrics,
} from './efficiencyMetrics/index.ts';

/**
 * Process a single player's stats from Yahoo API response
 */
export function processPlayerStats(
  player: PlayerStatsData,
  seasonYear: number,
  week: number,
  leagueKey: string
): {
  playerId: string;
  stats: Record<string, unknown>;
} | null {
  // Each player has a player array with the actual data
  const playerData = player.player?.[0] as unknown[];
  if (!playerData || !Array.isArray(playerData)) {
    return null;
  }

  // Player data is structured as an array with numeric indices
  // Search through the array to find the correct data
  let playerKey: string | null = null;

  for (let i = 0; i < playerData.length; i++) {
    const item = playerData[i] as Record<string, unknown>;
    if (item && typeof item === 'object') {
      if (item.player_key) playerKey = item.player_key as string;
    }
  }

  // Stats are in the player_stats object
  const playerStats = player.player?.[1] as Record<string, unknown>;
  const stats = (playerStats?.player_stats as Record<string, unknown>)
    ?.stats as Array<Record<string, unknown>>;

  if (!stats || stats.length === 0) {
    logger.debug('Player has no stats, skipping', {
      leagueKey,
      playerKey,
      hasStats: !!stats,
      statsLength: stats?.length,
    });
    return null;
  }

  // Map Yahoo stats to individual columns
  const yahooStats = stats.map((stat) => {
    const statObj = stat as Record<string, unknown>;
    const statData = statObj.stat as Record<string, unknown> | undefined;
    return {
      stat: {
        stat_id: statData?.stat_id as string,
        value: statData?.value as string | number,
      },
    };
  });
  const mappedStats = mapYahooStatsToColumns(yahooStats, playerKey || '');

  // Calculate efficiency metrics (WR)
  const wrEfficiencyMetrics = calculateWREfficiencyMetrics({
    receptions: mappedStats.receptions || 0,
    targets: mappedStats.targets || 0,
    receivingYards: mappedStats.receiving_yards || 0,
  });

  // Calculate RB efficiency metrics (calculated for all players, will be null/0 for non-RBs)
  const rbEfficiencyMetrics = calculateRBEfficiencyMetrics({
    rushingAttempts: mappedStats.rushing_attempts || 0,
    targets: mappedStats.targets || 0,
    rushingTouchdowns: mappedStats.rushing_touchdowns || 0,
    receivingTouchdowns: mappedStats.receiving_touchdowns || 0,
    receptions: mappedStats.receptions || 0,
    receivingYards: mappedStats.receiving_yards || 0,
    rushingYards: mappedStats.rushing_yards || 0,
  });

  // Calculate TE efficiency metrics (calculated for all players, will be null/0 for non-TEs)
  const teEfficiencyMetrics = calculateTEEfficiencyMetrics({
    targets: mappedStats.targets || 0,
    receivingYards: mappedStats.receiving_yards || 0,
    receivingTouchdowns: mappedStats.receiving_touchdowns || 0,
  });

  // Calculate QB efficiency metrics (calculated for all players, will be null/0 for non-QBs)
  const qbEfficiencyMetrics = calculateQBEfficiencyMetrics({
    passingTouchdowns: mappedStats.passing_touchdowns || 0,
    passingYards: mappedStats.passing_yards || 0,
    passesAttempted: mappedStats.passes_attempted || 0,
    interceptions: mappedStats.interceptions || 0,
    fumblesLost: mappedStats.fumbles_lost || 0,
    rushingYards: mappedStats.rushing_yards || 0,
    rushingTouchdowns: mappedStats.rushing_touchdowns || 0,
  });

  // Calculate K efficiency metrics (calculated for all players, will be null/0 for non-Ks)
  const kEfficiencyMetrics = calculateKEfficiencyMetrics({
    fgMade0_19: mappedStats.fg_made_0_19 || 0,
    fgMade20_29: mappedStats.fg_made_20_29 || 0,
    fgMade30_39: mappedStats.fg_made_30_39 || 0,
    fgMade40_49: mappedStats.fg_made_40_49 || 0,
    fgMade50Plus: mappedStats.fg_made_50_plus || 0,
    fgMissed0_19: mappedStats.fg_missed_0_19 || 0,
    fgMissed20_29: mappedStats.fg_missed_20_29 || 0,
    fgMissed30_39: mappedStats.fg_missed_30_39 || 0,
    fgMissed40_49: mappedStats.fg_missed_40_49 || 0,
    fgMissed50Plus: mappedStats.fg_missed_50_plus || 0,
    patMissed: mappedStats.pat_missed || 0,
  });

  // Combine mapped stats with efficiency metrics
  const currentTime = new Date().toISOString();

  return {
    playerId: playerKey || '',
    stats: {
      season_year: seasonYear,
      week: week,
      source: 'actual',
      updated_at: currentTime,
      // Individual stat columns
      ...mappedStats,
      // Efficiency metrics (WR)
      ...wrEfficiencyMetrics,
      // RB efficiency metrics
      ...rbEfficiencyMetrics,
      // TE efficiency metrics
      ...teEfficiencyMetrics,
      // QB efficiency metrics
      ...qbEfficiencyMetrics,
      // K efficiency metrics
      ...kEfficiencyMetrics,
    },
  };
}

/**
 * Process batch of players and prepare stats for insertion
 */
export async function processPlayerStatsBatch(
  players: unknown[],
  seasonYear: number,
  week: number,
  leagueKey: string
): Promise<Array<Record<string, unknown>>> {
  const statsInserts = [];

  for (const player of players) {
    const processed = processPlayerStats(
      player as PlayerStatsData,
      seasonYear,
      week,
      leagueKey
    );

    if (!processed) continue;

    // Get player ID from our database
    const { data: playerRecord } = await supabase
      .from('players')
      .select('id')
      .eq('yahoo_player_id', processed.playerId)
      .single();

    if (!playerRecord) continue;

    statsInserts.push({
      player_id: playerRecord.id,
      ...processed.stats,
    });
  }

  return statsInserts;
}
