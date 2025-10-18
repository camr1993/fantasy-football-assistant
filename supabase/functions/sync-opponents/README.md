# Sync Opponents

This Supabase Edge Function (`sync-opponents`) is responsible for populating the `opponent_defense_player_id` field in the `player_stats` table. It matches each player with the defense they faced in a given week by looking up NFL matchups and finding the corresponding defense player.

## 🚀 Endpoint

`https://your-project-ref.supabase.co/functions/v1/sync-opponents`

## ⚙️ Parameters

This function accepts an optional `week` parameter in the request body:

```json
{
  "week": 7
}
```

- `week` (optional): The NFL week number (1-18). If not provided, defaults to the most recent NFL week.

## 🔒 Authentication

This function is protected by a cron job secret. You must include the `x-supabase-webhook-source` header with the value of your `CRON_JOB_SECRET` environment variable.

## 📝 Database Schema

The function updates the `player_stats` table by populating the `opponent_defense_player_id` field:

```sql
-- player_stats table (relevant fields)
opponent_defense_player_id UUID REFERENCES players(id)
```

## 💡 How It Works

1. **Trigger**: The function is invoked by a cron job or manual request.
2. **Authentication**: It verifies the `x-supabase-webhook-source` header against the `CRON_JOB_SECRET` environment variable.
3. **Fetch Player Stats**: Retrieves all player stats for the specified week that don't have an `opponent_defense_player_id` set.
4. **Find Matchups**: For each player, looks up their team's NFL matchup for the week from the `nfl_matchups` table.
5. **Find Opposing Defense**: Determines the opposing team and finds the defense player (`position = 'DEF'`) for that team.
6. **Update Records**: Updates the `player_stats` record with the `opponent_defense_player_id`.

## 🔗 Dependencies

- `nfl_matchups` table: Contains NFL game schedules
- `players` table: Contains player information including team and position
- `player_stats` table: The target table for updates

## 🛠️ Development

To develop or test this function locally:

1. Ensure your `.env.local` file has `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `CRON_JOB_SECRET` set.
2. Run `supabase functions serve --env-file .env.local` in your Supabase project root.
3. Trigger the function using `curl`:

```bash
# Sync current week
curl -X POST http://localhost:54321/functions/v1/sync-opponents \
  -H "x-supabase-webhook-source: YOUR_CRON_SECRET"

# Sync specific week
curl -X POST http://localhost:54321/functions/v1/sync-opponents \
  -H "x-supabase-webhook-source: YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"week": 7}'
```

## 📊 Response

```json
{
  "success": true,
  "message": "Opponents sync completed successfully",
  "syncId": "uuid",
  "opponentsProcessed": 150,
  "week": 7
}
```

## ⚠️ Notes

- The function processes records in batches of 100 to avoid overwhelming the database.
- Case-insensitive team name matching is used for robustness.
- If a matchup or defense player cannot be found for a player, that record is skipped with a debug log.
- The function only updates records where `opponent_defense_player_id` is currently `null`.
