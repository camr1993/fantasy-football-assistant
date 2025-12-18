import { logger } from '../../../supabase/functions/utils/logger.ts';
import { supabase } from '../../../supabase/functions/utils/supabase.ts';
import { getMostRecentNFLWeek } from '../../../supabase/functions/utils/syncHelpers.ts';

/**
 * Fantasy Points Calculation Module
 *
 * This module handles the calculation of fantasy points for leagues and players.
 * It operates on player stats and league scoring settings to compute weekly
 * fantasy points without calculating recent statistics (mean/std).
 */

interface FantasyPointsResult {
  league_id: string;
  season_year: number;
  week: number;
  updated_count: number;
}

/**
 * Calculate fantasy points for a specific league and week (without recent stats)
 */
export async function calculateLeagueFantasyPoints(
  leagueId: string,
  seasonYear: number,
  week: number
): Promise<number> {
  logger.info('Calculating fantasy points for specific league', {
    leagueId,
    seasonYear,
    week,
  });

  const { data: result, error } = await supabase.rpc(
    'calculate_weekly_fantasy_points',
    {
      p_league_id: leagueId,
      p_season_year: seasonYear,
      p_week: week,
    }
  );

  if (error) {
    logger.error('Failed to calculate fantasy points for league', {
      error,
      leagueId,
      seasonYear,
      week,
    });
    throw new Error(`Failed to calculate fantasy points: ${error.message}`);
  }

  logger.info('Successfully calculated fantasy points for league', {
    leagueId,
    seasonYear,
    week,
    updated_count: result,
  });

  return result;
}

/**
 * Calculate fantasy points for all leagues for a specific week (without recent stats)
 */
export async function calculateAllLeaguesFantasyPoints(
  seasonYear: number,
  week: number
): Promise<FantasyPointsResult[]> {
  logger.info('Calculating fantasy points for all leagues', {
    seasonYear,
    week,
  });

  const { data: results, error } = await supabase.rpc(
    'recalculate_all_fantasy_points',
    {
      p_season_year: seasonYear,
      p_week: week,
    }
  );

  if (error) {
    logger.error('Failed to calculate fantasy points for all leagues', {
      error,
      seasonYear,
      week,
    });
    throw new Error(`Failed to calculate fantasy points: ${error.message}`);
  }

  logger.info('Successfully calculated fantasy points for all leagues', {
    results: results?.length || 0,
    seasonYear,
    week,
  });

  return results || [];
}

/**
 * Calculate fantasy points for all leagues and all weeks (without recent stats)
 */
export async function recalculateAllFantasyPoints(
  seasonYear?: number,
  week?: number
): Promise<FantasyPointsResult[]> {
  const currentYear = seasonYear || new Date().getFullYear();

  logger.info('Recalculating fantasy points for all leagues and weeks', {
    seasonYear: currentYear,
    week,
  });

  const { data: results, error } = await supabase.rpc(
    'recalculate_all_fantasy_points',
    {
      p_season_year: currentYear,
      p_week: week || null,
    }
  );

  if (error) {
    logger.error('Failed to recalculate all fantasy points', { error });
    throw new Error(`Failed to recalculate fantasy points: ${error.message}`);
  }

  logger.info('Successfully recalculated fantasy points for all leagues', {
    results: results?.length || 0,
  });

  return results || [];
}

/**
 * Calculate fantasy points for all weeks from week 1 to the specified week (or current week)
 * Used for initial league setup when a user first logs in
 * @param userId - If provided, only process leagues this user is a member of
 */
export async function calculateAllLeaguesFantasyPointsAllWeeks(
  seasonYear?: number,
  upToWeek?: number,
  userId?: string
): Promise<{ totalUpdated: number; weeksProcessed: number }> {
  const currentYear = seasonYear || new Date().getFullYear();
  const targetWeek = upToWeek || getMostRecentNFLWeek();

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
    logger.info('Filtering fantasy points calculation to user leagues', {
      userId,
      leagueCount: leagueIds.length,
    });

    if (leagueIds.length === 0) {
      logger.warn('No leagues found for user', { userId });
      return { totalUpdated: 0, weeksProcessed: 0 };
    }
  }

  logger.info('Calculating fantasy points for leagues, all weeks', {
    seasonYear: currentYear,
    upToWeek: targetWeek,
    userId,
    leagueCount: leagueIds?.length || 'all',
  });

  let totalUpdated = 0;
  let weeksProcessed = 0;

  for (let week = 1; week <= targetWeek; week++) {
    try {
      logger.info(`Processing fantasy points for week ${week}/${targetWeek}`);

      if (leagueIds) {
        // Process only specific leagues
        for (const leagueId of leagueIds) {
          const updated = await calculateLeagueFantasyPoints(
            leagueId,
            currentYear,
            week
          );
          totalUpdated += updated;
        }
      } else {
        // Process all leagues
        const results = await calculateAllLeaguesFantasyPoints(
          currentYear,
          week
        );
        const weekUpdated = results.reduce(
          (sum, r) => sum + (r.updated_count || 0),
          0
        );
        totalUpdated += weekUpdated;
      }
      weeksProcessed++;

      logger.info(`Completed fantasy points for week ${week}`, {
        totalUpdated,
      });
    } catch (error) {
      logger.error(`Failed to calculate fantasy points for week ${week}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      // Continue with other weeks even if one fails
    }
  }

  logger.info('Completed fantasy points calculation for all weeks', {
    totalUpdated,
    weeksProcessed,
    targetWeek,
  });

  return { totalUpdated, weeksProcessed };
}

/**
 * Main function to handle fantasy points calculations based on request parameters
 */
export async function handleFantasyPointsCalculations(request: {
  league_id?: string;
  season_year?: number;
  week?: number;
  recalculate_all?: boolean;
}): Promise<{
  success: boolean;
  message: string;
  results?: FantasyPointsResult[];
  league_id?: string;
  season_year?: number;
  week?: number;
  updated_count?: number;
}> {
  const currentYear = request.season_year || new Date().getFullYear();
  const currentWeek = request.week || getMostRecentNFLWeek();

  logger.info('Starting fantasy points calculations', {
    league_id: request.league_id,
    season_year: currentYear,
    week: currentWeek,
    recalculate_all: request.recalculate_all,
  });

  if (request.recalculate_all) {
    // Recalculate points for all leagues and weeks
    const results = await recalculateAllFantasyPoints(currentYear, currentWeek);

    return {
      success: true,
      message: 'Fantasy points recalculated for all leagues',
      results,
    };
  } else if (request.league_id) {
    // Calculate points for a specific league
    const updatedCount = await calculateLeagueFantasyPoints(
      request.league_id,
      currentYear,
      currentWeek
    );

    return {
      success: true,
      message: 'Fantasy points calculated successfully',
      league_id: request.league_id,
      season_year: currentYear,
      week: currentWeek,
      updated_count: updatedCount,
    };
  } else {
    // Default behavior: calculate for all leagues for current week
    const results = await calculateAllLeaguesFantasyPoints(
      currentYear,
      currentWeek
    );

    return {
      success: true,
      message: 'Fantasy points calculated for all leagues',
      season_year: currentYear,
      week: currentWeek,
      results,
    };
  }
}
