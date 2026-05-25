-- Enable Row-Level Security on all public tables.
--
-- No policies are created — this is intentionally a deny-all configuration.
-- All application access happens via the service role (edge functions + Fly VM),
-- which bypasses RLS. The Chrome extension only talks to edge functions and
-- never queries tables directly, so denying anon/authenticated access has no
-- effect on the legitimate access path.

ALTER TABLE public.user_profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leagues                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roster_entry             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_stats             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_injuries          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_calcs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_roster_positions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_stat_modifiers    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_initialization    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nfl_matchups             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.defense_points_against   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_offensive_stats     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waiver_wire              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stat_definitions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_logs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_history              ENABLE ROW LEVEL SECURITY;
