-- ── tournament_fields: the "album shelf" (Job 3) ────────────────────────────────────────────────
-- APPLIED TO PRODUCTION 2026-08-23 (migration: tournament_fields_shelf), then loaded with the
-- Cincinnati field in 4 chunks via the management API and verified: anon REST read returns all 96
-- players deep-equal to supabase/fields/cincinnati_2026.app.json; anon INSERT → 401.
--
-- One row per tournament holding the APP-shaped player field (names, flags, headshot ids, form —
-- what player_stats doesn't carry). The Lovable app fetches this at runtime with its bundled
-- Cincinnati file as fallback, so adding a tournament stops requiring an app deploy.
-- Design note: a TABLE, not a Storage bucket — no service key exists locally, rows load fine over
-- the management API, and the client already speaks PostgREST. Adding an event (Job 8) = insert a
-- row here + seed player_stats + point ingest-draw at the draw page + flip active_tournament_id.
create table if not exists public.tournament_fields (
  tournament_id text primary key,
  field         jsonb not null,
  updated_at    timestamptz not null default now()
);
alter table public.tournament_fields enable row level security;
create policy "tournament_fields readable"
  on public.tournament_fields for select
  to anon, authenticated
  using (true);
