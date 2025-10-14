# League Calcs Test

This document outlines how to test the league calculations functionality.

## Prerequisites

1. Ensure the database migrations have been applied
2. Have some player stats data in the `player_stats` table
3. Have league stat modifiers configured in the `league_stat_modifiers` table
4. Have the `league-calcs` edge function deployed

## Test Steps

### 1. Check Database Functions

Verify the functions exist in the database:

```sql
-- Check if the function exists
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_name IN ('calculate_weekly_fantasy_points', 'recalculate_all_fantasy_points');
```

### 2. Test Individual League Calculation

```sql
-- Test calculating points for a specific league
SELECT calculate_weekly_fantasy_points(
  'your-league-id-here'::uuid,
  2024,
  1
);
```

### 3. Check Database Structure

```sql
-- Verify player_stats has individual stat columns (no points column)
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'player_stats'
AND column_name IN ('passing_yards', 'rushing_yards', 'receptions')
ORDER BY column_name;

-- Verify league_calcs table exists
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'league_calcs'
ORDER BY column_name;
```

### 4. Check League Modifiers

```sql
-- Verify league modifiers are configured
SELECT lsm.league_id, sd.name, lsm.value
FROM league_stat_modifiers lsm
JOIN stat_definitions sd ON sd.stat_id = lsm.stat_id
WHERE lsm.league_id = 'your-league-id-here'::uuid
LIMIT 10;
```

### 5. Test League Calcs API Endpoint

```bash
# Test the league-calcs API endpoint (default - all leagues)
curl -X POST https://your-project.supabase.co/functions/v1/league-calcs \
  -H "x-supabase-webhook-source: YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{}'

# Test specific league
curl -X POST https://your-project.supabase.co/functions/v1/league-calcs \
  -H "x-supabase-webhook-source: YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "league_id": "your-league-id-here",
    "week": 1
  }'

# Test recalculate all
curl -X POST https://your-project.supabase.co/functions/v1/league-calcs \
  -H "x-supabase-webhook-source: YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "recalculate_all": true,
    "week": 1
  }'

# Test with specific week
curl -X POST https://your-project.supabase.co/functions/v1/league-calcs \
  -H "x-supabase-webhook-source: YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "week": 5
  }'
```

### 6. Verify Points Calculation

```sql
-- Check that points were calculated correctly in league_calcs
SELECT
  lc.league_id,
  lc.player_id,
  lc.season_year,
  lc.week,
  lc.fantasy_points,
  ps.passing_yards,
  ps.rushing_yards,
  ps.receptions
FROM league_calcs lc
JOIN player_stats ps ON ps.player_id = lc.player_id
  AND ps.season_year = lc.season_year
  AND ps.week = lc.week
  AND ps.source = 'actual'
WHERE lc.season_year = 2024
  AND lc.week = 1
  AND lc.fantasy_points > 0
LIMIT 10;
```

## Expected Results

1. The `league-calcs` API should return success with results
2. Fantasy points should be stored in the `league_calcs` table
3. **Only players who played that week** (`played = true`) should have calculated points
4. Points should be calculated as: sum of (stat_value \* league_modifier) for each stat
5. Each league will have different point totals for the same player
6. The function can be called by cron jobs or manually
7. Default behavior calculates points for all leagues for current week

## Troubleshooting

### Common Issues

1. **No points calculated**: Check if league modifiers exist for the league
2. **Zero points**: Verify that player stats have non-zero values
3. **Function not found**: Ensure migrations have been applied
4. **API errors**: Check authentication and request format
5. **Missing league_calcs data**: Ensure the league_calcs table exists and has data
6. **Edge function not deployed**: Ensure the league-calcs function is deployed
7. **Cron job failures**: Check cron job configuration and authentication

### Debug Queries

```sql
-- Check if a specific player has stats
SELECT * FROM player_stats
WHERE player_id = 'player-id-here'
AND season_year = 2024
AND week = 1;

-- Check if a specific player has calculated points
SELECT * FROM league_calcs
WHERE player_id = 'player-id-here'
AND season_year = 2024
AND week = 1;

-- Check league modifiers for a specific stat
SELECT lsm.value, sd.name
FROM league_stat_modifiers lsm
JOIN stat_definitions sd ON sd.stat_id = lsm.stat_id
WHERE lsm.league_id = 'league-id-here'
AND sd.player_stats_column = 'passing_yards';

-- Compare points across leagues for the same player
SELECT lc.league_id, lc.fantasy_points, l.name as league_name
FROM league_calcs lc
JOIN leagues l ON l.id = lc.league_id
WHERE lc.player_id = 'player-id-here'
AND lc.season_year = 2024
AND lc.week = 1
ORDER BY lc.fantasy_points DESC;
```

### 7. Verify Only Players Who Played Have Points

```sql
-- Check that only players who played have calculated points
SELECT
  ps.player_id,
  ps.played,
  lc.fantasy_points,
  CASE
    WHEN ps.played = true AND lc.fantasy_points IS NOT NULL THEN 'CORRECT'
    WHEN ps.played = false AND lc.fantasy_points IS NULL THEN 'CORRECT'
    ELSE 'ERROR'
  END as status
FROM player_stats ps
LEFT JOIN league_calcs lc ON lc.player_id = ps.player_id
  AND lc.season_year = ps.season_year
  AND lc.week = ps.week
WHERE ps.season_year = 2024
  AND ps.week = 1
  AND ps.source = 'actual'
ORDER BY ps.played DESC, lc.fantasy_points DESC;
```

## Cron Job Setup

The `league-calcs` function is designed to be called by cron jobs. Here's how to set it up:

### 1. Create Cron Job

Set up a cron job to run after player stats are synced:

```bash
# Run every hour after stats sync (adjust timing as needed)
0 2 * * * curl -X POST https://your-project.supabase.co/functions/v1/league-calcs \
  -H "x-supabase-webhook-source: YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### 2. Cron Job Secret

Set up the cron job secret:

```bash
# Set the CRON_JOB_SECRET environment variable in Supabase
# Settings > Edge Functions > Environment Variables
# Add: CRON_JOB_SECRET = your-secret-key-here
```

### 3. Monitoring

Monitor the cron job execution:

```sql
-- Check recent calculations
SELECT
  league_id,
  season_year,
  week,
  COUNT(*) as player_count,
  MAX(updated_at) as last_updated
FROM league_calcs
WHERE updated_at > NOW() - INTERVAL '1 hour'
GROUP BY league_id, season_year, week
ORDER BY last_updated DESC;
```

### 4. Error Handling

The function includes comprehensive logging. Check logs in Supabase dashboard:

- Edge Functions > league-calcs > Logs
