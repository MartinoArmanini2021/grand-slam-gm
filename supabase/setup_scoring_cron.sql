-- ─────────────────────────────────────────────────────────────────────────────
-- TURN ON AUTHORITATIVE (anti-cheat) SCORING for the live tournament.
--
-- WHAT THIS DOES: every 3 minutes, Supabase calls the `recompute-score` Edge
-- Function, which recomputes every manager's score from the OFFICIAL results in
-- public.matches (the only trusted source) and writes public.entries.score. Clients
-- can never write that column, so the leaderboard can't be faked.
--
-- WHEN TO RUN THIS: once, when the tournament goes live (results start landing). It's
-- harmless to run earlier — with no results it just writes 0s — but there's no point
-- until matches exist.
--
-- HOW TO RUN IT:
--   1. Supabase dashboard → SQL Editor → New query.
--   2. Paste this whole file.
--   3. Replace <SERVICE_ROLE_KEY> below with your service-role key
--      (dashboard → Project Settings → API → service_role secret). Keep it secret —
--      it's only ever used here, server-side; never put it in the app.
--   4. Run.
--
-- TO STOP IT (after the tournament): select cron.unschedule('recompute-scores');
-- TO CHANGE THE TOURNAMENT: update the body's tournamentId AND the Edge Function's
--   default (supabase/functions/recompute-score/index.ts) so they always match
--   ACTIVE_TOURNAMENT_ID in src/data/tournamentConfig.ts.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Re-runnable: drop any prior schedule of the same name first.
select cron.unschedule('recompute-scores')
where exists (select 1 from cron.job where jobname = 'recompute-scores');

select cron.schedule(
  'recompute-scores',
  '*/3 * * * *',                    -- every 3 minutes
  $$
  select net.http_post(
    url     := 'https://mrdmlfumdsxufifjulbt.supabase.co/functions/v1/recompute-score',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    -- Explicit id (do NOT rely on the function default) so scoring always targets the
    -- active tournament even if the default drifts.
    body    := '{"tournamentId":"montreal_2026"}'::jsonb
  );
  $$
);

-- Verify it registered:  select jobname, schedule, active from cron.job;
-- Force one run now:      select net.http_post( ... );  -- (same call as above)
