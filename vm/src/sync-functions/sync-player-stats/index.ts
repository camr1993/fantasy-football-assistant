import { logger } from '../../../../supabase/functions/utils/logger.ts';
import { supabase } from '../../../../supabase/functions/utils/supabase.ts';
import { getMostRecentNFLWeek } from '../../../../supabase/functions/utils/syncHelpers.ts';
import { fetchAllPlayers } from './fetchPlayers.ts';
import { fetchYahooPlayerStats } from './fetchYahooStats.ts';
import { processPlayerStatsBatch } from './processStats.ts';
import { calculate3WeekRollingAverages } from './calculate3WeekAverages.ts';
import {
  normalizeWREfficiencyMetricsGlobally,
  normalizeRBEfficiencyMetricsGlobally,
  normalizeTEEfficiencyMetricsGlobally,
  normalizeQBEfficiencyMetricsGlobally,
} from './normalizeEfficiencyMetrics/index.ts';

/**
 * Sync all player stats (master data)
 * Gets player stats from user's leagues since global players endpoint requires specific player keys
 */
export async function syncAllPlayerStats(
  yahooToken: string,
  week?: number
): Promise<number> {
  const currentWeek = week ?? getMostRecentNFLWeek();

  logger.info('Syncing all player stats from admin league', {
    week: currentWeek,
    isCustomWeek: week !== undefined,
  });
  const currentYear = new Date().getFullYear();

  // Get the admin user's league directly from the database
  // First, get the admin user's ID
  const superAdminUserId = Deno.env.get('SUPER_ADMIN_USER_ID');

  // Get a league where the admin user has a team
  const { data: leagueData, error: leagueError } = await supabase
    .from('leagues')
    .select(
      `
      yahoo_league_id,
      name,
      season_year,
      teams!inner(id, user_id)
    `
    )
    .eq('season_year', currentYear)
    .eq('teams.user_id', superAdminUserId)
    .limit(1)
    .single();

  if (leagueError || !leagueData) {
    logger.error('Failed to fetch admin user league from database', {
      error: leagueError,
      currentYear,
      adminUserId: superAdminUserId,
    });
    throw new Error(
      `Failed to fetch admin user league: ${
        leagueError?.message || 'No league found for admin user'
      }`
    );
  }

  const leagueKey = leagueData.yahoo_league_id;
  let totalProcessed = 0;

  try {
    // Fetch all players from database
    const allPlayerRecords = await fetchAllPlayers();

    if (allPlayerRecords.length === 0) {
      logger.error('No players found in database');
      return 0;
    }

    // Fetch player stats from Yahoo API
    const allPlayers = await fetchYahooPlayerStats(
      yahooToken,
      allPlayerRecords,
      currentWeek
    );

    if (allPlayers.length === 0) {
      logger.warn('No player stats found in league', { leagueKey });
      return 0;
    }

    // Process stats in larger batches to reduce processing time
    const batchSize = 100;
    for (let i = 0; i < allPlayers.length; i += batchSize) {
      const batch = allPlayers.slice(i, i + batchSize);

      const statsInserts = await processPlayerStatsBatch(
        batch,
        currentYear,
        currentWeek,
        leagueKey
      );

      if (statsInserts.length > 0) {
        const { error } = await supabase
          .from('player_stats')
          .upsert(statsInserts, {
            onConflict: 'player_id,season_year,week,source',
          });

        if (error) {
          logger.error('Failed to upsert player stats batch', {
            error,
            leagueKey,
          });
        } else {
          totalProcessed += statsInserts.length;
        }
      } else {
        logger.warn('No stats to insert for this batch', {
          leagueKey,
          batchSize: batch.length,
        });
      }
    }

    logger.info('Completed syncing player stats from league', {
      leagueKey,
      count: allPlayers.length,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Error syncing player stats from league', {
      leagueKey,
      error: errorMessage,
    });
  }

  // Calculate 3-week rolling averages for efficiency metrics using SQL
  await calculate3WeekRollingAverages(currentYear, currentWeek);

  // Normalize efficiency metrics globally across all WRs
  await normalizeWREfficiencyMetricsGlobally(currentYear, currentWeek);

  // Normalize RB efficiency metrics globally across all RBs
  await normalizeRBEfficiencyMetricsGlobally(currentYear, currentWeek);

  // Normalize TE efficiency metrics globally across all TEs
  await normalizeTEEfficiencyMetricsGlobally(currentYear, currentWeek);

  // Normalize QB efficiency metrics globally across all QBs
  await normalizeQBEfficiencyMetricsGlobally(currentYear, currentWeek);

  logger.info('Completed syncing all player stats from admin user league', {
    totalProcessed,
    leagueKey,
    adminUserId: superAdminUserId,
  });
  return totalProcessed;
}
