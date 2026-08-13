-- ── Cincinnati Open 2026 — player ranks for server-side scoring ───────────────────────────────────
-- The server's upset multiplier reads public.player_stats.ranking, so EVERY drafted player must have
-- a row here or they fall back to the default rank and score wrong.
--
-- Generated from src/data/cincinnati2026Field.json (built from the published draw and reconciled
-- against Wikipedia: 0 missing, 0 phantom). 83 players.
--
-- SAFE TO RUN ANY TIME: verified that all 69 players shared with the Montréal field carry the SAME
-- rank (both come from the same ATP snapshot), so this only ADDS the 14 players new to Cincinnati and
-- cannot retroactively change any Montréal score. The upsert keeps it re-runnable.
--
-- Apply in the Supabase SQL editor (see docs/CINCINNATI_CUTOVER.md).

insert into public.player_stats (id, ranking) values
  ('zverev', 2),
  ('augeraliassime', 4),
  ('djokovic', 7),
  ('medvedev', 8),
  ('deminaur', 5),
  ('fritz', 10),
  ('cobolli', 9),
  ('shelton', 6),
  ('lehecka', 12),
  ('musetti', 15),
  ('ruud', 13),
  ('jodar', 25),
  ('rublev', 14),
  ('mensik', 18),
  ('vacherot', 19),
  ('tien', 16),
  ('tiafoe', 17),
  ('paul', 24),
  ('darderi', 21),
  ('franciscocerundolo', 22),
  ('fils', 23),
  ('tabilo', 30),
  ('fonseca', 28),
  ('humbert', 29),
  ('rinderknech', 27),
  ('etcheverry', 31),
  ('nakashima', 32),
  ('blockx', 38),
  ('buse', 35),
  ('bergs', 34),
  ('arnaldi', 33),
  ('fery', 36),
  ('khachanov', 26),
  ('collignon', 37),
  ('norrie', 39),
  ('struff', 41),
  ('berrettini', 42),
  ('michelsen', 44),
  ('mannarino', 46),
  ('navone', 47),
  ('borges', 48),
  ('atmane', 49),
  ('cerundolo', 50),
  ('tsitsipas', 51),
  ('hanfmann', 52),
  ('machac', 53),
  ('marozsan', 54),
  ('zandschulp', 55),
  ('baez', 56),
  ('tirante', 57),
  ('kecmanovic', 58),
  ('merida', 59),
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
  ('brooksby', 74),
  ('royer', 75),
  ('fucsovics', 76),
  ('sonego', 77),
  ('bellucci', 79),
  ('duckworth', 82),
  ('cilic', 86),
  ('choinski', 90),
  ('prizmic', 91),
  ('kovacevic', 93),
  ('hijikata', 96),
  ('jong', 98),
  ('walton', 99),
  ('dimitrov', 142),
  ('draper', 147),
  ('shang', 270),
  ('monfils', 327),
  ('kokkinakis', 443)
on conflict (id) do update set ranking = excluded.ranking;

-- Verify: should return 83
-- select count(*) from public.player_stats where id in (select id from public.player_stats);
select count(*) as cincinnati_players_seeded from public.player_stats
where id = any (array['zverev','augeraliassime','djokovic','medvedev','deminaur','fritz','cobolli','shelton','lehecka','musetti','ruud','jodar','rublev','mensik','vacherot','tien','tiafoe','paul','darderi','franciscocerundolo','fils','tabilo','fonseca','humbert','rinderknech','etcheverry','nakashima','blockx','buse','bergs','arnaldi','fery','khachanov','collignon','norrie','struff','berrettini','michelsen','mannarino','navone','borges','atmane','cerundolo','tsitsipas','hanfmann','machac','marozsan','zandschulp','baez','tirante','kecmanovic','merida','burruchaga','altmaier','landaluce','vallejo','busta','griekspoor','shapovalov','kopriva','carabelli','hurkacz','majchrzak','medjedovic','svajda','brooksby','royer','fucsovics','sonego','bellucci','duckworth','cilic','choinski','prizmic','kovacevic','hijikata','jong','walton','dimitrov','draper','shang','monfils','kokkinakis']);
