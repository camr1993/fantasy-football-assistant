import { logger } from '../../../supabase/functions/utils/logger.ts';
import { supabase } from '../../../supabase/functions/utils/supabase.ts';
import { getMostRecentNFLWeek } from '../../../supabase/functions/utils/syncHelpers.ts';

/**
 * Sync opponents for all player stats
 * Populates opponent_defense_player_id for all player stats in the given week
 */
export async function syncOpponents(week?: number): Promise<number> {
  const currentYear = new Date().getFullYear();
  const currentWeek = week ?? getMostRecentNFLWeek();

  logger.info('Starting opponents sync', {
    week: currentWeek,
    seasonYear: currentYear,
  });

  try {
    // Populate opponent defense player IDs
    const updatedCount = await populateOpponentDefensePlayerIds(
      currentYear,
      currentWeek
    );

    logger.info('Completed opponents sync', {
      updatedCount,
      week: currentWeek,
      seasonYear: currentYear,
    });

    return updatedCount;
  } catch (error) {
    logger.error('Opponents sync failed', {
      error: error instanceof Error ? error.message : String(error),
      week: currentWeek,
      seasonYear: currentYear,
    });
    throw error;
  }
}

/**
 * Populates opponent_defense_player_id for all player stats in the given week
 */
async function populateOpponentDefensePlayerIds(
  seasonYear: number,
  week: number
): Promise<number> {
  try {
    logger.info('Populating opponent defense player IDs', {
      seasonYear,
      week,
    });

    // Get all player stats that need opponent_defense_player_id populated with pagination
    const allPlayerStats = [];
    let from = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: playerStats, error: statsError } = await supabase
        .from('player_stats')
        .select(
          `
          id,
          player_id,
          season_year,
          week,
          players!player_stats_player_id_fkey(team)
        `
        )
        .eq('season_year', seasonYear)
        .eq('week', week)
        .is('opponent_defense_player_id', null)
        .eq('source', 'actual')
        .range(from, from + pageSize - 1);

      if (statsError) {
        logger.error('Failed to fetch player stats', {
          error: statsError,
          from,
          pageSize,
        });
        throw new Error(`Failed to fetch player stats: ${statsError.message}`);
      }

      if (!playerStats || playerStats.length === 0) {
        hasMore = false;
        break;
      }

      allPlayerStats.push(...playerStats);

      if (playerStats.length < pageSize) {
        hasMore = false;
      } else {
        from += pageSize;
      }
    }

    if (allPlayerStats.length === 0) {
      logger.info('No player stats found that need opponent defense player ID');
      return 0;
    }

    logger.info(`Found ${allPlayerStats.length} player stats to update`);

    // Process in batches to avoid overwhelming the database
    const batchSize = 100;
    let updatedCount = 0;

    for (let i = 0; i < allPlayerStats.length; i += batchSize) {
      const batch = allPlayerStats.slice(i, i + batchSize);
      const updates = [];

      for (const stat of batch) {
        const playerTeam = (stat as unknown as { players: { team: string } })
          .players?.team;

        if (!playerTeam) {
          logger.debug('Player has no team, skipping', {
            playerId: stat.player_id,
            statId: stat.id,
          });
          continue;
        }

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
            // Determine the opposing team (case-insensitive comparison)
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
              updates.push({
                id: stat.id,
                opponent_defense_player_id: defensePlayer.id,
              });
            }
          }
        } catch (error) {
          logger.debug('Could not find opponent defense player', {
            playerTeam,
            week,
            season: seasonYear,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Update the batch
      if (updates.length > 0) {
        // Update each record individually to avoid upsert issues
        let batchUpdatedCount = 0;
        for (const update of updates) {
          const { error: updateError } = await supabase
            .from('player_stats')
            .update({
              opponent_defense_player_id: update.opponent_defense_player_id,
            })
            .eq('id', update.id);

          if (updateError) {
            logger.error('Failed to update individual player stat', {
              error: updateError,
              statId: update.id,
            });
          } else {
            batchUpdatedCount++;
          }
        }

        updatedCount += batchUpdatedCount;
        logger.debug('Updated opponent defense player IDs', {
          batchSize: updates.length,
          batchUpdatedCount,
          totalUpdated: updatedCount,
        });
      }
    }

    logger.info('Completed populating opponent defense player IDs', {
      totalStats: allPlayerStats.length,
      updatedCount,
    });

    return updatedCount;
  } catch (error) {
    logger.error('Error populating opponent defense player IDs', {
      error: error instanceof Error ? error.message : String(error),
      seasonYear,
      week,
    });
    throw error;
  }
}
