-- ─────────────────────────────────────────────────────────────────────────────
-- TURN ON AUTHORITATIVE (anti-cheat) SCORING for the live tournament.
--
-- WHAT THIS DOES: every minute, Supabase calls the `recompute-score` Edge
-- Function, which recomputes every manager's score from the OFFICIAL results in
-- public.matches (the only trusted source) and writes public.entries.score. Clients
-- can never write that column, so the leaderboard can't be faked.
--
-- WHEN TO RUN THIS: once, when the tournament goes live (results start landing). It's
-- harmless to run earlier — with no results it just writes 0s — but there's no point
-- until matches exist.
--
-- HOW TO RUN IT:
--   0. ⚠️ PREREQUISITES (once): run supabase/app_config.sql, then supabase/vault_setup.sql (stores
--      your service_role key in Vault). After that there's NO key to paste here — the cron reads it
--      from Vault by name, so it can never be mis-pasted (the silent freeze we hit).
--   1. Supabase dashboard → SQL Editor → New query.
--   2. Paste this whole file and Run. (No placeholder to edit.)
--
-- ⚠️ PREREQUISITE: run supabase/app_config.sql first (this body calls active_tournament_id()).
-- TO STOP IT (after the tournament): select cron.unschedule('recompute-scores');
-- TO CHANGE THE TOURNAMENT: you no longer edit this file — just update the ONE app_config row
--   (see supabase/app_config.sql / docs/SWITCHING_TOURNAMENTS.md). This cron reads it every run.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Re-runnable: drop any prior schedule of the same name first.
select cron.unschedule('recompute-scores')
where exists (select 1 from cron.job where jobname = 'recompute-scores');

select cron.schedule(
  'recompute-scores',
  '* * * * *',                      -- every minute (keeps the leaderboard close to the live score)
  $$
  select net.http_post(
    url     := 'https://mrdmlfumdsxufifjulbt.supabase.co/functions/v1/recompute-score',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      -- Key read from Vault (supabase/vault_setup.sql) — no placeholder to mis-paste, ever.
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'gsgm_service_role_key')
    ),
    -- Single source of truth: the active tournament comes from public.app_config, so this cron
    -- and the ingest cron can never target different tournaments (see supabase/app_config.sql).
    body    := jsonb_build_object('tournamentId', public.active_tournament_id())
  );
  $$
);

-- Verify it registered:  select jobname, schedule, active from cron.job;
-- Force one run now:      select net.http_post( ... );  -- (same call as above)
