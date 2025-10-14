# League Calcs Edge Function

This function calculates weekly fantasy points for all leagues using league-specific scoring modifiers. It's designed to be called by cron jobs or manually.

## Overview

The league calculations system works by:

1. Taking raw player stats from the `player_stats` table
2. **Only processing players who played that week** (`played = true`)
3. Applying league-specific modifiers from `league_stat_modifiers`
4. Calculating fantasy points for each player in each league
5. Storing results in the `league_calcs` table

## Key Features

- **Only calculates for players who played**: Uses the `played` field to filter out inactive players
- **Separated logic**: Calculation logic is in `leagueCalcs.ts` for better maintainability
- **Cron job ready**: Designed to be called by scheduled jobs
- **Flexible**: Can calculate for specific leagues or all leagues

## Usage

### Cron Job (Default)

When called without parameters, calculates points for all leagues for the current week:

```bash
# Called by cron job
curl -X POST https://your-project.supabase.co/functions/v1/league-calcs \
  -H "x-supabase-webhook-source: YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Manual Calculation

Calculate points for a specific league and week:

```bash
curl -X POST https://your-project.supabase.co/functions/v1/league-calcs \
  -H "x-supabase-webhook-source: YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "league_id": "123e4567-e89b-12d3-a456-426614174000",
    "week": 1
  }'
```

### Recalculate All

Recalculate points for all leagues and weeks:

```bash
curl -X POST https://your-project.supabase.co/functions/v1/league-calcs \
  -H "x-supabase-webhook-source: YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "recalculate_all": true,
    "week": 1
  }'
```

### With Week Parameter

Calculate points for all leagues for a specific week:

```bash
curl -X POST https://your-project.supabase.co/functions/v1/league-calcs \
  -H "x-supabase-webhook-source: YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "week": 5
  }'
```

## Request Parameters

- `league_id` (optional): Specific league ID to calculate
- `week` (optional): Week number (defaults to current NFL week)
- `recalculate_all` (optional): Recalculate all leagues and weeks

## Authentication

This function uses cron job authentication via the `x-supabase-webhook-source` header:

- Set the `CRON_JOB_SECRET` environment variable
- Include the secret in the `x-supabase-webhook-source` header
- No user authentication required (designed for cron jobs)

## Response

```json
{
  "success": true,
  "message": "Fantasy points calculated for all leagues",
  "calcId": "uuid",
  "week": 1,
  "league_id": null,
  "recalculate_all": false,
  "results": [
    {
      "league_id": "uuid",
      "season_year": 2024,
      "week": 1,
      "updated_count": 150
    }
  ]
}
```

## Database Functions Used

- `calculate_weekly_fantasy_points(league_id, season_year, week)`: Calculates points for a specific league
- `recalculate_all_fantasy_points(season_year, week)`: Calculates points for all leagues

## Cron Job Setup

This function is designed to be called by a cron job after player stats are synced. The typical flow is:

1. `sync-player-stats` runs and updates raw player statistics
2. `league-calcs` runs and calculates fantasy points for all leagues
3. Results are stored in `league_calcs` table

## Error Handling

The function includes comprehensive error handling and logging:

- Authentication errors return 401
- Database errors return 500 with error details
- All operations are logged for debugging

## Performance

- Uses efficient SQL queries with UPSERT operations
- Processes all leagues in parallel where possible
- Returns detailed results for monitoring
