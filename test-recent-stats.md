# Test Recent Statistics Implementation

## Overview

This document outlines how to test the recent statistics (recent_mean and recent_std) implementation in the league_calcs table.

## Database Changes

1. **New columns added to league_calcs table:**
   - `recent_mean` (NUMERIC): Rolling mean of fantasy points over recent weeks
   - `recent_std` (NUMERIC): Rolling standard deviation of fantasy points over recent weeks

2. **Configuration:**
   - `RECENT_WEEKS = 3`: Number of recent weeks to include in calculations
   - Current week is included as the first week in the calculation

## Testing Steps

### 1. Verify Database Schema

```sql
-- Check that new columns exist
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'league_calcs'
AND column_name IN ('recent_mean', 'recent_std');
```

### 2. Test Recent Statistics Calculation

```sql
-- Check recent statistics for a specific player
SELECT
  league_id,
  player_id,
  week,
  fantasy_points,
  recent_mean,
  recent_std,
  created_at,
  updated_at
FROM league_calcs
WHERE league_id = 'your-league-id'
  AND player_id = 'your-player-id'
  AND season_year = 2024
ORDER BY week;
```

### 3. Verify Calculation Logic

```sql
-- Manual verification of recent mean calculation
-- For a player with weeks 1, 2, 3, 4, 5:
-- Week 3 should include weeks 1, 2, 3 (3 weeks)
-- Week 4 should include weeks 2, 3, 4 (3 weeks)
-- Week 5 should include weeks 3, 4, 5 (3 weeks)

WITH player_weeks AS (
  SELECT
    week,
    fantasy_points,
    AVG(fantasy_points) OVER (
      ORDER BY week
      ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
    ) as manual_mean,
    STDDEV(fantasy_points) OVER (
      ORDER BY week
      ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
    ) as manual_std
  FROM league_calcs
  WHERE league_id = 'your-league-id'
    AND player_id = 'your-player-id'
    AND season_year = 2024
    AND week >= 3  -- Only weeks where we have enough data
)
SELECT
  week,
  fantasy_points,
  manual_mean,
  recent_mean,
  manual_std,
  recent_std,
  ABS(manual_mean - recent_mean) as mean_diff,
  ABS(manual_std - recent_std) as std_diff
FROM player_weeks p
JOIN league_calcs lc ON lc.week = p.week
  AND lc.league_id = 'your-league-id'
  AND lc.player_id = 'your-player-id'
  AND lc.season_year = 2024
ORDER BY week;
```

### 4. Test Edge Function

```bash
# Test the league-calcs function
curl -X POST "https://your-project.supabase.co/functions/v1/league-calcs" \
  -H "Authorization: Bearer your-anon-key" \
  -H "x-supabase-webhook-source: your-cron-secret" \
  -H "Content-Type: application/json" \
  -d '{
    "league_id": "your-league-id",
    "week": 5
  }'
```

### 5. Verify Recent Stats Are Updated

After running the function, check that recent_mean and recent_std are populated:

```sql
-- Check that recent stats are populated for the current week
SELECT
  COUNT(*) as total_records,
  COUNT(recent_mean) as records_with_mean,
  COUNT(recent_std) as records_with_std,
  AVG(recent_mean) as avg_recent_mean,
  AVG(recent_std) as avg_recent_std
FROM league_calcs
WHERE league_id = 'your-league-id'
  AND season_year = 2024
  AND week = 5;
```

## Expected Behavior

1. **For weeks 1-2:** recent_mean and recent_std should be NULL (not enough data)
2. **For week 3+:** recent_mean and recent_std should be calculated using the last 3 weeks including current
3. **Calculation includes current week:** Week 3 uses weeks 1, 2, 3; Week 4 uses weeks 2, 3, 4
4. **Rounding:** Values should be rounded to 2 decimal places
5. **Performance:** Recent stats should be calculated after main fantasy points calculation

## Configuration Changes

To change the number of recent weeks, update the `RECENT_WEEKS` constant in:

- `/supabase/functions/league-calcs/leagueCalcs.ts` (line 6)
- `/supabase/migrations/20250111000023_calculate_weekly_fantasy_points.sql` (line 212)

## Notes

- Recent statistics are calculated after the main fantasy points calculation
- The SQL function calculates recent stats during the main calculation
- The TypeScript function provides a backup calculation method
- Both methods should produce the same results
