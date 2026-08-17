-- ── One-off repair: restore a captain/vice of record that was never written ──────────────────────
-- WHY: locking a squad stamped the captain against a hardcoded R64. A round counts as STARTED at
-- its scheduled time, but the draft only closes on the first RESULT — so a manager who locked in
-- that window had the stamp silently refused and ended up with an EMPTY captainHistory. Empty is
-- worse than late: leaderOfRecord carries a captain forward from the most recent EARLIER entry, so
-- with no entry at all they get no multiplier for the whole event. Fixed in the client (commit
-- b400ce1, stamps liveLeaderRound()), but that cannot retro-write a round already played.
--
-- Cincinnati manager 0f7892be had captain=zverev and vice=cobolli chosen in the UI and both
-- histories empty. Both were in the locked squad and both WON their R64 match:
--   zverev (rank 3) beat norrie (35) · cobolli (10) beat kecmanovic (66)
-- Both favourites, so R64 base 1 point each, no upset multiplier. They were scored 1 + 1 = 2.
-- With the armbands they are 1x2 + 1x1.5 = 3.5. Expected delta +1.5 (score 10 -> 11.5).
--
-- Deliberately a direct UPDATE, not save_entry(): the RPC refuses a captain change for a round that
-- already has a result (P6, correctly — it stops managers picking winners after the fact). This is
-- an owner-side correction of the app's own bug, so it bypasses that guard on purpose.
--
-- rev is bumped so any open client converges on this copy instead of overwriting it with its own
-- empty history on the next save (a stale save now fails the rev guard with 40001 and re-reads).
-- Ask the manager to reload the app afterwards.
--
-- recompute-score picks it up within ~3 minutes; no redeploy needed.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────

begin;

-- 1) BEFORE — confirm the state this repair assumes. Expect captainHistory/viceCaptainHistory []
--    and both players present in initialSquad.
select user_id, score,
       state->'captain'            as captain_ui,
       state->'viceCaptain'        as vice_ui,
       state->'captainHistory'     as captain_history,
       state->'viceCaptainHistory' as vice_history
from public.entries
where tournament_id = 'cincinnati_2026'
  and user_id = '0f7892be-a038-494c-ab5a-e4484c221ec7';

-- 2) THE REPAIR. Appends only — it will not disturb any later round the manager has since set.
--    Guarded on the history being empty, so re-running this file cannot double-append.
update public.entries
   set state = jsonb_set(
                 jsonb_set(state,
                   '{captainHistory}',
                   coalesce(state->'captainHistory', '[]'::jsonb) || '[{"round":"R64","playerId":"zverev"}]'::jsonb),
                 '{viceCaptainHistory}',
                   coalesce(state->'viceCaptainHistory', '[]'::jsonb) || '[{"round":"R64","playerId":"cobolli"}]'::jsonb),
       rev = coalesce(rev, 0) + 1
 where tournament_id = 'cincinnati_2026'
   and user_id = '0f7892be-a038-494c-ab5a-e4484c221ec7'
   and coalesce(jsonb_array_length(state->'captainHistory'), 0) = 0;   -- idempotent

-- 3) AFTER — the two histories should now each hold exactly one R64 entry.
select user_id, score,
       state->'captainHistory'     as captain_history,
       state->'viceCaptainHistory' as vice_history
from public.entries
where tournament_id = 'cincinnati_2026'
  and user_id = '0f7892be-a038-494c-ab5a-e4484c221ec7';

commit;

-- 4) Then wait ~3 min for recompute-score, and check the new total (expect 11.5, up 1.5):
--    select user_id, score from public.entries
--     where tournament_id = 'cincinnati_2026'
--       and user_id = '0f7892be-a038-494c-ab5a-e4484c221ec7';
