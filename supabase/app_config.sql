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

-- The helper the crons call each run. STABLE; SECURITY DEFINER so the cron role can always read it.
--
-- NO HARDCODED FALLBACK, deliberately — this used to end `, 'montreal_2026')`, described as "a
-- fallback so a missing/renamed row can never break the pipeline". It did not keep the pipeline
-- working; it kept it silently pointed at a dead event. If the config row were ever deleted or
-- renamed, both crons would have started operating on Montréal: ingest-draw carries Montréal in its
-- registry, so it would have cheerfully re-scraped a finished draw and rewritten public.matches,
-- while recompute-score rescored Montréal's entries against a player table that no longer holds its
-- rows — every ranking resolving to the `?? 40` default, so every upset bonus in a FINISHED event
-- silently erased. Cincinnati, meanwhile, would simply stop being scored. And the watchdog would
-- have said nothing, because it calls this same function: it would have checked Montréal's health
-- rows, found them freshly updated by the very runs doing the damage, and reported all clear.
--
-- Returning NULL makes every path loud instead:
--   • the ingest cron posts tournamentId: null -> ingest-draw answers 400 and writes ok=false ->
--     the watchdog alerts (it reads `ok` as of 2026-08-18, not just freshness)
--   • the scoring cron posts null -> recompute-score reads app_config directly, finds nothing, and
--     throws -> it writes scoring_health only on success, so last_run_at goes stale -> alert
--   • the watchdog itself gets null -> matches no health row -> "last ran never" -> alert
-- This is fix 1.4 applied to the SQL layer: nothing may guess which tournament you meant.
create or replace function public.active_tournament_id() returns text
language sql stable security definer set search_path = public as $$
  select value from public.app_config where key = 'active_tournament_id';
$$;

-- Server-only config — never exposed to the app's anon/authenticated clients (the service role,
-- used by the edge functions, bypasses these grants).
revoke all on public.app_config from anon, authenticated;
revoke all on function public.active_tournament_id() from anon, authenticated;

-- ── TO SWITCH TOURNAMENTS LATER (the whole switch, one line) ──────────────────────────────────
--   update public.app_config set value = 'cincinnati_2026', updated_at = now() where key = 'active_tournament_id';
-- First redeploy ingest-draw built for that tournament's field + Wikipedia page (it refuses to
-- ingest a tournament it wasn't built for). Full procedure: docs/SWITCHING_TOURNAMENTS.md.
