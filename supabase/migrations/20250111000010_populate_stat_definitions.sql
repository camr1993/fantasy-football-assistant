-- Populate stat_definitions table with Yahoo Fantasy Sports stat mappings
-- Based on actual Yahoo Fantasy Sports XML response

-- First, make player_stats_column nullable to allow advanced stats
ALTER TABLE stat_definitions ALTER COLUMN player_stats_column DROP NOT NULL;

INSERT INTO stat_definitions (stat_id, name, player_stats_column, category) VALUES
-- Passing Stats
(4, 'Passing Yards', 'passing_yards', 'passing'),
(5, 'Passing Touchdowns', 'passing_touchdowns', 'passing'),
(6, 'Interceptions', 'interceptions', 'passing'),

-- Rushing Stats
(9, 'Rushing Yards', 'rushing_yards', 'rushing'),
(10, 'Rushing Touchdowns', 'rushing_touchdowns', 'rushing'),

-- Receiving Stats
(11, 'Receptions', 'receptions', 'receiving'),
(12, 'Receiving Yards', 'receiving_yards', 'receiving'),
(13, 'Receiving Touchdowns', 'receiving_touchdowns', 'receiving'),

-- Return Stats
(15, 'Return Touchdowns', 'return_touchdowns', 'returns'),

-- Misc Stats
(16, 'Two Point Conversions', 'two_point_conversions', 'misc'),
(18, 'Fumbles Lost', 'fumbles_lost', 'misc'),
(57, 'Offensive Fumble Return TD', 'offensive_fumble_return_td', 'misc'),

-- Kicking Stats
(19, 'Field Goals Made 0-19', 'fg_made_0_19', 'kicking'),
(20, 'Field Goals Made 20-29', 'fg_made_20_29', 'kicking'),
(21, 'Field Goals Made 30-39', 'fg_made_30_39', 'kicking'),
(22, 'Field Goals Made 40-49', 'fg_made_40_49', 'kicking'),
(23, 'Field Goals Made 50+', 'fg_made_50_plus', 'kicking'),
(24, 'Field Goals Missed 0-19', 'fg_missed_0_19', 'kicking'),
(25, 'Field Goals Missed 20-29', 'fg_missed_20_29', 'kicking'),
(29, 'Extra Points Made', 'pat_made', 'kicking'),
(30, 'Extra Points Missed', 'pat_missed', 'kicking'),

-- Defense Stats
(31, 'Points Allowed', 'points_allowed', 'defense'),
(32, 'Sacks', 'sacks', 'defense'),
(33, 'Interceptions', 'defensive_int', 'defense'),
(34, 'Fumble Recoveries', 'fumble_recoveries', 'defense'),
(35, 'Defensive Touchdowns', 'defensive_touchdowns', 'defense'),
(36, 'Safeties', 'safeties', 'defense'),
(37, 'Blocked Kicks', 'block_kicks', 'defense'),

-- Points Allowed Ranges (these are special - they're mutually exclusive)
(50, 'Points Allowed 0', 'points_allowed_0', 'defense'),
(51, 'Points Allowed 1-6', 'points_allowed_1_6', 'defense'),
(52, 'Points Allowed 7-13', 'points_allowed_7_13', 'defense'),
(53, 'Points Allowed 14-20', 'points_allowed_14_20', 'defense'),
(54, 'Points Allowed 21-27', 'points_allowed_21_27', 'defense'),
(55, 'Points Allowed 28-34', 'points_allowed_28_34', 'defense'),
(56, 'Points Allowed 35+', 'points_allowed_35_plus', 'defense'),

-- Advanced Stats (for future use)
(1001, 'Passing Completion Percentage', NULL, 'advanced'),
(1002, 'Passing Yards Per Attempt', NULL, 'advanced'),
(1003, 'Passing Yards Per Completion', NULL, 'advanced'),
(1004, 'Rushing Yards Per Attempt', NULL, 'advanced'),
(1005, 'Receiving Yards Per Reception', NULL, 'advanced'),
(1006, 'Receiving Yards Per Target', NULL, 'advanced'),
(1007, 'Targets', NULL, 'advanced'),
(1008, 'Reception Percentage', NULL, 'advanced'),
(1009, 'Rushing Attempts', NULL, 'advanced'),
(1010, 'Fumbles', NULL, 'advanced'),
(1011, 'Fumbles Recovered', NULL, 'advanced'),
(1012, 'Fumbles Forced', NULL, 'advanced'),
(1013, 'Tackles', NULL, 'advanced');

-- Add some common league scoring modifiers as examples
-- Based on the Yahoo Friends and Family League example from XML
INSERT INTO league_stat_modifiers (league_id, stat_id, value)
SELECT
  l.id as league_id,
  sd.stat_id,
  CASE sd.stat_id
    -- Passing (from XML example)
    WHEN 4 THEN 0.04    -- 1 point per 25 passing yards
    WHEN 5 THEN 4.0     -- 4 points per passing TD
    WHEN 6 THEN -1.0    -- -1 point per interception

    -- Rushing (from XML example)
    WHEN 9 THEN 0.1     -- 1 point per 10 rushing yards
    WHEN 10 THEN 6.0    -- 6 points per rushing TD

    -- Receiving (from XML example - 0.75 PPR)
    WHEN 11 THEN 0.75   -- 0.75 points per reception
    WHEN 12 THEN 0.1    -- 1 point per 10 receiving yards
    WHEN 13 THEN 6.0    -- 6 points per receiving TD

    -- Returns
    WHEN 15 THEN 6.0    -- 6 points per return TD

    -- Misc
    WHEN 16 THEN 2.0    -- 2 points per 2-point conversion
    WHEN 18 THEN -1.0   -- -1 point per fumble lost
    WHEN 57 THEN 6.0    -- 6 points per offensive fumble return TD

    -- Kicking (from XML example)
    WHEN 19 THEN 3.0    -- 3 points per FG 0-19
    WHEN 20 THEN 3.0    -- 3 points per FG 20-29
    WHEN 21 THEN 3.0    -- 3 points per FG 30-39
    WHEN 22 THEN 4.0    -- 4 points per FG 40-49
    WHEN 23 THEN 5.0    -- 5 points per FG 50+
    WHEN 24 THEN -3.0   -- -3 points per missed FG 0-19
    WHEN 25 THEN -1.0   -- -1 point per missed FG 20-29
    WHEN 29 THEN 1.0    -- 1 point per PAT made
    WHEN 30 THEN -0.5   -- -0.5 points per PAT missed

    -- Defense (from XML example)
    WHEN 31 THEN 0.0    -- Points allowed (handled by ranges)
    WHEN 32 THEN 1.0    -- 1 point per sack
    WHEN 33 THEN 2.0    -- 2 points per interception
    WHEN 34 THEN 2.0    -- 2 points per fumble recovery
    WHEN 35 THEN 6.0    -- 6 points per defensive TD
    WHEN 36 THEN 2.0    -- 2 points per safety
    WHEN 37 THEN 2.0    -- 2 points per blocked kick

    -- Points Allowed Ranges (from XML example)
    WHEN 50 THEN 10.0   -- 10 points for 0 points allowed
    WHEN 51 THEN 7.0    -- 7 points for 1-6 points allowed
    WHEN 52 THEN 4.0    -- 4 points for 7-13 points allowed
    WHEN 53 THEN 1.0    -- 1 point for 14-20 points allowed
    WHEN 54 THEN 0.0    -- 0 points for 21-27 points allowed
    WHEN 55 THEN -1.0   -- -1 point for 28-34 points allowed
    WHEN 56 THEN -4.0   -- -4 points for 35+ points allowed
    ELSE 0.0
  END as value
FROM leagues l
CROSS JOIN stat_definitions sd
WHERE sd.player_stats_column IS NOT NULL
ON CONFLICT (league_id, stat_id) DO NOTHING;
