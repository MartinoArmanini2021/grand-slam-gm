-- =====================================================================================================
-- Shanghai Masters 2026 — the round plan (the market's lock times)
-- Written 2026-09-24 for the Shanghai setup. public.round_plan feeds market_window_controller (pg_cron
-- job 17, every minute), which reads ONLY the active tournament's rows. Inserting these before the flip
-- changes nothing live: the active tournament is still usopen_2026 (frozen).
--
-- SCHEDULE (main draw 7–18 Oct 2026, Shanghai = UTC+8, no daylight saving). Round-by-date follows the
-- 2025 edition shifted six days (2025: R1 Wed–Thu, R2 Fri–Sat, R3 Sun–Mon, R4 Tue–Wed, QF Thu–Fri, SF Sat,
-- F Sun; LTA schedule) and matches the 2026 facts published so far (main draw 7–18 Oct; play ends on Fri
-- 16 Oct before an exhibition, i.e. a QF day). Our rounds: R64 = the second round (seeds' first match,
-- THE DRAFT LOCK), R32 = third round, R16 = fourth round.
--
-- EVERY TIME HERE IS AN EARLY FLOOR, NOT A CONFIRMED FIRST BALL. 03:00Z = 11:00 in Shanghai, the earliest
-- plausible start of a day session. Early is recoverable (the market closes a little sooner than it had
-- to); late is not (the market stays open during play). Pin each round from the published order of play
-- the evening before — per-MATCH men's singles times, never court-session starts — with an UPDATE:
--   update public.round_plan set first_ball = '<utc>', note = '<source>', updated_at = now()
--    where tournament_id = 'shanghai_2026' and round = '<R>';
--
-- R64 has no prev_round: the unscored opening round never reaches public.matches, so R64 becomes "ready"
-- only by the 6-hour valve. Its rows (written by the feed from draw day, with 'tbd' opponents) must ALSO
-- be stamped by hand at the flip, so the app can show the squad-lock countdown from draw day:
--   update public.matches m set started_at = p.first_ball
--     from public.round_plan p
--    where m.tournament_id = 'shanghai_2026' and m.round = 'R64'
--      and p.tournament_id = m.tournament_id and p.round = m.round;
-- =====================================================================================================

-- PRE-CHECK (read-only)
select (select count(*) from public.round_plan where tournament_id = 'shanghai_2026') as rows_now,   -- expect 0
       public.active_tournament_id() as active;                                                     -- expect usopen_2026

-- UP
begin;
insert into public.round_plan (tournament_id, round, slots, first_ball, prev_round, prev_slots, note) values
  ('shanghai_2026', 'R64', 32, '2026-10-09T03:00:00Z', null,  null, 'floor 11:00 Shanghai, Fri 9 Oct (2nd round, draft lock) — pin from the order of play'),
  ('shanghai_2026', 'R32', 16, '2026-10-11T03:00:00Z', 'R64', 32,   'floor 11:00 Shanghai, Sun 11 Oct (3rd round) — pin from the order of play'),
  ('shanghai_2026', 'R16',  8, '2026-10-13T03:00:00Z', 'R32', 16,   'floor 11:00 Shanghai, Tue 13 Oct (4th round) — pin from the order of play'),
  ('shanghai_2026', 'QF',   4, '2026-10-15T03:00:00Z', 'R16', 8,    'floor 11:00 Shanghai, Thu 15 Oct — pin from the order of play'),
  ('shanghai_2026', 'SF',   2, '2026-10-17T03:00:00Z', 'QF',  4,    'floor 11:00 Shanghai, Sat 17 Oct — pin from the order of play'),
  ('shanghai_2026', 'F',    1, '2026-10-18T06:00:00Z', 'SF',  2,    'floor 14:00 Shanghai, Sun 18 Oct (2025: singles final NB 16:30) — pin from the order of play');
commit;

-- VERIFY (read-only)
select round, slots, first_ball, first_ball at time zone 'Asia/Shanghai' as shanghai_local,
       first_ball at time zone 'Europe/Rome' as rome, prev_round, prev_slots
  from public.round_plan where tournament_id = 'shanghai_2026' order by first_ball;
select public.market_window_controller(true);   -- dry run: acts on the ACTIVE tournament only → no shanghai rows

-- ROLLBACK
-- delete from public.round_plan where tournament_id = 'shanghai_2026';
