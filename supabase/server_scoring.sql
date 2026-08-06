-- ── Server-authoritative scoring (W5) ────────────────────────────────────────
-- The client saves its squad (entries.state) but must NOT be trusted for the
-- leaderboard number. This migration:
--   1. adds public.matches   — the draw + results the server holds (fed by the
--      live feed / admin console); the source of truth for who won each match.
--   2. adds public.player_stats — ATP ranks used by the scoring multiplier/upset.
--
-- entries.score is ALREADY locked to the server by add_entry_state.sql
--   (`revoke insert/update (score) on public.entries from authenticated`), and the
--   client's saveEntry never writes score — so no trigger is needed here. The only
--   writer of entries.score is the service-role `recompute-score` Edge Function.
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
  primary key (tournament_id, round, slot),
  -- F4-5: a winner MUST be one of the two players (or null/undecided). Stops a corrupt
  -- ingest (e.g. a slot-shift attaching a stored winner to the wrong pairing, or a typo'd
  -- override) from ever persisting a nonsensical winner_id — the upsert fails loudly instead.
  constraint matches_winner_in_pairing check (winner_id is null or winner_id in (p1_id, p2_id))
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

-- 3) Seed player ranks (52-player field). Regenerate from the active field when it changes.
insert into public.player_stats (id, ranking) values
  ('zverev', 2),
  ('augeraliassime', 4),
  ('deminaur', 5),
  ('shelton', 6),
  ('medvedev', 8),
  ('cobolli', 9),
  ('fritz', 10),
  ('bublik', 11),
  ('lehecka', 12),
  ('ruud', 13),
  ('rublev', 14),
  ('musetti', 15),
  ('tien', 16),
  ('tiafoe', 17),
  ('mensik', 18),
  ('vacherot', 19),
  ('davidovichfokina', 20),
  ('darderi', 21),
  ('franciscocerundolo', 22),
  ('fils', 23),
  ('paul', 24),
  ('jodar', 25),
  ('khachanov', 26),
  ('rinderknech', 27),
  ('fonseca', 28),
  ('humbert', 29),
  ('tabilo', 30),
  ('etcheverry', 31),
  ('nakashima', 32),
  ('arnaldi', 33),
  ('bergs', 34),
  ('buse', 35),
  ('collignon', 37),
  ('blockx', 38),
  ('norrie', 39),
  ('moutet', 40),
  ('struff', 41),
  ('berrettini', 42),
  ('munar', 43),
  ('michelsen', 44),
  ('quinn', 45),
  ('mannarino', 46),
  ('navone', 47),
  ('borges', 48),
  ('atmane', 49),
  ('cerundolo', 50),
  ('hanfmann', 52),
  ('marozsan', 54),
  ('zandschulp', 55),
  ('baez', 56),
  ('tirante', 57),
  ('kecmanovic', 58),
  ('burruchaga', 60),
  ('altmaier', 61),
  ('landaluce', 62),
  ('vallejo', 63),
  ('busta', 65),
  ('griekspoor', 66),
  ('shapovalov', 67),
  ('kopriva', 68),
  ('carabelli', 69),
  ('hurkacz', 70),
  ('majchrzak', 71),
  ('medjedovic', 72),
  ('svajda', 73),
  ('royer', 75),
  ('fucsovics', 76),
  ('sonego', 77),
  ('bellucci', 79),
  ('duckworth', 82),
  ('cilic', 86),
  ('diallo', 92),
  ('kovacevic', 93),
  ('shang', 270),
  ('merida', 59),
  ('popyrin', 104),
  ('droguet', 114)
on conflict (id) do update set ranking = excluded.ranking;
