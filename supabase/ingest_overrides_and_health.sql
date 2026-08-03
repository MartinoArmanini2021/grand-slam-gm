-- F4-4 + F4-2 — durable manual overrides + a queryable ingest-health signal.
-- Run once in the Supabase SQL Editor (idempotent). Then redeploy ingest-draw.
--
-- Both tables are written ONLY by the service-role ingest function (writes are revoked from
-- clients). ingest_health is readable by everyone (non-PII operational data); match_overrides
-- is service-role only (a human sets an override by POSTing it to the ingest function, which
-- persists it here — it is not a client-writable table).

-- ── F4-4: durable overrides ───────────────────────────────────────────────────
-- A human-verified result correction. ingest-draw reads this EVERY run and applies it with
-- top precedence, so a correction survives future cron cycles (previously it lived only in
-- the request body and reverted on the next poll). A correction is set by invoking ingest
-- with { "overrides": [ { "round":"QF","slot":0,"winnerId":"shelton" } ] }; cleared with
-- { "clearOverrides": [ { "round":"QF","slot":0 } ] } (or a manual delete here).
create table if not exists public.match_overrides (
  tournament_id text not null,
  round         text not null,
  slot          int  not null,
  winner_id     text not null,
  set_at        timestamptz not null default now(),
  primary key (tournament_id, round, slot)
);
alter table public.match_overrides enable row level security;
revoke all on public.match_overrides from anon, authenticated; -- service-role (ingest) only

-- ── F4-2: ingest health ───────────────────────────────────────────────────────
-- One row per tournament, upserted on EVERY ingest run (success AND failure). Makes a silent
-- freeze visible: watch `ok`, `last_run_at`, and `drafted_missing` (a drafted player whose
-- Wikipedia name stopped matching → they'd silently never score).
--   Watch it with:  select * from public.ingest_health;
create table if not exists public.ingest_health (
  tournament_id         text primary key,
  last_run_at           timestamptz not null default now(),
  ok                    boolean,
  pairings              int,
  results_known         int,
  matches_written       int,
  drafted_missing_count int,
  drafted_missing       jsonb,
  error                 text
);
alter table public.ingest_health enable row level security;
-- Non-sensitive operational data — readable by anyone (e.g. an admin health banner), but
-- only the service-role ingest writes it.
drop policy if exists "ingest_health readable" on public.ingest_health;
create policy "ingest_health readable" on public.ingest_health for select to anon, authenticated using (true);
grant select on public.ingest_health to anon, authenticated;
