-- Add normalized recent stats fields to league_calcs
alter table league_calcs
  add column if not exists recent_mean_norm numeric,
  add column if not exists recent_std_norm numeric;


