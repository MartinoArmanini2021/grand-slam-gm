-- ── get_active_tournament(): the client's one key to the one drawer ─────────────────────────────
--
-- APPLIED TO PRODUCTION 2026-08-22 (migration: get_active_tournament_readable).
--
-- Why this exists. app_config has RLS enabled with ZERO policies — deny-all to anon and
-- authenticated. That is deliberate and stays: the table is operator config, and clients have no
-- business reading it wholesale. But multi-tournament (Job 1) needs the app to answer one
-- question at boot: "which tournament is on right now?" — without a hardcoded TOURNAMENT_ID.
--
-- So: a SECURITY DEFINER function that returns ONLY the active_tournament_id value. If app_config
-- ever grows other keys (it held a cron secret once, before Vault), they remain invisible — the
-- WHERE clause is the exposure boundary, not the table grant.
--
-- Verified after apply:
--   POST /rest/v1/rpc/get_active_tournament (anon)  → 200 "cincinnati_2026"
--   GET  /rest/v1/app_config?select=* (anon)        → 401 permission denied  (unchanged)
--
-- ROLLBACK: drop function public.get_active_tournament();

create or replace function public.get_active_tournament()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select value from public.app_config where key = 'active_tournament_id';
$$;

revoke all on function public.get_active_tournament() from public;
grant execute on function public.get_active_tournament() to anon, authenticated;
