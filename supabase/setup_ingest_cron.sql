-- ─────────────────────────────────────────────────────────────────────────────
-- TURN ON THE AUTOMATED RESULTS FEED for the live tournament.
--
-- WHAT THIS DOES: every 5 minutes, Supabase calls the `ingest-draw` Edge Function,
-- which fetches the Wikipedia men's-singles draw, parses it, and writes the results into
-- public.matches. The `recompute-score` cron (setup_scoring_cron.sql) then turns those
-- matches into everyone's leaderboard score. Together they are the full live pipeline:
--   ingest-draw (Wikipedia → matches)  →  recompute-score (matches → entries.score)
--
-- WHEN TO RUN THIS: once, when the draw publishes (≈31 Jul). Harmless earlier — with no
-- draw it just writes nothing. Run setup_scoring_cron.sql too (you already have).
--
-- HOW TO RUN IT (same as the scoring cron you already applied):
--   1. Deploy the function first:  supabase functions deploy ingest-draw
--   2. Supabase dashboard → SQL Editor → New query.
--   3. Paste this whole file; replace <SERVICE_ROLE_KEY> with your service-role key
--      (Project Settings → API → service_role secret). Keep it secret — server-side only.
--   4. Run.
--
-- ⚠️ PREREQUISITE: run supabase/app_config.sql first (this body calls active_tournament_id()).
-- TO STOP IT (after the tournament):  select cron.unschedule('ingest-draw');
-- TO CHANGE THE TOURNAMENT: update the ONE app_config row (see supabase/app_config.sql). This cron
--   reads it every run. You still redeploy ingest-draw built for the new tournament's field +
--   Wikipedia page — and it now REFUSES to ingest a tournament it wasn't built for, so a mismatch
--   is a loud error in ingest_health, never silent corruption. Full steps: docs/SWITCHING_TOURNAMENTS.md.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Re-runnable: drop any prior schedule of the same name first.
select cron.unschedule('ingest-draw')
where exists (select 1 from cron.job where jobname = 'ingest-draw');

select cron.schedule(
  'ingest-draw',
  '*/5 * * * *',                    -- every 5 minutes (Wikipedia trails a result by a few min)
  $$
  select net.http_post(
    url     := 'https://mrdmlfumdsxufifjulbt.supabase.co/functions/v1/ingest-draw',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    -- Single source of truth: the active tournament comes from public.app_config (see app_config.sql).
    body    := jsonb_build_object('tournamentId', public.active_tournament_id())
  );
  $$
);

-- Verify it registered:  select jobname, schedule, active from cron.job;
-- Force one run now (also a good smoke test after deploy):
--   select net.http_post(
--     url := 'https://mrdmlfumdsxufifjulbt.supabase.co/functions/v1/ingest-draw',
--     headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <SERVICE_ROLE_KEY>'),
--     body := jsonb_build_object('tournamentId', public.active_tournament_id()) );
