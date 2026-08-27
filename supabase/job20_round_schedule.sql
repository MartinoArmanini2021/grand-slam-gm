-- ── Round start times for usopen_2026 ────────────────────────────────────────────────────────────
--
-- Stamping a round's start is what LOCKS the market, the draft and the armband for that round
-- (Job 20 / "Clock Lock"). An unstamped round falls back to "has a result yet?", which is the old
-- behaviour and leaves the market open for the first hour or two of play.
--
-- ⚠ THE DATE. The 2026 US Open starts SUNDAY 30 AUGUST, not Monday the 31st. The tournament runs
--   August 30 – September 13 (its own infobox), and 2026-08-30 is a Sunday. The event moved to a
--   15-day format with a Sunday start. I had Monday in my head all through 27 Aug planning, and a
--   Monday stamp would have left the market OPEN through the whole of Sunday's first round —
--   managers free to swap players after seeing results. Check the day, not your memory.
--
-- First ball is 11:00 New York = 15:00 UTC.
--
-- Stamp it AHEAD of time. A future timestamp locks nothing until it passes, so this is safe to run
-- the moment the draw is ingested — and it means the lock happens on its own instead of depending
-- on someone remembering to run this on the day.

update public.matches
   set started_at = timestamptz '2026-08-30 15:00+00'
 where tournament_id = 'usopen_2026'
   and round = 'R128';

-- Verify: what the app now concludes for each round.
select round,
       count(*)                                             as matches,
       count(*) filter (where winner_id is not null)        as decided,
       min(started_at)                                      as starts,
       (min(started_at) <= now())                           as under_way
  from public.matches
 where tournament_id = 'usopen_2026'
 group by round
 order by min(slot);
