import { logger } from '../../../../../supabase/functions/utils/logger.ts';
import { supabase } from '../../../../../supabase/functions/utils/supabase.ts';
import { calculateWeightedScore } from './positionScoring.ts';

/**
 * League-wide Weighted Scoring Module
 *
 * Handles calculation of weighted scores for all players in a league
 * by position
 */

/**
 * Calculate weighted scores for all WR players in a league
 */
export async function calculateWeightedScoresForLeague(
  leagueId: string,
  seasonYear: number,
  week: number
): Promise<void> {
  logger.info('Calculating weighted scores for WR players', {
    leagueId,
    seasonYear,
    week,
  });

  // Get all WR players who have fantasy points calculated for this week
  const { data: wrPlayers, error: fetchError } = await supabase
    .from('league_calcs')
    .select(
      `
      player_id,
      players!player_stats_player_id_fkey(position)
    `
    )
    .eq('league_id', leagueId)
    .eq('season_year', seasonYear)
    .eq('week', week)
    .eq('players.position', 'WR')
    .not('fantasy_points', 'is', null);

  if (fetchError) {
    logger.error('Failed to fetch WR players for weighted score calculation', {
      error: fetchError,
      leagueId,
      seasonYear,
      week,
    });
    return;
  }

  if (!wrPlayers || wrPlayers.length === 0) {
    logger.info('No WR players found for weighted score calculation', {
      leagueId,
      seasonYear,
      week,
    });
    return;
  }

  // Calculate weighted scores for each WR player
  for (const player of wrPlayers) {
    const {
      weighted_score,
      recent_mean,
      recent_std,
      targets_per_game_3wk_avg_norm,
      catch_rate_3wk_avg_norm,
      yards_per_target_3wk_avg_norm,
    } = await calculateWeightedScore(
      'WR',
      leagueId,
      player.player_id,
      seasonYear,
      week
    );

    // Update the league_calcs record with weighted score and component values
    const { error: updateError } = await supabase
      .from('league_calcs')
      .update({
        weighted_score,
        recent_mean,
        recent_std,
        targets_per_game_3wk_avg_norm,
        catch_rate_3wk_avg_norm,
        yards_per_target_3wk_avg_norm,
        updated_at: new Date().toISOString(),
      })
      .eq('league_id', leagueId)
      .eq('player_id', player.player_id)
      .eq('season_year', seasonYear)
      .eq('week', week);

    if (updateError) {
      logger.error('Failed to update weighted score for WR player', {
        error: updateError,
        leagueId,
        playerId: player.player_id,
        seasonYear,
        week,
      });
    }
  }

  logger.info('Completed weighted score calculation for WR players', {
    leagueId,
    seasonYear,
    week,
    wrPlayersUpdated: wrPlayers.length,
  });
}
