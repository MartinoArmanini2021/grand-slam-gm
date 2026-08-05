-- ── One-time R64 correction: honor each manager's shown captain/vice ──────────
-- A round's captain/vice freeze at its first result. Several managers set (or their client
-- shows) a captain/vice that never got committed to R64 history, so the multiplier they SEE on
-- court wasn't scoring. Per the league owner's decision, we commit each manager's current
-- captain/vice as their R64 leaders so the shown multiplier actually counts, then recompute.
-- Run ONCE in the Supabase SQL editor. rev/updated_at are bumped so every client re-syncs to
-- the corrected state (clears the on-screen "phantom" leaders).

-- 1) Commit the current captain as the R64 captain where it isn't already recorded.
update public.entries e
set state = jsonb_set(e.state, '{captainHistory}',
      coalesce(e.state->'captainHistory','[]'::jsonb) || jsonb_build_object('round','R64','playerId', e.state->>'captain')),
    rev = rev + 1, updated_at = now()
where e.tournament_id = 'montreal_2026'
  and coalesce(e.state->>'captain','') <> ''
  and not exists (select 1 from jsonb_array_elements(coalesce(e.state->'captainHistory','[]'::jsonb)) c where c->>'round' = 'R64');

-- 2) Commit the current vice-captain as the R64 vice where it isn't already recorded.
update public.entries e
set state = jsonb_set(e.state, '{viceCaptainHistory}',
      coalesce(e.state->'viceCaptainHistory','[]'::jsonb) || jsonb_build_object('round','R64','playerId', e.state->>'viceCaptain')),
    rev = rev + 1, updated_at = now()
where e.tournament_id = 'montreal_2026'
  and coalesce(e.state->>'viceCaptain','') <> ''
  and not exists (select 1 from jsonb_array_elements(coalesce(e.state->'viceCaptainHistory','[]'::jsonb)) c where c->>'round' = 'R64');

-- 3) marmanini's de Minaur vice was set on-court but never reached the cloud (their current
--    vice is null; captain='cilic' uniquely identifies the entry). Record it as their R64 vice.
update public.entries e
set state = jsonb_set(
      jsonb_set(e.state, '{viceCaptain}', '"deminaur"'::jsonb),
      '{viceCaptainHistory}',
      coalesce(e.state->'viceCaptainHistory','[]'::jsonb) || jsonb_build_object('round','R64','playerId','deminaur')),
    rev = rev + 1, updated_at = now()
where e.tournament_id = 'montreal_2026'
  and e.state->>'captain' = 'cilic'
  and not exists (select 1 from jsonb_array_elements(coalesce(e.state->'viceCaptainHistory','[]'::jsonb)) c where c->>'round' = 'R64');
