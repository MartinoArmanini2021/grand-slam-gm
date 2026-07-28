-- ── Server-authoritative scoring (W5) ────────────────────────────────────────
-- The client saves its squad (entries.state) but must NOT be trusted for the
-- leaderboard number. This migration:
--   1. adds public.matches   — the draw + results the server holds (fed by the
--      live feed / admin console); the source of truth for who won each match.
--   2. adds public.player_stats — ATP ranks used by the scoring multiplier/upset.
--   3. locks entries.score  — a trigger pins it so only the service role (the
--      `recompute-score` Edge Function) can change it; clients may still update
--      their squad state/budget.
--
-- Run this in the Supabase SQL editor, then deploy + invoke the function
-- (see docs/GO_LIVE.md → "Server-authoritative scoring").

-- 1) Results the server holds (round + slot → winner). Everyone can read; only the
--    service role (feed/admin) writes (no INSERT/UPDATE policy = clients can't).
create table if not exists public.matches (
  tournament_id text not null,
  round         text not null,
  slot          int  not null,
  p1_id         text not null,
  p2_id         text not null,
  winner_id     text,
  primary key (tournament_id, round, slot)
);
alter table public.matches enable row level security;
drop policy if exists "matches readable" on public.matches;
create policy "matches readable" on public.matches for select using (true);

-- 2) Player ranks for scoring.
create table if not exists public.player_stats (
  id      text primary key,
  ranking int  not null
);
alter table public.player_stats enable row level security;
drop policy if exists "player_stats readable" on public.player_stats;
create policy "player_stats readable" on public.player_stats for select using (true);

-- 3) Lock entries.score to the server. Any non-service-role write keeps the prior
--    score (0 on insert); only the recompute-score function (service role) sets it.
--    The leaderboard already falls back to the client snapshot until the server has
--    scored, so this is safe to apply before the function runs.
create or replace function public.guard_entry_score() returns trigger
language plpgsql as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if tg_op = 'INSERT' then new.score := 0;
    else new.score := old.score;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists guard_entry_score on public.entries;
create trigger guard_entry_score
  before insert or update on public.entries
  for each row execute function public.guard_entry_score();

-- 4) Seed player ranks (52-player field). Regenerate from the active field when it changes.
insert into public.player_stats (id, ranking) values
  ('sinner', 1),
  ('zverev', 3),
  ('augeraliassime', 4),
  ('shelton', 5),
  ('deminaur', 6),
  ('fritz', 8),
  ('djokovic', 7),
  ('medvedev', 9),
  ('cobolli', 10),
  ('bublik', 11),
  ('ruud', 12),
  ('rublev', 13),
  ('lehecka', 14),
  ('darderi', 16),
  ('mensik', 18),
  ('tien', 17),
  ('tiafoe', 19),
  ('franciscocerundolo', 21),
  ('khachanov', 22),
  ('fils', 24),
  ('paul', 25),
  ('davidovichfokina', 23),
  ('jodar', 26),
  ('fonseca', 27),
  ('rinderknech', 28),
  ('norrie', 29),
  ('humbert', 30),
  ('nakashima', 31),
  ('etcheverry', 32),
  ('tabilo', 33),
  ('buse', 34),
  ('arnaldi', 35),
  ('fery', 178),
  ('struff', 88),
  ('hurkacz', 41),
  ('safiullin', 64),
  ('mochizuki', 104),
  ('dimitrov', 49),
  ('berrettini', 52),
  ('tsitsipas', 37),
  ('sonego', 43),
  ('brooksby', 82),
  ('shapovalov', 38),
  ('wawrinka', 152),
  ('virtanen', 122),
  ('cilic', 94),
  ('munar', 45),
  ('giron', 55),
  ('bergs', 58),
  ('fucsovics', 92),
  ('svajda', 140),
  ('zheng', 160)
on conflict (id) do update set ranking = excluded.ranking;
