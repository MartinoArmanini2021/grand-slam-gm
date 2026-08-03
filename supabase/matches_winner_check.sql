-- F4-5 — add the winner-in-pairing integrity constraint to the LIVE matches table.
-- Run once in the Supabase SQL Editor. Idempotent (drops any prior copy first).
--
-- WHY: public.matches.winner_id has no constraint today, so a corrupt ingest (a slot-shift
-- that attaches a stored winner to the wrong pairing, or a typo'd manual override) could
-- persist a winner_id that isn't either player — silently misscoring. This makes such a
-- write FAIL LOUDLY (the upsert errors, the board freezes at last-good rather than corrupts).
--
-- SAFE NOW: matches is empty (pre-play), so the constraint validates instantly. If you ever
-- run this with rows present and it errors, some existing row already violates it — inspect
-- with:  select * from public.matches where winner_id is not null and winner_id not in (p1_id, p2_id);

alter table public.matches drop constraint if exists matches_winner_in_pairing;
alter table public.matches
  add constraint matches_winner_in_pairing
  check (winner_id is null or winner_id in (p1_id, p2_id));
