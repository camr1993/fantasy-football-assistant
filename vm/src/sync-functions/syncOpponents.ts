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
 * Resolve the Yahoo game key for a season (e.g. "470" for 2026).
 *
 * Yahoo issues a new game key each year and embeds it in every player key, so
 * `players` accumulates one row per team defense per season - all with the
 * same name and team. Without the game key there is no way to tell this
 * season's defense from last season's.
 */
async function getSeasonGameKey(seasonYear: number): Promise<string | null> {
  const { data, error } = await supabase
    .from('leagues')
    .select('yahoo_league_id')
    .eq('season_year', seasonYear)
    .not('yahoo_league_id', 'is', null)
    .limit(1)
    .maybeSingle();

  if (error || !data?.yahoo_league_id) {
    logger.error('Could not resolve Yahoo game key for season', {
      seasonYear,
      error: error?.message,
    });
    return null;
  }

  // "470.l.855357" -> "470"
  return data.yahoo_league_id.split('.')[0] || null;
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

    // Resolve once per run rather than per player
    const gameKey = await getSeasonGameKey(seasonYear);
    if (!gameKey) {
      throw new Error(
        `Cannot resolve Yahoo game key for ${seasonYear}; refusing to guess ` +
          "which season's defenses to link opponents to"
      );
    }

    // Cache defense lookups - a week only ever involves 32 teams
    const defenseIdByTeam = new Map<string, string | null>();
    let skippedNoMatchup = 0;
    let skippedNoDefense = 0;

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

        // Find the matchup for this team in the current week. A team on bye
        // has no matchup, which is expected rather than an error.
        const { data: matchup } = await supabase
          .from('nfl_matchups')
          .select('home_team, away_team')
          .eq('season', seasonYear)
          .eq('week', week)
          .or(`home_team.eq.${playerTeam},away_team.eq.${playerTeam}`)
          .maybeSingle();

        if (!matchup) {
          skippedNoMatchup++;
          continue;
        }

        // Determine the opposing team (case-insensitive comparison)
        const opposingTeam =
          matchup.home_team.toLowerCase() === playerTeam.toLowerCase()
            ? matchup.away_team
            : matchup.home_team;

        if (!defenseIdByTeam.has(opposingTeam)) {
          // Scope to this season's game key. Matching on team alone returns
          // one defense per season played, and the previous `.single()` threw
          // on the extra rows - silently skipping every update once a second
          // season existed.
          const { data: defensePlayers, error: defenseError } = await supabase
            .from('players')
            .select('id, yahoo_player_id')
            .ilike('team', opposingTeam)
            .eq('position', 'DEF')
            .like('yahoo_player_id', `${gameKey}.%`);

          if (defenseError) {
            logger.warn('Defense lookup failed', {
              opposingTeam,
              gameKey,
              error: defenseError.message,
            });
          }

          if (!defensePlayers || defensePlayers.length === 0) {
            logger.warn('No defense found for team in this season', {
              opposingTeam,
              gameKey,
              seasonYear,
            });
          } else if (defensePlayers.length > 1) {
            logger.warn('Multiple defenses matched; using the first', {
              opposingTeam,
              gameKey,
              matched: defensePlayers.map((d) => d.yahoo_player_id),
            });
          }

          defenseIdByTeam.set(opposingTeam, defensePlayers?.[0]?.id ?? null);
        }

        const defenseId = defenseIdByTeam.get(opposingTeam);

        if (!defenseId) {
          skippedNoDefense++;
          continue;
        }

        updates.push({
          id: stat.id,
          opponent_defense_player_id: defenseId,
        });
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
      skippedNoMatchup,
      skippedNoDefense,
    });

    // Updating nothing when there was work to do means the lookups are broken,
    // not that everything was already populated - the query only selects rows
    // where opponent_defense_player_id is null.
    if (updatedCount === 0 && allPlayerStats.length > 0) {
      throw new Error(
        `Found ${allPlayerStats.length} player stats needing an opponent for ` +
          `${seasonYear} week ${week} but updated none ` +
          `(${skippedNoMatchup} without a matchup, ${skippedNoDefense} without a defense)`
      );
    }

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
