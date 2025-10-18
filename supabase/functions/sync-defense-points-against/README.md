# Sync Defense Points Against

This edge function calculates and syncs weekly defense points against for fantasy football leagues. It tracks how many fantasy points each defense has allowed to opposing players by position (QB, RB, WR, TE, K) for each week.

## Usage

### Via Cron Job (Default)

```bash
# Sync current week's defense points against
curl -X POST https://your-project.supabase.co/functions/v1/sync-defense-points-against \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "x-supabase-webhook-source: YOUR_CRON_SECRET"
```

### With Parameters

```bash
# Sync specific week
curl -X POST https://your-project.supabase.co/functions/v1/sync-defense-points-against \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "x-supabase-webhook-source: YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"week": 5}'

```

## Parameters

- `week` (optional):
  - Number (1-18): Sync specific week
  - undefined: Defaults to current NFL week

## Database Schema

### defense_points_against Table

- `league_id`: UUID reference to the league
- `player_id`: UUID reference to defense player
- `season_year`: Season year
- `week`: Week number (1-18)
- `QB_pts_against`: Weekly fantasy points allowed to QB position
- `RB_pts_against`: Weekly fantasy points allowed to RB position
- `WR_pts_against`: Weekly fantasy points allowed to WR position
- `TE_pts_against`: Weekly fantasy points allowed to TE position
- `K_pts_against`: Weekly fantasy points allowed to K position

### player_stats Table

- `opponent_defense_player_id`: UUID reference to the defense player that the current player faced

## How It Works

1. Fetches all leagues for the current season
2. Fetches all defense players from the database
3. For each league and defense player combination, calculates weekly fantasy points allowed by position
4. Uses the `opponent_defense_player_id` field in `player_stats` to determine matchups
5. Uses `league_calcs` table for accurate league-specific fantasy points
6. Updates or inserts weekly data in `defense_points_against` table

## Dependencies

- Requires `opponent_defense_player_id` to be populated in `player_stats` table
- Uses `league_calcs` table for accurate league-specific fantasy points
- Requires `get_defense_totals_by_position` database function
