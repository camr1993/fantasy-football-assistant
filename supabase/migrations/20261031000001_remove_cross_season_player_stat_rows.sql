-- Remove stats and calcs written against previous seasons' player keys.
--
-- sync-player-stats fetched every row in `players` regardless of season, so a
-- 2026 run also asked Yahoo for stats using 2025 player keys (461.p.*). Yahoo
-- answered, and we stored a second set of 2026 rows keyed to player records
-- that no roster references.
--
-- The visible symptom was the waiver wire recommending players who were
-- already rostered: get_waiver_wire_players excludes rostered players by
-- players.id, roster_entry only ever points at current-season rows, so a
-- rostered player's previous-season duplicate passed straight through the
-- filter and ranked as a free agent.
--
-- Deletes only rows whose season disagrees with their player key's game key,
-- so historical seasons are untouched. league_calcs has no surrogate key
-- (its primary key is league_id, player_id, season_year, week), so both
-- deletes join through USING rather than collecting ids.

WITH season_game_keys AS (
  -- One game key per season, taken from any league in that season
  SELECT DISTINCT ON (l.season_year)
    l.season_year,
    split_part(l.yahoo_league_id, '.', 1) AS game_key
  FROM leagues l
  WHERE l.yahoo_league_id IS NOT NULL
  ORDER BY l.season_year, l.yahoo_league_id
)
DELETE FROM player_stats ps
USING players p, season_game_keys sgk
WHERE p.id = ps.player_id
  AND sgk.season_year = ps.season_year
  AND p.yahoo_player_id IS NOT NULL
  AND split_part(p.yahoo_player_id, '.', 1) <> sgk.game_key;

WITH season_game_keys AS (
  SELECT DISTINCT ON (l.season_year)
    l.season_year,
    split_part(l.yahoo_league_id, '.', 1) AS game_key
  FROM leagues l
  WHERE l.yahoo_league_id IS NOT NULL
  ORDER BY l.season_year, l.yahoo_league_id
)
DELETE FROM league_calcs lc
USING players p, season_game_keys sgk
WHERE p.id = lc.player_id
  AND sgk.season_year = lc.season_year
  AND p.yahoo_player_id IS NOT NULL
  AND split_part(p.yahoo_player_id, '.', 1) <> sgk.game_key;
