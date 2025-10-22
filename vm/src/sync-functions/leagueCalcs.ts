import { logger } from '../../../supabase/functions/utils/logger.ts';
import { supabase } from '../../../supabase/functions/utils/supabase.ts';
import { getMostRecentNFLWeek } from '../../../supabase/functions/utils/syncHelpers.ts';

// Configuration for recent statistics calculation
const RECENT_WEEKS = 3; // Number of recent weeks to include in mean/std calculations

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
 * Calculate recent statistics (mean and std) for a player over recent weeks
 */
async function calculateRecentStats(
  leagueId: string,
  playerId: string,
  seasonYear: number,
  currentWeek: number
): Promise<{ recent_mean: number | null; recent_std: number | null }> {
  const startWeek = Math.max(1, currentWeek - RECENT_WEEKS + 1);

  const { data: recentPoints, error } = await supabase
    .from('league_calcs')
    .select('fantasy_points')
    .eq('league_id', leagueId)
    .eq('player_id', playerId)
    .eq('season_year', seasonYear)
    .gte('week', startWeek)
    .lte('week', currentWeek)
    .order('week', { ascending: true });

  if (error) {
    logger.error('Failed to fetch recent points for statistics', {
      error,
      leagueId,
      playerId,
      seasonYear,
      currentWeek,
    });
    return { recent_mean: null, recent_std: null };
  }

  if (!recentPoints || recentPoints.length === 0) {
    return { recent_mean: null, recent_std: null };
  }

  const points = recentPoints
    .map((r) => r.fantasy_points)
    .filter((p) => p !== null);

  if (points.length === 0) {
    return { recent_mean: null, recent_std: null };
  }

  // Calculate mean
  const mean = points.reduce((sum, point) => sum + point, 0) / points.length;

  // Calculate standard deviation
  const variance =
    points.reduce((sum, point) => sum + Math.pow(point - mean, 2), 0) /
    points.length;
  const std = Math.sqrt(variance);

  return {
    recent_mean: Math.round(mean * 100) / 100, // Round to 2 decimal places
    recent_std: Math.round(std * 100) / 100, // Round to 2 decimal places
  };
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

  // Update recent statistics after main calculation
  await updateRecentStatsForLeague(leagueId, seasonYear, week);

  return result;
}

/**
 * Update recent statistics for all players in a league after main calculation
 */
async function updateRecentStatsForLeague(
  leagueId: string,
  seasonYear: number,
  week: number
): Promise<void> {
  logger.info('Updating recent statistics for league', {
    leagueId,
    seasonYear,
    week,
  });

  // Get all players who have fantasy points calculated for this week
  const { data: players, error: fetchError } = await supabase
    .from('league_calcs')
    .select('player_id')
    .eq('league_id', leagueId)
    .eq('season_year', seasonYear)
    .eq('week', week)
    .not('fantasy_points', 'is', null);

  if (fetchError) {
    logger.error('Failed to fetch players for recent stats update', {
      error: fetchError,
      leagueId,
      seasonYear,
      week,
    });
    return;
  }

  if (!players || players.length === 0) {
    logger.info('No players found for recent stats update', {
      leagueId,
      seasonYear,
      week,
    });
    return;
  }

  // Update recent stats for each player
  for (const player of players) {
    const { recent_mean, recent_std } = await calculateRecentStats(
      leagueId,
      player.player_id,
      seasonYear,
      week
    );

    // Update the league_calcs record with recent statistics
    const { error: updateError } = await supabase
      .from('league_calcs')
      .update({
        recent_mean,
        recent_std,
        updated_at: new Date().toISOString(),
      })
      .eq('league_id', leagueId)
      .eq('player_id', player.player_id)
      .eq('season_year', seasonYear)
      .eq('week', week);

    if (updateError) {
      logger.error('Failed to update recent stats for player', {
        error: updateError,
        leagueId,
        playerId: player.player_id,
        seasonYear,
        week,
      });
    }
  }

  logger.info('Completed recent statistics update for league', {
    leagueId,
    seasonYear,
    week,
    playersUpdated: players.length,
  });
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

  // Update recent statistics for all leagues
  if (results && results.length > 0) {
    for (const result of results) {
      await updateRecentStatsForLeague(result.league_id, seasonYear, week);
    }
  }

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

  // Update recent statistics for all leagues and weeks
  if (results && results.length > 0) {
    for (const result of results) {
      await updateRecentStatsForLeague(
        result.league_id,
        result.season_year,
        result.week
      );
    }
  }

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
