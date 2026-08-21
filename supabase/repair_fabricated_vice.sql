-- ── Repair: remove a vice-captain entry the APP wrote, not the manager ──────────────────────────
--
-- Manager e3a43da2 (Cincinnati 2026) has viceCaptainHistory:
--     [{R64, cobolli}, {R32, mensik}, {QF, cobolli}]
-- The R32 Mensik entry was never their choice. `continueToNextRound` called
--     pickLeaders(myTeam, null, null, revealed)
-- which discarded their armbands, reassigned the two highest-ranked survivors, and committed the
-- result to history. Mensik had just arrived in the squad as the replacement for their
-- transferred-out captain Shelton, which is why he was top of that list.
--
-- The entry then carried forward into the Round of 16 and cost them Cobolli's ×1.5 — the same
-- Cobolli win that paid manager 0f7892be 7.5 paid them 5.
--
-- Effect of this repair: their R16 vice of record reverts to Cobolli (carried from their real R64
-- pick). Score 30.5 -> 33. The R32 total is unchanged (the ×1.5 simply moves from Mensik back to
-- Cobolli, both of whom won 2-point matches). League position is unchanged (3rd of 4 scoring).
--
-- Nothing else is touched: no other manager has an entry with this signature, and no scoring
-- function, RLS policy or grant is modified. This is a data correction only.
--
-- RUN THE VERIFY BLOCK FIRST. It shows the before/after without writing anything.

-- ── 1. VERIFY (read-only) ───────────────────────────────────────────────────────────────────────
select
  user_id,
  score                                            as score_now,
  state->'viceCaptainHistory'                      as vice_now,
  (select jsonb_agg(e) from jsonb_array_elements(state->'viceCaptainHistory') e
     where e->>'round' <> 'R32')                   as vice_after
from public.entries
where tournament_id = 'cincinnati_2026'
  and user_id = 'e3a43da2-d991-4594-b991-1fae551b4199';

-- ── 2. APPLY ────────────────────────────────────────────────────────────────────────────────────
-- Guarded on the exact current value, so it is a no-op if the history has changed since this was
-- written (the manager may have set a new armband in the meantime). Re-run the verify block if
-- this reports 0 rows.
update public.entries
set state = jsonb_set(
      state,
      '{viceCaptainHistory}',
      coalesce(
        (select jsonb_agg(e) from jsonb_array_elements(state->'viceCaptainHistory') e
           where e->>'round' <> 'R32'),
        '[]'::jsonb)
    )
where tournament_id = 'cincinnati_2026'
  and user_id = 'e3a43da2-d991-4594-b991-1fae551b4199'
  and state->'viceCaptainHistory' @> '[{"round":"R32","playerId":"mensik"}]'::jsonb;

-- ── 3. RESCORE ──────────────────────────────────────────────────────────────────────────────────
-- entries.score is service-role-only and is NOT written here. Trigger the authoritative scorer:
--     npx supabase functions invoke recompute-score --no-verify-jwt
-- then confirm independently, which recomputes every entry from the public feeds:
--     node scripts/verify-scores.mjs --detail
-- Expected afterwards: e3a43da2 = 33, with "R16 cobolli 5 ×1.5 (vice) = 7.5".

-- ── ROLLBACK ────────────────────────────────────────────────────────────────────────────────────
-- Restores the entry exactly as it was, then rescore again as in step 3.
--
-- update public.entries
-- set state = jsonb_set(state, '{viceCaptainHistory}',
--       '[{"round":"R64","playerId":"cobolli"},{"round":"R32","playerId":"mensik"},{"round":"QF","playerId":"cobolli"}]'::jsonb)
-- where tournament_id = 'cincinnati_2026'
--   and user_id = 'e3a43da2-d991-4594-b991-1fae551b4199';
