import { logger } from '../../../../../supabase/functions/utils/logger.ts';
import { supabase } from '../../../../../supabase/functions/utils/supabase.ts';
import { POSITION_WEIGHTS } from '../constants.ts';
import type { WeightedScoreResult } from '../types.ts';

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
    // Get player's recent stats from league_calcs and normalized efficiency metrics from player_stats
    const { data: playerData, error: playerError } = await supabase
      .from('league_calcs')
      .select(
        `
        recent_mean_norm,
        recent_std_norm,
        players!league_calcs_player_id_fkey(position, team)
      `
      )
      .eq('league_id', leagueId)
      .eq('player_id', playerId)
      .eq('season_year', seasonYear)
      .eq('week', week)
      .single();

    // Get normalized efficiency metrics from player_stats (globally normalized)
    const { data: efficiencyMetrics, error: efficiencyError } = await supabase
      .from('player_stats')
      .select(
        'targets_per_game_3wk_avg_norm, catch_rate_3wk_avg_norm, yards_per_target_3wk_avg_norm'
      )
      .eq('player_id', playerId)
      .eq('season_year', seasonYear)
      .eq('week', week)
      .eq('source', 'actual')
      .single();

    if (playerError || !playerData || efficiencyError || !efficiencyMetrics) {
      logger.debug('No player data found for weighted score calculation', {
        leagueId,
        playerId,
        seasonYear,
        week,
        error: playerError?.message || efficiencyError?.message,
      });
      return {
        weighted_score: null,
        recent_mean_norm: null,
        recent_std_norm: null,
        targets_per_game_3wk_avg_norm: null,
        catch_rate_3wk_avg_norm: null,
        yards_per_target_3wk_avg_norm: null,
      };
    }

    // Check if player is a WR
    if (playerData.players?.position !== 'WR') {
      return {
        weighted_score: null,
        recent_mean_norm: playerData.recent_mean_norm,
        recent_std_norm: playerData.recent_std_norm,
        targets_per_game_3wk_avg_norm:
          efficiencyMetrics?.targets_per_game_3wk_avg_norm || null,
        catch_rate_3wk_avg_norm: efficiencyMetrics?.catch_rate_3wk_avg_norm || null,
        yards_per_target_3wk_avg_norm:
          efficiencyMetrics?.yards_per_target_3wk_avg_norm || null,
      };
    }

    // Get opponent defensive difficulty index (WR-specific)
    // First, find the opponent team from NFL matchups
    const playerTeam = playerData.players.team;
    let opponentDifficulty = 0;

    if (playerTeam) {
      try {
        // Find the matchup for this team in the current week
        const { data: matchup } = await supabase
          .from('nfl_matchups')
          .select('home_team, away_team')
          .eq('season', seasonYear)
          .eq('week', week)
          .or(`home_team.eq.${playerTeam},away_team.eq.${playerTeam}`)
          .single();

        if (matchup) {
          // Determine the opposing team
          const playerTeamLower = playerTeam.toLowerCase();
          const homeTeamLower = matchup.home_team.toLowerCase();

          const opposingTeam =
            homeTeamLower === playerTeamLower
              ? matchup.away_team
              : matchup.home_team;

          // Find the defense player for the opposing team
          const { data: defensePlayer } = await supabase
            .from('players')
            .select('id')
            .ilike('team', opposingTeam)
            .eq('position', 'DEF')
            .single();

          if (defensePlayer) {
            // Query defense_points_against by defense player ID
            const { data: opponentData, error: opponentError } = await supabase
              .from('defense_points_against')
              .select('wr_normalized_odi')
              .eq('league_id', leagueId)
              .eq('player_id', defensePlayer.id)
              .eq('season_year', seasonYear)
              .eq('week', week)
              .single();

            if (!opponentError && opponentData) {
              opponentDifficulty = opponentData.wr_normalized_odi || 0;
            } else {
              logger.debug(
                'No opponent defensive data found for weighted score calculation',
                {
                  leagueId,
                  playerId,
                  seasonYear,
                  week,
                  team: playerTeam,
                  opposingTeam,
                  defensePlayerId: defensePlayer.id,
                  error: opponentError?.message,
                }
              );
            }
          }
        }
      } catch (error) {
        logger.debug(
          'Could not find opponent defensive data for weighted score calculation',
          {
            leagueId,
            playerId,
            seasonYear,
            week,
            team: playerTeam,
            error: error instanceof Error ? error.message : String(error),
          }
        );
      }
    }

    const recentMean = playerData.recent_mean_norm || 0;
    const recentStd = playerData.recent_std_norm || 0;
    const targetsPerGameNorm = efficiencyMetrics.targets_per_game_3wk_avg_norm || 0;
    const catchRateNorm = efficiencyMetrics.catch_rate_3wk_avg_norm || 0;
    const yardsPerTargetNorm = efficiencyMetrics.yards_per_target_3wk_avg_norm || 0;

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
      weighted_score: Math.round(weightedScore * 1000) / 1000,
      recent_mean_norm: recentMean,
      recent_std_norm: recentStd,
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
      recent_mean_norm: null,
      recent_std_norm: null,
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
    recent_mean_norm: null,
    recent_std_norm: null,
    targets_per_game_3wk_avg_norm: null,
    catch_rate_3wk_avg_norm: null,
    yards_per_target_3wk_avg_norm: null,
  };
}
