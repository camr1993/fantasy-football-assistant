import { logger } from '../../../../../supabase/functions/utils/logger.ts';
import { supabase } from '../../../../../supabase/functions/utils/supabase.ts';
import { POSITION_WEIGHTS } from '../constants.ts';
import type { WeightedScoreResult, PositionWeights } from '../types.ts';

/**
 * Position-Specific Weighted Scoring Module
 *
 * Handles calculation of weighted scores for different positions
 * Each position can have its own set of weights and factors
 */

/**
 * Calculate weighted score for WR players
 */
export async function calculateWeightedScoreWR(
  leagueId: string,
  playerId: string,
  seasonYear: number,
  week: number
): Promise<WeightedScoreResult> {
  try {
    // Get player's recent stats and normalized efficiency metrics
    const { data: playerData, error: playerError } = await supabase
      .from('league_calcs')
      .select(
        `
        recent_mean,
        recent_std,
        targets_per_game_3wk_avg_norm,
        catch_rate_3wk_avg_norm,
        yards_per_target_3wk_avg_norm,
        players!player_stats_player_id_fkey(position, team)
      `
      )
      .eq('league_id', leagueId)
      .eq('player_id', playerId)
      .eq('season_year', seasonYear)
      .eq('week', week)
      .single();

    if (playerError || !playerData) {
      logger.debug('No player data found for weighted score calculation', {
        leagueId,
        playerId,
        seasonYear,
        week,
        error: playerError?.message,
      });
      return {
        weighted_score: null,
        recent_mean: null,
        recent_std: null,
        targets_per_game_3wk_avg_norm: null,
        catch_rate_3wk_avg_norm: null,
        yards_per_target_3wk_avg_norm: null,
      };
    }

    // Check if player is a WR
    if (playerData.players?.position !== 'WR') {
      return {
        weighted_score: null,
        recent_mean: playerData.recent_mean,
        recent_std: playerData.recent_std,
        targets_per_game_3wk_avg_norm: playerData.targets_per_game_3wk_avg_norm,
        catch_rate_3wk_avg_norm: playerData.catch_rate_3wk_avg_norm,
        yards_per_target_3wk_avg_norm: playerData.yards_per_target_3wk_avg_norm,
      };
    }

    // Get opponent defensive difficulty index (WR-specific)
    const { data: opponentData, error: opponentError } = await supabase
      .from('defense_points_against')
      .select('wr_normalized_odi')
      .eq('season_year', seasonYear)
      .eq('week', week)
      .eq('team', playerData.players.team)
      .single();

    if (opponentError || !opponentData) {
      logger.debug(
        'No opponent defensive data found for weighted score calculation',
        {
          leagueId,
          playerId,
          seasonYear,
          week,
          team: playerData.players.team,
          error: opponentError?.message,
        }
      );
    }

    const recentMean = playerData.recent_mean || 0;
    const recentStd = playerData.recent_std || 0;
    const targetsPerGameNorm = playerData.targets_per_game_3wk_avg_norm || 0;
    const catchRateNorm = playerData.catch_rate_3wk_avg_norm || 0;
    const yardsPerTargetNorm = playerData.yards_per_target_3wk_avg_norm || 0;
    const opponentDifficulty = opponentData?.wr_normalized_odi || 0;

    // Calculate weighted score using the formula:
    // weighted_score = w_1*recent_mean + w_2*recent_std + w_3*targets_per_game_norm +
    //                  w_4*catch_rate_norm + w_5*yards_per_target_norm + w_6*opponent_difficulty
    const weightedScore =
      POSITION_WEIGHTS.WR.recent_mean * recentMean +
      POSITION_WEIGHTS.WR.volatility * recentStd +
      POSITION_WEIGHTS.WR.targets_per_game * targetsPerGameNorm +
      POSITION_WEIGHTS.WR.catch_rate * catchRateNorm +
      POSITION_WEIGHTS.WR.yards_per_target * yardsPerTargetNorm +
      POSITION_WEIGHTS.WR.opponent_difficulty * opponentDifficulty;

    return {
      weighted_score: Math.round(weightedScore * 1000) / 1000, // Round to 3 decimal places
      recent_mean: recentMean,
      recent_std: recentStd,
      targets_per_game_3wk_avg_norm: targetsPerGameNorm,
      catch_rate_3wk_avg_norm: catchRateNorm,
      yards_per_target_3wk_avg_norm: yardsPerTargetNorm,
    };
  } catch (error) {
    logger.error('Error calculating weighted score for WR', {
      error: error instanceof Error ? error.message : String(error),
      leagueId,
      playerId,
      seasonYear,
      week,
    });
    return {
      weighted_score: null,
      recent_mean: null,
      recent_std: null,
      targets_per_game_3wk_avg_norm: null,
      catch_rate_3wk_avg_norm: null,
      yards_per_target_3wk_avg_norm: null,
    };
  }
}

/**
 * Generic weighted score calculator that can be extended for other positions
 */
export async function calculateWeightedScore(
  position: keyof typeof POSITION_WEIGHTS,
  leagueId: string,
  playerId: string,
  seasonYear: number,
  week: number
): Promise<WeightedScoreResult> {
  // For now, only WR is implemented
  if (position === 'WR') {
    return calculateWeightedScoreWR(leagueId, playerId, seasonYear, week);
  }

  // TODO: Implement other positions
  logger.warn(`Weighted scoring not implemented for position: ${position}`);
  return {
    weighted_score: null,
    recent_mean: null,
    recent_std: null,
    targets_per_game_3wk_avg_norm: null,
    catch_rate_3wk_avg_norm: null,
    yards_per_target_3wk_avg_norm: null,
  };
}
