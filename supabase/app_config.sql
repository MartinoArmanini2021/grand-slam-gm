-- ── Single source of truth: which tournament the live pipeline targets ──────────────────────────
-- Apply once in the Supabase SQL editor (idempotent). The ingest cron AND the scoring cron BOTH
-- read this one row, so they can never silently diverge — the "ingest writes Cincinnati but the
-- scorer scores Montréal → everyone's leaderboard breaks" footgun is gone. To move to the next
-- tournament you change ONE row (see docs/SWITCHING_TOURNAMENTS.md), not four hardcoded spots.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create table if not exists public.app_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

-- Seed the current tournament ONLY if it isn't already set — a re-run must never undo a switch.
insert into public.app_config (key, value) values ('active_tournament_id', 'montreal_2026')
on conflict (key) do nothing;

-- The helper the crons call each run. STABLE, with a hardcoded fallback so a missing/renamed row
-- can never break the pipeline. SECURITY DEFINER so the cron role can always read it.
create or replace function public.active_tournament_id() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select value from public.app_config where key = 'active_tournament_id'), 'montreal_2026');
$$;

-- Server-only config — never exposed to the app's anon/authenticated clients (the service role,
-- used by the edge functions, bypasses these grants).
revoke all on public.app_config from anon, authenticated;
revoke all on function public.active_tournament_id() from anon, authenticated;

-- ── TO SWITCH TOURNAMENTS LATER (the whole switch, one line) ──────────────────────────────────
--   update public.app_config set value = 'cincinnati_2026', updated_at = now() where key = 'active_tournament_id';
-- First redeploy ingest-draw built for that tournament's field + Wikipedia page (it refuses to
-- ingest a tournament it wasn't built for). Full procedure: docs/SWITCHING_TOURNAMENTS.md.
