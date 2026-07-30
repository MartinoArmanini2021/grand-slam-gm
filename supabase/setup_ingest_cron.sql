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
-- TO STOP IT (after the tournament):  select cron.unschedule('ingest-draw');
-- TO CHANGE THE TOURNAMENT: update the body's tournamentId AND the Edge Function's
--   TOURNAMENT_ID/WIKI_PAGE so they match ACTIVE_TOURNAMENT_ID in tournamentConfig.ts.
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
    body    := '{"tournamentId":"montreal_2026"}'::jsonb
  );
  $$
);

-- Verify it registered:  select jobname, schedule, active from cron.job;
-- Force one run now (also a good smoke test after deploy):
--   select net.http_post(
--     url := 'https://mrdmlfumdsxufifjulbt.supabase.co/functions/v1/ingest-draw',
--     headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <SERVICE_ROLE_KEY>'),
--     body := '{"tournamentId":"montreal_2026"}'::jsonb );
