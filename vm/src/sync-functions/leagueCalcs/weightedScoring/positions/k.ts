import { logger } from '../../../../../../supabase/functions/utils/logger.ts';
import { supabase } from '../../../../../../supabase/functions/utils/supabase.ts';
import { POSITION_WEIGHTS } from '../../constants.ts';

/**
 * Calculate weighted scores for all K players in a league
 */
export async function calculateWeightedScoresForLeagueK(
  leagueId: string,
  seasonYear: number,
  week: number
): Promise<void> {
  logger.info('Calculating weighted scores for K players', {
    leagueId,
    seasonYear,
    week,
  });

  // Get all K players who have fantasy points calculated for this week
  // Use !inner to force INNER JOIN so we only get players that exist and match the position filter
  const { data: kPlayers, error: fetchError } = await supabase
    .from('league_calcs')
    .select(
      `
      player_id,
      players!inner!league_calcs_player_id_fkey(position)
    `
    )
    .eq('league_id', leagueId)
    .eq('season_year', seasonYear)
    .eq('week', week)
    .eq('players.position', 'K')
    .not('fantasy_points', 'is', null);

  if (fetchError) {
    logger.error('Failed to fetch K players for weighted score calculation', {
      error: fetchError,
      leagueId,
      seasonYear,
      week,
    });
    return;
  }

  if (!kPlayers || kPlayers.length === 0) {
    logger.info('No K players found for weighted score calculation', {
      leagueId,
      seasonYear,
      week,
    });
    return;
  }

  const playerIds = kPlayers.map((p: any) => p.player_id);

  logger.info('Fetched K players for weighted score calculation', {
    leagueId,
    seasonYear,
    week,
    playerCount: playerIds.length,
  });

  // Pre-fetch all data needed for weighted score calculation
  // 1. Get all recent stats and player info in one query
  logger.info('Fetching player data for weighted scores', {
    leagueId,
    seasonYear,
    week,
  });
  const { data: playerData, error: playerDataError } = await supabase
    .from('league_calcs')
    .select(
      `
      player_id,
      recent_mean_norm,
      recent_std_norm,
      players!league_calcs_player_id_fkey(position, team)
    `
    )
    .eq('league_id', leagueId)
    .eq('season_year', seasonYear)
    .eq('week', week)
    .in('player_id', playerIds);

  if (playerDataError || !playerData) {
    logger.error('Failed to fetch player data for weighted scores', {
      error: playerDataError,
      leagueId,
      seasonYear,
      week,
    });
    return;
  }

  logger.info('Fetched player data for weighted scores', {
    leagueId,
    seasonYear,
    week,
    playerDataCount: playerData.length,
  });

  // 2. Get all K efficiency metrics in one query
  logger.info('Fetching K efficiency metrics for weighted scores', {
    leagueId,
    seasonYear,
    week,
    playerIdsCount: playerIds.length,
  });
  const { data: efficiencyMetrics, error: efficiencyError } = await supabase
    .from('player_stats')
    .select(
      'player_id, fg_profile_3wk_avg_norm, fg_pat_misses_3wk_avg_norm, fg_attempts_3wk_avg_norm'
    )
    .in('player_id', playerIds)
    .eq('season_year', seasonYear)
    .eq('week', week)
    .eq('source', 'actual');

  if (efficiencyError) {
    logger.error('Failed to fetch K efficiency metrics for weighted scores', {
      error: efficiencyError,
      leagueId,
      seasonYear,
      week,
    });
    return;
  }

  logger.info('Fetched K efficiency metrics for weighted scores', {
    leagueId,
    seasonYear,
    week,
    efficiencyMetricsCount: efficiencyMetrics?.length || 0,
  });

  // 3. Get all matchups for the upcoming week (week + 1) to build opponent lookup
  // This allows us to use the opponent difficulty for the upcoming week's matchup
  // If we're at week 18 (last week), fall back to current week
  const upcomingWeek = week >= 18 ? week : week + 1;
  logger.info('Fetching NFL matchups for opponent lookup (upcoming week)', {
    seasonYear,
    currentWeek: week,
    upcomingWeek,
  });
  const { data: matchups, error: matchupsError } = await supabase
    .from('nfl_matchups')
    .select('home_team, away_team')
    .eq('season', seasonYear)
    .eq('week', upcomingWeek);

  if (matchupsError) {
    logger.warn('Failed to fetch matchups, opponent difficulty will be 0', {
      error: matchupsError,
      seasonYear,
      upcomingWeek,
    });
  }

  // Build matchup lookup: team -> opponent
  const matchupMap = new Map<string, string>();

  // If no matchups found for upcoming week, try falling back to current week
  if ((!matchups || matchups.length === 0) && upcomingWeek !== week) {
    logger.info(
      'No matchups found for upcoming week, falling back to current week',
      {
        seasonYear,
        upcomingWeek,
        currentWeek: week,
      }
    );
    const { data: fallbackMatchups, error: fallbackError } = await supabase
      .from('nfl_matchups')
      .select('home_team, away_team')
      .eq('season', seasonYear)
      .eq('week', week);

    if (!fallbackError && fallbackMatchups && fallbackMatchups.length > 0) {
      // Use fallback matchups
      for (const matchup of fallbackMatchups) {
        matchupMap.set(matchup.home_team.toLowerCase(), matchup.away_team);
        matchupMap.set(matchup.away_team.toLowerCase(), matchup.home_team);
      }
      logger.info('Using fallback matchups from current week', {
        matchupsCount: fallbackMatchups.length,
      });
    }
  } else if (matchups) {
    // Use matchups from upcoming week
    for (const matchup of matchups) {
      matchupMap.set(matchup.home_team.toLowerCase(), matchup.away_team);
      matchupMap.set(matchup.away_team.toLowerCase(), matchup.home_team);
    }
  }

  // 4. Get all defense players for opponent teams
  const opponentTeams = new Set<string>();
  playerData.forEach((p: any) => {
    if (p.players?.team) {
      const team = p.players.team.toLowerCase();
      const opponent = matchupMap.get(team);
      if (opponent) {
        opponentTeams.add(opponent);
      }
    }
  });

  // Get defense player IDs for opponent teams
  const opponentTeamsArray = Array.from(opponentTeams);
  logger.info('Fetching defense players for opponent teams', {
    opponentTeamsCount: opponentTeamsArray.length,
  });

  let defensePlayers = null;
  let defenseError = null;

  if (opponentTeamsArray.length > 0) {
    const result = await supabase
      .from('players')
      .select('id, team')
      .in('team', opponentTeamsArray)
      .eq('position', 'DEF');
    defensePlayers = result.data;
    defenseError = result.error;
  } else {
    logger.info('No opponent teams found, skipping defense player lookup', {
      leagueId,
      seasonYear,
      week,
    });
  }

  if (defenseError) {
    logger.warn('Failed to fetch defense players', {
      error: defenseError,
    });
  }

  // Build defense lookup: opponent team -> defense player ID
  const defenseMap = new Map<string, string>();
  if (defensePlayers) {
    for (const def of defensePlayers) {
      defenseMap.set(def.team.toLowerCase(), def.id);
    }
  }

  // 5. Get all opponent difficulty indices in one query (K-specific)
  // Use the most recent completed week (current week) for defense difficulty data
  // since the upcoming week hasn't been played yet
  const defensePlayerIds = Array.from(defenseMap.values());
  logger.info(
    'Fetching opponent difficulty data for K (using most recent completed week)',
    {
      leagueId,
      seasonYear,
      week,
      defensePlayerIdsCount: defensePlayerIds.length,
    }
  );

  let opponentDifficultyData = null;
  let opponentError = null;

  if (defensePlayerIds.length > 0) {
    const result = await supabase
      .from('defense_points_against')
      .select('player_id, k_rolling_3_wk_avg_norm')
      .eq('league_id', leagueId)
      .eq('season_year', seasonYear)
      .eq('week', week)
      .in('player_id', defensePlayerIds);
    opponentDifficultyData = result.data;
    opponentError = result.error;
  } else {
    logger.info(
      'No defense player IDs found, skipping opponent difficulty lookup',
      {
        leagueId,
        seasonYear,
        week,
      }
    );
  }

  if (opponentError) {
    logger.warn('Failed to fetch opponent difficulty data', {
      error: opponentError,
    });
  }

  // Build opponent difficulty lookup: defense player ID -> difficulty
  const difficultyMap = new Map<string, number>();
  if (opponentDifficultyData) {
    for (const od of opponentDifficultyData) {
      difficultyMap.set(od.player_id, od.k_rolling_3_wk_avg_norm || 0);
    }
  }

  // Build efficiency metrics lookup
  const efficiencyMap = new Map<string, any>();
  if (efficiencyMetrics) {
    for (const em of efficiencyMetrics) {
      efficiencyMap.set(em.player_id, em);
    }
  }

  // 6. Calculate weighted scores for all players
  logger.info('Calculating weighted scores for all K players', {
    leagueId,
    seasonYear,
    week,
    playerDataCount: playerData.length,
  });

  const updates: Array<{
    player_id: string;
    weighted_score: number | null;
    recent_mean_norm: number | null;
    recent_std_norm: number | null;
  }> = [];

  for (const player of playerData) {
    if (player.players?.position !== 'K') {
      continue;
    }

    const playerTeam = player.players?.team;
    let opponentDifficulty = 0;

    // Get opponent difficulty from lookup maps
    if (playerTeam) {
      const opponent = matchupMap.get(playerTeam.toLowerCase());
      if (opponent) {
        const defenseId = defenseMap.get(opponent.toLowerCase());
        if (defenseId) {
          opponentDifficulty = difficultyMap.get(defenseId) || 0;
        }
      }
    }

    const efficiency = efficiencyMap.get(player.player_id);
    const recentMean = player.recent_mean_norm || 0;
    const recentStd = Math.max(-2, Math.min(2, player.recent_std_norm || 0)); // Clip volatility z-score to ±2
    const fgProfileNorm = efficiency?.fg_profile_3wk_avg_norm || 0;
    const fgPatMissesNorm = efficiency?.fg_pat_misses_3wk_avg_norm || 0;
    const fgAttemptsNorm = efficiency?.fg_attempts_3wk_avg_norm || 0;

    // Calculate weighted score using the formula
    const weightedScore =
      POSITION_WEIGHTS.K.recent_mean * recentMean +
      POSITION_WEIGHTS.K.volatility * recentStd +
      POSITION_WEIGHTS.K.fg_profile * fgProfileNorm +
      POSITION_WEIGHTS.K.fg_pat_misses * fgPatMissesNorm +
      POSITION_WEIGHTS.K.fg_attempts * fgAttemptsNorm +
      POSITION_WEIGHTS.K.opponent_difficulty * opponentDifficulty;

    updates.push({
      player_id: player.player_id,
      weighted_score: Math.round(weightedScore * 1000) / 1000,
      recent_mean_norm: recentMean,
      recent_std_norm: recentStd,
    });
  }

  // 7. Batch update all weighted scores using SQL function
  logger.info('Preparing to update weighted scores', {
    leagueId,
    seasonYear,
    week,
    updatesCount: updates.length,
  });

  if (updates.length === 0) {
    logger.info('No weighted scores to update', {
      leagueId,
      seasonYear,
      week,
    });
    return;
  }

  // Prepare updates as JSONB array
  const updatesJson = updates.map((u) => ({
    player_id: u.player_id,
    weighted_score: u.weighted_score,
    recent_mean_norm: u.recent_mean_norm,
    recent_std_norm: u.recent_std_norm,
  }));

  logger.info('Calling SQL bulk update function', {
    leagueId,
    seasonYear,
    week,
    updatesCount: updatesJson.length,
  });

  // Try using SQL bulk update function
  const { data: result, error: rpcError } = await supabase.rpc(
    'bulk_update_weighted_scores',
    {
      p_league_id: leagueId,
      p_season_year: seasonYear,
      p_week: week,
      p_updates: updatesJson,
    }
  );

  if (rpcError) {
    logger.warn(
      'SQL bulk update failed, falling back to parallel individual updates',
      {
        error: rpcError,
        leagueId,
        seasonYear,
        week,
      }
    );
    // Fallback to parallel individual updates
    const batchSize = 100;
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      const updatePromises = batch.map((update) =>
        supabase
          .from('league_calcs')
          .update({
            weighted_score: update.weighted_score,
            recent_mean_norm: update.recent_mean_norm,
            recent_std_norm: update.recent_std_norm,
            updated_at: new Date().toISOString(),
          })
          .eq('league_id', leagueId)
          .eq('player_id', update.player_id)
          .eq('season_year', seasonYear)
          .eq('week', week)
      );

      const results = await Promise.all(updatePromises);
      const errors = results.filter((r: any) => r.error);
      if (errors.length > 0) {
        logger.error('Failed to update some weighted scores in batch', {
          leagueId,
          seasonYear,
          week,
          errorCount: errors.length,
          batchStart: i,
          batchSize: batch.length,
        });
      }
    }
  } else {
    logger.info('Successfully updated weighted scores using SQL bulk update', {
      leagueId,
      seasonYear,
      week,
      playersUpdated: result || updates.length,
    });
  }

  logger.info('Completed weighted score calculation for K players', {
    leagueId,
    seasonYear,
    week,
    kPlayersUpdated: updates.length,
  });
}

