-- ── Job 20 — running the market off the clock ────────────────────────────────────────────────────
--
-- Applied to production 2026-08-26 as two migrations:
--   job20_matches_started_at              — adds public.matches.started_at (nullable timestamptz)
--   job20_save_entry_schedule_aware_freeze — every save_entry freeze now asks "has this round
--                                            BEGUN?" (a result exists OR a stamped start has
--                                            passed) instead of "does it have a result?"
-- Rollback for the second: supabase/job16_save_entry_hardening.sql (the immediately-prior body).
--
-- WHY. A round only counted as in play once some match in it had a WINNER. Between the first ball
-- and the first completed match — often two or three hours — the market stayed open: transfers and
-- armband changes were still accepted while the round was being played. The client engine was
-- written for a schedule all along (roundState/liveRound/draftLocked read started_at) but the
-- column did not exist, so that branch was dead and the results-based fallback ran.
--
-- SAFE WHEN NULL. An unstamped row leaves every reader on the old results-based behaviour, so
-- nothing changed the moment the column appeared. Behaviour shifts for a round only once its start
-- time is written. That also means: FORGETTING to stamp degrades to exactly today's behaviour,
-- never to something worse.
--
-- VERIFIED (in rolled-back transactions, against a synthetic draw):
--   · round scheduled 2h ahead, no results  → drafting still ACCEPTED
--   · same round started 1h ago, no results → 'The tournament has started — the draft is closed'
--   · captain set for a round under way     → 'Cannot change your R64 captain — that round has
--                                              already started'
--   The middle case is the whole point: under the old rule that save went through.

-- ── THE DAILY OPS ACTION ─────────────────────────────────────────────────────────────────────────
-- A Slam publishes its order of play the evening before. Stamp each round as its date is known —
-- roughly two minutes a day. Times are UTC; the US Open plays in New York (UTC-4 in late August),
-- so an 11:00 local start is 15:00 UTC.
--
-- Stamp a whole round at once (the round counts as live from the EARLIEST start among its matches,
-- so one time for the round is enough — per-match precision is optional):
--
--   update public.matches
--      set started_at = timestamptz '2026-08-31 15:00+00'
--    where tournament_id = 'usopen_2026' and round = 'R128';
--
-- Stamp several rounds in one go, once the schedule is published:
--
--   update public.matches m set started_at = s.starts_at
--     from (values
--       ('R128', timestamptz '2026-08-31 15:00+00'),
--       ('R64',  timestamptz '2026-09-02 15:00+00'),
--       ('R32',  timestamptz '2026-09-04 15:00+00'),
--       ('R16',  timestamptz '2026-09-06 15:00+00'),
--       ('QF',   timestamptz '2026-09-08 15:00+00'),
--       ('SF',   timestamptz '2026-09-11 15:00+00'),
--       ('F',    timestamptz '2026-09-13 18:00+00')
--     ) as s(round, starts_at)
--    where m.tournament_id = 'usopen_2026' and m.round = s.round;
--
-- ⚠️ Only ever stamp a round whose start you actually know. A start time in the past closes the
--    market immediately for that round; a wrong one closes it early, which is worse than leaving
--    the column null and falling back to results.
--
-- CORRECTING a mistake is just another update — or clear it and fall back:
--   update public.matches set started_at = null
--    where tournament_id = 'usopen_2026' and round = 'R128';

-- ── VERIFY AFTER STAMPING ────────────────────────────────────────────────────────────────────────
-- What the app will conclude, round by round: whether it is live now, and when it opens.
select round,
       count(*)                                             as matches,
       count(winner_id)                                     as decided,
       min(started_at)                                      as round_starts,
       (min(started_at) is not null and min(started_at) <= now()) as started_by_clock,
       bool_or(winner_id is not null)                       as started_by_result,
       case
         when bool_and(winner_id is not null)                                    then 'done'
         when bool_or(winner_id is not null)
           or (min(started_at) is not null and min(started_at) <= now())         then 'LIVE — market shut'
         else 'pending — market open'
       end                                                  as state
  from public.matches
 where tournament_id = 'usopen_2026'
 group by round
 order by array_position(array['R128','R64','R32','R16','QF','SF','F'], round);
