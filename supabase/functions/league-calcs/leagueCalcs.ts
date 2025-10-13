import { logger } from '../utils/logger.ts';
import { supabase } from '../utils/supabase.ts';
import { getMostRecentNFLWeek } from '../utils/syncHelpers.ts';

interface LeagueCalcsRequest {
  league_id?: string;
  season_year?: number;
  week?: number;
  recalculate_all?: boolean;
}

interface LeagueCalcsResult {
  league_id: string;
  season_year: number;
  week: number;
  updated_count: number;
}

/**
 * Calculate fantasy points for a specific league and week
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
 * Calculate fantasy points for all leagues for a specific week
 */
export async function calculateAllLeaguesFantasyPoints(
  seasonYear: number,
  week: number
): Promise<LeagueCalcsResult[]> {
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
 * Calculate fantasy points for all leagues and all weeks
 */
export async function recalculateAllFantasyPoints(
  seasonYear?: number,
  week?: number
): Promise<LeagueCalcsResult[]> {
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
 * Main function to handle league calculations based on request parameters
 */
export async function handleLeagueCalculations(
  request: LeagueCalcsRequest
): Promise<{
  success: boolean;
  message: string;
  results?: LeagueCalcsResult[];
  league_id?: string;
  season_year?: number;
  week?: number;
  updated_count?: number;
}> {
  const currentYear = request.season_year || new Date().getFullYear();
  const currentWeek = request.week || getMostRecentNFLWeek();

  logger.info('Starting league calculations', {
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
