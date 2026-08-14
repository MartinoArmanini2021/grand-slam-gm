-- ── Make scoring_health readable the same way ingest_health is ──────────────────────────────────
-- Found 2026-08-14: `ingest_health` returns rows to the anon key but `scoring_health` returns an
-- empty array — so the pipeline can only be half-checked from outside the database (the nightly
-- verifier and any ad-hoc REST check see ingest, never scoring).
--
-- This does NOT affect alerting: pipeline_watchdog() is SECURITY DEFINER and reads the table from
-- inside Postgres, so it has always seen the rows. This is purely about outside visibility.
--
-- Both tables hold non-PII heartbeats (a timestamp, a boolean, a count, an error string), which is
-- why they're safe to expose read-only — same posture as public.matches.
--
-- Idempotent; run in the Supabase SQL editor.

alter table public.scoring_health enable row level security;

drop policy if exists "scoring_health is publicly readable" on public.scoring_health;
create policy "scoring_health is publicly readable"
  on public.scoring_health for select using (true);

grant select on public.scoring_health to anon, authenticated;

-- Writes stay closed to clients: only the recompute-score edge function (service_role, which
-- bypasses RLS) ever upserts a heartbeat.
revoke insert, update, delete on public.scoring_health from anon, authenticated;

-- Verify — should return one row per tournament, matching what the SQL editor sees:
--   select * from public.scoring_health;
-- And from outside (anon REST) it should no longer come back as [].
