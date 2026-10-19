-- =====================================================================================================
-- paris_2026 — the round plan (the market's lock times). Generated 2026-10-19 by scripts/round-plan.mjs from
-- scripts/schedules/paris_2026.json. NOT APPLIED: apply on Martino's word. Inserting before the flip changes
-- nothing live: market_window_controller reads only the ACTIVE tournament's rows.
--
--   R32  2026-11-03 11:00 Europe/Paris     = 2026-11-03T10:00Z = Tue 3 Nov, 11:00 Rome
--   R16  2026-11-05 11:00 Europe/Paris     = 2026-11-05T10:00Z = Thu 5 Nov, 11:00 Rome
--   QF   2026-11-06 11:00 Europe/Paris     = 2026-11-06T10:00Z = Fri 6 Nov, 11:00 Rome
--   SF   2026-11-07 13:00 Europe/Paris     = 2026-11-07T12:00Z = Sat 7 Nov, 13:00 Rome
--   F    2026-11-08 14:00 Europe/Paris     = 2026-11-08T13:00Z = Sun 8 Nov, 14:00 Rome
--
-- Times marked "floor" are the earliest plausible first ball, not a confirmed one: early is recoverable
-- (the market closes a little sooner), late is not (the market stays open during play). Pin each round
-- from the published order of play the evening before:
--   node scripts/round-plan.mjs paris_2026 --pin <ROUND> "<YYYY-MM-DD HH:MM local>" "<source>"
-- and only re-time a round that has not begun.
--
-- R32 has no prev_round, so it becomes ready only through the 6-hour valve; its rows (written by
-- the feed from draw day) are stamped by hand at the flip so the app shows the squad-lock countdown:
--   update public.matches m set started_at = p.first_ball from public.round_plan p
--    where m.tournament_id = 'paris_2026' and m.round = 'R32'
--      and p.tournament_id = m.tournament_id and p.round = m.round;
-- =====================================================================================================

-- PRE-CHECK (read-only)
select (select count(*) from public.round_plan where tournament_id = 'paris_2026') as rows_now,   -- expect 0
       public.active_tournament_id() as active;

-- UP
begin;
insert into public.round_plan (tournament_id, round, slots, first_ball, prev_round, prev_slots, note) values
  ('paris_2026', 'R32', 16, '2026-11-03T10:00:00Z', null, null, 'floor 2026-11-03 11:00 Europe/Paris (2nd round, the seeds'' first match: DRAFT LOCK) — pin from the order of play'),
  ('paris_2026', 'R16',  8, '2026-11-05T10:00:00Z', 'R32', 16, 'floor 2026-11-05 11:00 Europe/Paris (3rd round) — pin from the order of play'),
  ('paris_2026', 'QF',  4, '2026-11-06T10:00:00Z', 'R16', 8, 'floor 2026-11-06 11:00 Europe/Paris — pin from the order of play'),
  ('paris_2026', 'SF',  2, '2026-11-07T12:00:00Z', 'QF', 4, 'floor 2026-11-07 13:00 Europe/Paris — pin from the order of play'),
  ('paris_2026', 'F',  1, '2026-11-08T13:00:00Z', 'SF', 2, 'floor 2026-11-08 14:00 Europe/Paris — pin from the order of play');
commit;

-- VERIFY (read-only)
select round, slots, first_ball, first_ball at time zone 'Europe/Paris' as local, first_ball at time zone 'Europe/Rome' as rome,
       prev_round, prev_slots
  from public.round_plan where tournament_id = 'paris_2026' order by first_ball;
select * from public.round_plan_health('paris_2026');

-- ROLLBACK
-- delete from public.round_plan where tournament_id = 'paris_2026';
