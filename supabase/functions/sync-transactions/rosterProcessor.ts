import { logger } from '../utils/logger.ts';
import { supabase } from '../utils/supabase.ts';
import { getCurrentNFLWeek } from '../utils/syncHelpers.ts';
import {
  YahooTransaction,
  getTeamIdByYahooKey,
  addPlayerToRoster,
  removePlayerFromRoster,
} from './transactionSync.ts';

/**
 * Process transactions and update rosters
 */
export async function processTransactions(
  leagueId: string,
  transactions: YahooTransaction[]
): Promise<number> {
  logger.info('Processing transactions', {
    leagueId,
    count: transactions.length,
  });

  let rosterUpdates = 0;
  const currentYear = new Date().getFullYear();
  const currentWeek = getCurrentNFLWeek();

  for (const transaction of transactions) {
    const transactionData = transaction.transaction[0];
    const type = transactionData.type;
    const players = transactionData.players;

    if (!players || players.length === 0) continue;

    // Process each player in the transaction
    for (const playerData of players) {
      const player = playerData.player[0];
      const playerKey = player.player_key;
      const transactionData = player.transaction_data[0];
      const transactionType = transactionData.type;

      // Get player ID from our database
      const { data: playerRecord } = await supabase
        .from('players')
        .select('id')
        .eq('yahoo_player_id', playerKey)
        .single();

      if (!playerRecord) continue;

      // Get team IDs
      const sourceTeamId = transactionData.source_team_key
        ? await getTeamIdByYahooKey(transactionData.source_team_key)
        : null;
      const destinationTeamId = transactionData.destination_team_key
        ? await getTeamIdByYahooKey(transactionData.destination_team_key)
        : null;

      if (transactionType === 'add' && destinationTeamId) {
        // Add player to roster
        await addPlayerToRoster(
          destinationTeamId,
          playerRecord.id,
          currentYear,
          currentWeek
        );
        rosterUpdates++;
      } else if (transactionType === 'drop' && sourceTeamId) {
        // Remove player from roster
        await removePlayerFromRoster(
          sourceTeamId,
          playerRecord.id,
          currentYear,
          currentWeek
        );
        rosterUpdates++;
      } else if (
        transactionType === 'add/drop' &&
        sourceTeamId &&
        destinationTeamId
      ) {
        // Move player between teams
        await removePlayerFromRoster(
          sourceTeamId,
          playerRecord.id,
          currentYear,
          currentWeek
        );
        await addPlayerToRoster(
          destinationTeamId,
          playerRecord.id,
          currentYear,
          currentWeek
        );
        rosterUpdates++;
      }
    }
  }

  logger.info('Completed processing transactions', { leagueId, rosterUpdates });
  return rosterUpdates;
}

/**
 * Update waiver wire from transactions
 */
export async function updateWaiverWireFromTransactions(
  leagueId: string,
  transactions: YahooTransaction[]
) {
  logger.info('Updating waiver wire from transactions', { leagueId });

  for (const transaction of transactions) {
    const transactionData = transaction.transaction[0];
    const players = transactionData.players;

    if (!players || players.length === 0) continue;

    for (const playerData of players) {
      const player = playerData.player[0];
      const playerKey = player.player_key;
      const transactionData = player.transaction_data[0];

      // Get player ID from our database
      const { data: playerRecord } = await supabase
        .from('players')
        .select('id')
        .eq('yahoo_player_id', playerKey)
        .single();

      if (!playerRecord) continue;

      // Get team IDs
      const sourceTeamId = transactionData.source_team_key
        ? await getTeamIdByYahooKey(transactionData.source_team_key)
        : null;
      const destinationTeamId = transactionData.destination_team_key
        ? await getTeamIdByYahooKey(transactionData.destination_team_key)
        : null;

      const currentWeek = getCurrentNFLWeek();
      const transactionDate = new Date(transactionData.timestamp);

      // Update waiver wire entry
      await supabase.from('waiver_wire').upsert(
        {
          league_id: leagueId,
          player_id: playerRecord.id,
          week: currentWeek,
          available: true,
          added_to_team_id: destinationTeamId,
          dropped_from_team_id: sourceTeamId,
          transaction_id: transactionData.transaction_key,
          transaction_date: transactionDate.toISOString(),
          last_updated: new Date().toISOString(),
        },
        {
          onConflict: 'league_id,player_id,week',
        }
      );
    }
  }
}
