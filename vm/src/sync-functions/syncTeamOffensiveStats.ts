import { logger } from '../../../supabase/functions/utils/logger.ts';
import { supabase } from '../../../supabase/functions/utils/supabase.ts';
import { getMostRecentNFLWeek } from '../../../supabase/functions/utils/syncHelpers.ts';

/**
 * Sync team offensive stats and calculate offensive difficulty index
 * This calculates weekly offensive fantasy points per NFL team, 3-week rolling averages,
 * and normalized z-score offensive difficulty index for DEF position evaluation
 */
export async function syncTeamOffensiveStats(week?: number): Promise<number> {
  const currentYear = new Date().getFullYear();
  const currentWeek = week ?? getMostRecentNFLWeek();

  logger.info('Starting team offensive stats sync', {
    week: currentWeek,
    seasonYear: currentYear,
  });

  try {
    // Get all leagues for the current season
    const { data: leagues, error: leaguesError } = await supabase
      .from('leagues')
      .select('id, name, season_year')
      .eq('season_year', currentYear);

    if (leaguesError) {
      logger.error('Failed to fetch leagues', { error: leaguesError });
      throw new Error(`Failed to fetch leagues: ${leaguesError.message}`);
    }

    if (!leagues || leagues.length === 0) {
      logger.warn('No leagues found for current season');
      return 0;
    }

    logger.info(`Found ${leagues.length} leagues for season ${currentYear}`);

    let totalProcessed = 0;

    // Process each league
    for (const league of leagues) {
      logger.info('Processing league for team offensive stats', {
        leagueId: league.id,
        leagueName: league.name,
      });

      try {
        // Step 1: Calculate weekly offensive fantasy points per team
        const { data: pointsResult, error: pointsError } = await supabase.rpc(
          'calculate_team_offensive_points',
          {
            p_league_id: league.id,
            p_season_year: currentYear,
            p_week: currentWeek,
          }
        );

        if (pointsError) {
          logger.error('Failed to calculate team offensive points', {
            error: pointsError,
            leagueId: league.id,
            seasonYear: currentYear,
            week: currentWeek,
          });
          continue;
        }

        logger.info('Calculated team offensive points', {
          leagueId: league.id,
          teamsUpdated: pointsResult || 0,
        });

        // Step 2: Calculate 3-week rolling averages
        const { data: avgResult, error: avgError } = await supabase.rpc(
          'calculate_team_offensive_3wk_avg',
          {
            p_league_id: league.id,
            p_season_year: currentYear,
            p_week: currentWeek,
          }
        );

        if (avgError) {
          logger.error('Failed to calculate team offensive 3-week averages', {
            error: avgError,
            leagueId: league.id,
            seasonYear: currentYear,
            week: currentWeek,
          });
          continue;
        }

        logger.info('Calculated team offensive 3-week averages', {
          leagueId: league.id,
          teamsUpdated: avgResult || 0,
        });

        // Step 3: Normalize offensive difficulty index using z-scores
        const { data: normResult, error: normError } = await supabase.rpc(
          'normalize_offensive_difficulty_index',
          {
            p_league_id: league.id,
            p_season_year: currentYear,
            p_week: currentWeek,
          }
        );

        if (normError) {
          logger.error('Failed to normalize offensive difficulty index', {
            error: normError,
            leagueId: league.id,
            seasonYear: currentYear,
            week: currentWeek,
          });
          continue;
        }

        logger.info('Normalized offensive difficulty index', {
          leagueId: league.id,
          teamsUpdated: normResult || 0,
        });

        totalProcessed += normResult || 0;
      } catch (error) {
        logger.error('Failed to process league for team offensive stats', {
          leagueId: league.id,
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue with other leagues even if one fails
      }
    }

    logger.info('Completed team offensive stats sync', {
      totalProcessed,
      leaguesCount: leagues.length,
    });

    return totalProcessed;
  } catch (error) {
    logger.error('Team offensive stats sync failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

