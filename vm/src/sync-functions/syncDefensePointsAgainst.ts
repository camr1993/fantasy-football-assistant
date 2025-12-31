import { logger } from '../../../supabase/functions/utils/logger.ts';
import { supabase } from '../../../supabase/functions/utils/supabase.ts';
import { getMostRecentNFLWeek } from '../../../supabase/functions/utils/syncHelpers.ts';

interface DefensePointsAgainst {
  league_id: string;
  player_id: string;
  season_year: number;
  week: number;
  qb_pts_against: number;
  rb_pts_against: number;
  wr_pts_against: number;
  te_pts_against: number;
  k_pts_against: number;
  qb_rolling_3_week_avg: number;
  rb_rolling_3_week_avg: number;
  wr_rolling_3_week_avg: number;
  te_rolling_3_week_avg: number;
  k_rolling_3_week_avg: number;
  qb_rolling_3_wk_avg_norm: number;
  rb_rolling_3_wk_avg_norm: number;
  wr_rolling_3_wk_avg_norm: number;
  te_rolling_3_wk_avg_norm: number;
  k_rolling_3_wk_avg_norm: number;
}

/**
 * Sync defense points against for all defense players
 * Calculates weekly fantasy points allowed by position against each defense
 * @param week - The week to process
 * @param leagueIds - If provided, only process these specific leagues
 */
export async function syncDefensePointsAgainst(
  week?: number,
  leagueIds?: string[]
): Promise<number> {
  const currentYear = new Date().getFullYear();
  const currentWeek = week ?? getMostRecentNFLWeek();

  logger.info('Starting defense points against sync', {
    week: currentWeek,
    seasonYear: currentYear,
    leagueIds: leagueIds?.length || 'all',
  });

  try {
    // Get leagues for the current season (optionally filtered)
    let leaguesQuery = supabase
      .from('leagues')
      .select('id, name, season_year')
      .eq('season_year', currentYear);

    if (leagueIds && leagueIds.length > 0) {
      leaguesQuery = leaguesQuery.in('id', leagueIds);
    }

    const { data: leagues, error: leaguesError } = await leaguesQuery;

    if (leaguesError) {
      logger.error('Failed to fetch leagues', { error: leaguesError });
      throw new Error(`Failed to fetch leagues: ${leaguesError.message}`);
    }

    if (!leagues || leagues.length === 0) {
      logger.warn('No leagues found for current season');
      return 0;
    }

    logger.info(`Found ${leagues.length} leagues for season ${currentYear}`);

    // Get all defense players
    const { data: defensePlayers, error: defenseError } = await supabase
      .from('players')
      .select('id, position')
      .eq('position', 'DEF');

    if (defenseError) {
      logger.error('Failed to fetch defense players', { error: defenseError });
      throw new Error(
        `Failed to fetch defense players: ${defenseError.message}`
      );
    }

    if (!defensePlayers || defensePlayers.length === 0) {
      logger.warn('No defense players found');
      return 0;
    }

    logger.info(`Found ${defensePlayers.length} defense players`);

    let totalProcessed = 0;
    const PLAYER_CONCURRENCY = 10; // Process 10 defense players in parallel
    const LEAGUE_CONCURRENCY = 3; // Process 3 leagues in parallel

    // Process leagues in parallel batches
    for (let i = 0; i < leagues.length; i += LEAGUE_CONCURRENCY) {
      const leagueBatch = leagues.slice(i, i + LEAGUE_CONCURRENCY);

      const leagueResults = await Promise.all(
        leagueBatch.map(async (league: any) => {
          logger.info('Processing league', {
            leagueId: league.id,
            leagueName: league.name,
          });

          let leagueProcessed = 0;
          const pointsAgainstBatch: DefensePointsAgainst[] = [];

          // Process defense players in parallel batches
          for (let j = 0; j < defensePlayers.length; j += PLAYER_CONCURRENCY) {
            const playerBatch = defensePlayers.slice(j, j + PLAYER_CONCURRENCY);

            const results = await Promise.all(
              playerBatch.map(async (defensePlayer: any) => {
                try {
                  return await calculateDefensePointsAgainst(
                    league.id,
                    defensePlayer.id,
                    currentYear,
                    currentWeek
                  );
                } catch (error) {
                  logger.error('Failed to process defense player for league', {
                    leagueId: league.id,
                    playerId: defensePlayer.id,
                    error:
                      error instanceof Error ? error.message : String(error),
                  });
                  return null;
                }
              })
            );

            // Collect valid results for batch upsert
            for (const pointsAgainst of results) {
              if (pointsAgainst) {
                pointsAgainstBatch.push(pointsAgainst);
              }
            }
          }

          // Batch upsert all defense points for this league
          if (pointsAgainstBatch.length > 0) {
            await upsertDefensePointsAgainstBatch(pointsAgainstBatch);
            leagueProcessed = pointsAgainstBatch.length;
          }

          return leagueProcessed;
        })
      );

      totalProcessed += leagueResults.reduce(
        (sum: number, count: number) => sum + count,
        0
      );
    }

    logger.info('Completed defense points against sync', {
      totalProcessed,
      leaguesCount: leagues.length,
      defensePlayersCount: defensePlayers.length,
    });

    return totalProcessed;
  } catch (error) {
    logger.error('Defense points against sync failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Calculate rolling 3-week averages for a defense player
 */
async function calculateRollingAverages(
  leagueId: string,
  defensePlayerId: string,
  seasonYear: number,
  currentWeek: number,
  currentWeekData: DefensePointsAgainst
): Promise<{
  qb_rolling_3_week_avg: number;
  rb_rolling_3_week_avg: number;
  wr_rolling_3_week_avg: number;
  te_rolling_3_week_avg: number;
  k_rolling_3_week_avg: number;
}> {
  try {
    // Special case for week 1: rolling average is just the current week's data
    if (currentWeek === 1) {
      return {
        qb_rolling_3_week_avg: currentWeekData.qb_pts_against,
        rb_rolling_3_week_avg: currentWeekData.rb_pts_against,
        wr_rolling_3_week_avg: currentWeekData.wr_pts_against,
        te_rolling_3_week_avg: currentWeekData.te_pts_against,
        k_rolling_3_week_avg: currentWeekData.k_pts_against,
      };
    }

    // Get the previous weeks of data for this defense player
    // For week 2: week 1
    // For week 3+: weeks (currentWeek-2) to (currentWeek-1)
    const startWeek = Math.max(1, currentWeek - 2);
    const endWeek = currentWeek - 1;

    const { data: recentData, error } = await supabase
      .from('defense_points_against')
      .select(
        'week, qb_pts_against, rb_pts_against, wr_pts_against, te_pts_against, k_pts_against'
      )
      .eq('league_id', leagueId)
      .eq('player_id', defensePlayerId)
      .eq('season_year', seasonYear)
      .gte('week', startWeek)
      .lte('week', endWeek)
      .order('week', { ascending: true });

    if (error) {
      logger.error('Failed to fetch recent defense data for rolling average', {
        error,
        leagueId,
        defensePlayerId,
        seasonYear,
        currentWeek,
      });
      return {
        qb_rolling_3_week_avg: 0,
        rb_rolling_3_week_avg: 0,
        wr_rolling_3_week_avg: 0,
        te_rolling_3_week_avg: 0,
        k_rolling_3_week_avg: 0,
      };
    }

    if (!recentData || recentData.length === 0) {
      logger.debug('No recent data found for rolling average calculation', {
        leagueId,
        defensePlayerId,
        seasonYear,
        currentWeek,
      });
      return {
        qb_rolling_3_week_avg: 0,
        rb_rolling_3_week_avg: 0,
        wr_rolling_3_week_avg: 0,
        te_rolling_3_week_avg: 0,
        k_rolling_3_week_avg: 0,
      };
    }

    // Calculate averages including current week's data
    const totalWeeks = recentData.length + 1; // +1 for current week
    const qbTotal =
      recentData.reduce(
        (sum: number, record: any) => sum + (record.qb_pts_against || 0),
        0
      ) + currentWeekData.qb_pts_against;
    const rbTotal =
      recentData.reduce(
        (sum: number, record: any) => sum + (record.rb_pts_against || 0),
        0
      ) + currentWeekData.rb_pts_against;
    const wrTotal =
      recentData.reduce(
        (sum: number, record: any) => sum + (record.wr_pts_against || 0),
        0
      ) + currentWeekData.wr_pts_against;
    const teTotal =
      recentData.reduce(
        (sum: number, record: any) => sum + (record.te_pts_against || 0),
        0
      ) + currentWeekData.te_pts_against;
    const kTotal =
      recentData.reduce(
        (sum: number, record: any) => sum + (record.k_pts_against || 0),
        0
      ) + currentWeekData.k_pts_against;

    return {
      qb_rolling_3_week_avg: totalWeeks > 0 ? qbTotal / totalWeeks : 0,
      rb_rolling_3_week_avg: totalWeeks > 0 ? rbTotal / totalWeeks : 0,
      wr_rolling_3_week_avg: totalWeeks > 0 ? wrTotal / totalWeeks : 0,
      te_rolling_3_week_avg: totalWeeks > 0 ? teTotal / totalWeeks : 0,
      k_rolling_3_week_avg: totalWeeks > 0 ? kTotal / totalWeeks : 0,
    };
  } catch (error) {
    logger.error('Error calculating rolling averages', {
      error: error instanceof Error ? error.message : String(error),
      leagueId,
      defensePlayerId,
      seasonYear,
      currentWeek,
    });
    return {
      qb_rolling_3_week_avg: 0,
      rb_rolling_3_week_avg: 0,
      wr_rolling_3_week_avg: 0,
      te_rolling_3_week_avg: 0,
      k_rolling_3_week_avg: 0,
    };
  }
}

/**
 * Calculate normalized rolling 3-week averages using z-score normalization
 * Formula: (x - mean) / std
 * Where x is the rolling 3-week avg for this defense, mean and std are calculated
 * across all defenses for the same league/season/week
 */
async function calculateNormalizedRollingAverages(
  leagueId: string,
  seasonYear: number,
  week: number,
  currentTeamData: DefensePointsAgainst
): Promise<{
  qb_rolling_3_wk_avg_norm: number;
  rb_rolling_3_wk_avg_norm: number;
  wr_rolling_3_wk_avg_norm: number;
  te_rolling_3_wk_avg_norm: number;
  k_rolling_3_wk_avg_norm: number;
}> {
  try {
    // Get all defense teams' rolling averages for this league and week
    // Exclude the current team to avoid double-counting
    const { data: allTeamData, error } = await supabase
      .from('defense_points_against')
      .select(
        'player_id, qb_rolling_3_week_avg, rb_rolling_3_week_avg, wr_rolling_3_week_avg, te_rolling_3_week_avg, k_rolling_3_week_avg'
      )
      .eq('league_id', leagueId)
      .eq('season_year', seasonYear)
      .eq('week', week)
      .neq('player_id', currentTeamData.player_id)
      .not('qb_rolling_3_week_avg', 'is', null)
      .not('rb_rolling_3_week_avg', 'is', null)
      .not('wr_rolling_3_week_avg', 'is', null)
      .not('te_rolling_3_week_avg', 'is', null)
      .not('k_rolling_3_week_avg', 'is', null);

    if (error) {
      logger.error('Failed to fetch team data for normalization calculation', {
        error,
        leagueId,
        seasonYear,
        week,
      });
      return {
        qb_rolling_3_wk_avg_norm: 0,
        rb_rolling_3_wk_avg_norm: 0,
        wr_rolling_3_wk_avg_norm: 0,
        te_rolling_3_wk_avg_norm: 0,
        k_rolling_3_wk_avg_norm: 0,
      };
    }

    // Extract values for each position, including the current team's values
    // This ensures we calculate mean/std across all defenses including the current one
    const qbValues = [
      ...(allTeamData || []).map(
        (team: any) => team.qb_rolling_3_week_avg || 0
      ),
      currentTeamData.qb_rolling_3_week_avg,
    ].filter((val: number) => val !== null && val !== undefined);
    const rbValues = [
      ...(allTeamData || []).map(
        (team: any) => team.rb_rolling_3_week_avg || 0
      ),
      currentTeamData.rb_rolling_3_week_avg,
    ].filter((val: number) => val !== null && val !== undefined);
    const wrValues = [
      ...(allTeamData || []).map(
        (team: any) => team.wr_rolling_3_week_avg || 0
      ),
      currentTeamData.wr_rolling_3_week_avg,
    ].filter((val: number) => val !== null && val !== undefined);
    const teValues = [
      ...(allTeamData || []).map(
        (team: any) => team.te_rolling_3_week_avg || 0
      ),
      currentTeamData.te_rolling_3_week_avg,
    ].filter((val: number) => val !== null && val !== undefined);
    const kValues = [
      ...(allTeamData || []).map((team: any) => team.k_rolling_3_week_avg || 0),
      currentTeamData.k_rolling_3_week_avg,
    ].filter((val: number) => val !== null && val !== undefined);

    // Calculate mean and std for each position
    const calculateZScore = (value: number, values: number[]): number => {
      if (values.length === 0) return 0;
      const mean =
        values.reduce((sum: number, val: number) => sum + val, 0) /
        values.length;
      const variance =
        values.reduce(
          (sum: number, val: number) => sum + Math.pow(val - mean, 2),
          0
        ) / values.length;
      const std = Math.sqrt(variance);
      return std > 0 ? (value - mean) / std : 0;
    };

    return {
      qb_rolling_3_wk_avg_norm:
        Math.round(
          calculateZScore(currentTeamData.qb_rolling_3_week_avg, qbValues) *
            1000
        ) / 1000,
      rb_rolling_3_wk_avg_norm:
        Math.round(
          calculateZScore(currentTeamData.rb_rolling_3_week_avg, rbValues) *
            1000
        ) / 1000,
      wr_rolling_3_wk_avg_norm:
        Math.round(
          calculateZScore(currentTeamData.wr_rolling_3_week_avg, wrValues) *
            1000
        ) / 1000,
      te_rolling_3_wk_avg_norm:
        Math.round(
          calculateZScore(currentTeamData.te_rolling_3_week_avg, teValues) *
            1000
        ) / 1000,
      k_rolling_3_wk_avg_norm:
        Math.round(
          calculateZScore(currentTeamData.k_rolling_3_week_avg, kValues) * 1000
        ) / 1000,
    };
  } catch (error) {
    logger.error('Error calculating normalized rolling averages', {
      error: error instanceof Error ? error.message : String(error),
      leagueId,
      seasonYear,
      week,
    });
    return {
      qb_rolling_3_wk_avg_norm: 0,
      rb_rolling_3_wk_avg_norm: 0,
      wr_rolling_3_wk_avg_norm: 0,
      te_rolling_3_wk_avg_norm: 0,
      k_rolling_3_wk_avg_norm: 0,
    };
  }
}

/**
 * Calculate defense points against for a specific defense player in a specific league
 */
async function calculateDefensePointsAgainst(
  leagueId: string,
  defensePlayerId: string,
  seasonYear: number,
  week: number
): Promise<DefensePointsAgainst | null> {
  try {
    // Query to get fantasy points by position for players who faced this defense in the specific week

    const { data: positionStats, error: queryError } = await supabase.rpc(
      'get_defense_totals_by_position',
      {
        p_league_id: leagueId,
        p_season_year: seasonYear,
        p_defense_player_id: defensePlayerId,
        p_week: week,
      }
    );

    if (queryError) {
      logger.error('Failed to query defense points against', {
        error: queryError,
        leagueId,
        defensePlayerId,
        seasonYear,
        week,
      });
      return null;
    }

    // If no data found, return null
    if (!positionStats || positionStats.length === 0) {
      logger.debug('No stats found for defense player', {
        leagueId,
        defensePlayerId,
        seasonYear,
        week,
      });
      return null;
    }

    // Initialize points against
    const pointsAgainst: DefensePointsAgainst = {
      league_id: leagueId,
      player_id: defensePlayerId,
      season_year: seasonYear,
      week: week,
      qb_pts_against: 0,
      rb_pts_against: 0,
      wr_pts_against: 0,
      te_pts_against: 0,
      k_pts_against: 0,
      qb_rolling_3_week_avg: 0,
      rb_rolling_3_week_avg: 0,
      wr_rolling_3_week_avg: 0,
      te_rolling_3_week_avg: 0,
      k_rolling_3_week_avg: 0,
      qb_rolling_3_wk_avg_norm: 0,
      rb_rolling_3_wk_avg_norm: 0,
      wr_rolling_3_wk_avg_norm: 0,
      te_rolling_3_wk_avg_norm: 0,
      k_rolling_3_wk_avg_norm: 0,
    };

    // Sum up points by position
    for (const stat of positionStats) {
      const position = stat.position as string;
      const points = parseFloat(stat.total_points || '0');

      switch (position) {
        case 'QB':
          pointsAgainst.qb_pts_against += points;
          break;
        case 'RB':
          pointsAgainst.rb_pts_against += points;
          break;
        case 'WR':
          pointsAgainst.wr_pts_against += points;
          break;
        case 'TE':
          pointsAgainst.te_pts_against += points;
          break;
        case 'K':
          pointsAgainst.k_pts_against += points;
          break;
        default:
          logger.debug('Unknown position found', { position, points });
      }
    }

    // Calculate rolling 3-week averages AFTER calculating current week's points
    const rollingAverages = await calculateRollingAverages(
      leagueId,
      defensePlayerId,
      seasonYear,
      week,
      pointsAgainst
    );

    // Update the pointsAgainst object with rolling averages
    pointsAgainst.qb_rolling_3_week_avg = rollingAverages.qb_rolling_3_week_avg;
    pointsAgainst.rb_rolling_3_week_avg = rollingAverages.rb_rolling_3_week_avg;
    pointsAgainst.wr_rolling_3_week_avg = rollingAverages.wr_rolling_3_week_avg;
    pointsAgainst.te_rolling_3_week_avg = rollingAverages.te_rolling_3_week_avg;
    pointsAgainst.k_rolling_3_week_avg = rollingAverages.k_rolling_3_week_avg;

    // Calculate normalized rolling 3-week averages using z-score normalization
    const normalizedData = await calculateNormalizedRollingAverages(
      leagueId,
      seasonYear,
      week,
      pointsAgainst
    );
    pointsAgainst.qb_rolling_3_wk_avg_norm =
      normalizedData.qb_rolling_3_wk_avg_norm;
    pointsAgainst.rb_rolling_3_wk_avg_norm =
      normalizedData.rb_rolling_3_wk_avg_norm;
    pointsAgainst.wr_rolling_3_wk_avg_norm =
      normalizedData.wr_rolling_3_wk_avg_norm;
    pointsAgainst.te_rolling_3_wk_avg_norm =
      normalizedData.te_rolling_3_wk_avg_norm;
    pointsAgainst.k_rolling_3_wk_avg_norm =
      normalizedData.k_rolling_3_wk_avg_norm;

    return pointsAgainst;
  } catch (error) {
    logger.error('Error calculating defense points against', {
      leagueId,
      defensePlayerId,
      seasonYear,
      week,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Batch upsert defense points against into the database
 */
async function upsertDefensePointsAgainstBatch(
  pointsAgainstList: DefensePointsAgainst[]
): Promise<void> {
  if (pointsAgainstList.length === 0) return;

  try {
    const updatedAt = new Date().toISOString();
    const records = pointsAgainstList.map((pointsAgainst) => ({
      league_id: pointsAgainst.league_id,
      player_id: pointsAgainst.player_id,
      season_year: pointsAgainst.season_year,
      week: pointsAgainst.week,
      qb_pts_against: pointsAgainst.qb_pts_against,
      rb_pts_against: pointsAgainst.rb_pts_against,
      wr_pts_against: pointsAgainst.wr_pts_against,
      te_pts_against: pointsAgainst.te_pts_against,
      k_pts_against: pointsAgainst.k_pts_against,
      qb_rolling_3_week_avg: pointsAgainst.qb_rolling_3_week_avg,
      rb_rolling_3_week_avg: pointsAgainst.rb_rolling_3_week_avg,
      wr_rolling_3_week_avg: pointsAgainst.wr_rolling_3_week_avg,
      te_rolling_3_week_avg: pointsAgainst.te_rolling_3_week_avg,
      k_rolling_3_week_avg: pointsAgainst.k_rolling_3_week_avg,
      qb_rolling_3_wk_avg_norm: pointsAgainst.qb_rolling_3_wk_avg_norm,
      rb_rolling_3_wk_avg_norm: pointsAgainst.rb_rolling_3_wk_avg_norm,
      wr_rolling_3_wk_avg_norm: pointsAgainst.wr_rolling_3_wk_avg_norm,
      te_rolling_3_wk_avg_norm: pointsAgainst.te_rolling_3_wk_avg_norm,
      k_rolling_3_wk_avg_norm: pointsAgainst.k_rolling_3_wk_avg_norm,
      updated_at: updatedAt,
    }));

    const { error } = await supabase
      .from('defense_points_against')
      .upsert(records, {
        onConflict: 'league_id,player_id,season_year,week',
      });

    if (error) {
      logger.error('Failed to batch upsert defense points against', {
        error,
        recordCount: records.length,
      });
      throw new Error(
        `Failed to batch upsert defense points against: ${error.message}`
      );
    }

    logger.debug('Batch upserted defense points against', {
      recordCount: records.length,
    });
  } catch (error) {
    logger.error('Error batch upserting defense points against', {
      error: error instanceof Error ? error.message : String(error),
      recordCount: pointsAgainstList.length,
    });
    throw error;
  }
}

/**
 * Sync defense points against for all weeks from week 1 to the specified week (or current week)
 * Used for initial league setup when a user first logs in
 * @param upToWeek - The week to process up to
 * @param userId - If provided, only process leagues this user is a member of
 */
export async function syncDefensePointsAgainstAllWeeks(
  upToWeek?: number,
  userId?: string
): Promise<{ totalProcessed: number; weeksProcessed: number }> {
  const currentWeek = upToWeek ?? getMostRecentNFLWeek();

  // If userId is provided, get only leagues the user is a member of
  let leagueIds: string[] | undefined;
  if (userId) {
    const { data: userTeams, error } = await supabase
      .from('teams')
      .select('league_id')
      .eq('user_id', userId);

    if (error) {
      logger.error('Failed to fetch user leagues', { userId, error });
      throw new Error(`Failed to fetch user leagues: ${error.message}`);
    }

    const userLeagueIds =
      userTeams?.map((t: { league_id: string }) => t.league_id) || [];
    leagueIds = [...new Set<string>(userLeagueIds)];
    logger.info('Filtering defense points against to user leagues', {
      userId,
      leagueCount: leagueIds.length,
    });

    if (leagueIds.length === 0) {
      logger.warn('No leagues found for user', { userId });
      return { totalProcessed: 0, weeksProcessed: 0 };
    }
  }

  logger.info('Syncing defense points against for all weeks', {
    upToWeek: currentWeek,
    userId,
    leagueCount: leagueIds?.length || 'all',
  });

  let totalProcessed = 0;
  let weeksProcessed = 0;

  for (let week = 1; week <= currentWeek; week++) {
    try {
      logger.info(
        `Processing defense points against for week ${week}/${currentWeek}`
      );

      const processed = await syncDefensePointsAgainst(week, leagueIds);
      totalProcessed += processed;
      weeksProcessed++;

      logger.info(`Completed defense points against for week ${week}`, {
        processed,
        totalProcessed,
      });
    } catch (error) {
      logger.error(`Failed to sync defense points against for week ${week}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      // Continue with other weeks even if one fails
    }
  }

  logger.info('Completed defense points against sync for all weeks', {
    totalProcessed,
    weeksProcessed,
    targetWeek: currentWeek,
  });

  return { totalProcessed, weeksProcessed };
}
