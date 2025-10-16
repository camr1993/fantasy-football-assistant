# Sync NFL Matchups

This edge function syncs NFL game matchups from the ESPN API and stores them in the `nfl_matchups` table.

## Overview

The function fetches all NFL games for the current season from the ESPN scoreboard API and stores the matchup data (home team, away team, season, week) in the database.

## Usage

### Cron Job (Recommended)

This function is designed to be called via a cron job with no parameters:

```bash
curl -X POST https://your-project.supabase.co/functions/v1/sync-nfl-matchups \
  -H "x-supabase-webhook-source: YOUR_CRON_SECRET"
```

### Manual Testing

You can also call it manually for testing:

```bash
curl -X POST https://your-project.supabase.co/functions/v1/sync-nfl-matchups \
  -H "x-supabase-webhook-source: YOUR_CRON_SECRET" \
  -H "Content-Type: application/json"
```

## Parameters

No parameters are required. The function automatically:

- Fetches data for the current NFL season
- Processes all regular season games (excludes preseason, playoffs, etc.)
- Stores all matchups found in the API response

## Database Schema

The function stores data in the `nfl_matchups` table:

```sql
CREATE TABLE nfl_matchups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_team TEXT NOT NULL,           -- Home team abbreviation (e.g., 'CIN')
  away_team TEXT NOT NULL,           -- Away team abbreviation (e.g., 'PIT')
  season INT NOT NULL,               -- NFL season year (e.g., 2025)
  week INT NOT NULL,                 -- NFL week number (1-18)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(home_team, away_team, season, week)
);
```

## How It Works

1. **API Fetch**: Calls the ESPN scoreboard API to get all NFL games
2. **Data Parsing**: Extracts home team, away team, season, and week from each game
3. **Filtering**: Only processes regular season games (excludes preseason/playoffs)
4. **Database Storage**: Uses upsert to store/update matchups, handling duplicates gracefully

## ESPN API

The function uses the ESPN scoreboard API:

- **Endpoint**: `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?limit=1000&dates=20250901-20260104`
- **Data Range**: Covers the entire 2025 NFL season
- **Rate Limits**: No authentication required, but reasonable usage expected

## Response Format

### Success Response

```json
{
  "success": true,
  "message": "NFL matchups sync completed successfully",
  "syncId": "uuid-here",
  "matchupsProcessed": 256
}
```

### Error Response

```json
{
  "error": "Internal server error",
  "message": "NFL matchups sync process failed",
  "details": "Specific error message"
}
```

## Error Handling

The function handles various error scenarios:

- **API Failures**: Network issues, invalid responses, missing data
- **Database Errors**: Connection issues, constraint violations
- **Data Validation**: Missing team abbreviations, invalid week numbers
- **Authentication**: Invalid cron job secret

## Logging

All operations are logged with structured data:

- **Info**: Sync start/completion, data counts, successful operations
- **Warn**: Missing data, validation issues, non-critical errors
- **Error**: API failures, database errors, critical issues

## Dependencies

- **Supabase Client**: For database operations
- **ESPN API**: For NFL game data
- **Deno Runtime**: For edge function execution

## Environment Variables

Required environment variables:

- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for database access
- `CRON_JOB_SECRET`: Secret for cron job authentication

## Monitoring

Monitor the function through:

- **Supabase Dashboard**: Function logs and metrics
- **Response Data**: Check `matchupsProcessed` count
- **Database**: Verify data in `nfl_matchups` table

## Data Examples

Example matchup data stored:

```json
{
  "home_team": "CIN",
  "away_team": "PIT",
  "season": 2025,
  "week": 7
}
```

## Notes

- The function processes all games returned by the ESPN API
- Duplicate matchups are handled via database unique constraints
- Only regular season games are processed (season.type === 2)
- Team abbreviations match ESPN's format (3-letter codes)
