-- ── Store the set score the feed already parses (2026-08-19) ─────────────────────────────────────
-- Apply ONCE. Additive and safe to run on a live tournament.
--
-- THE SITUATION. ingest-draw ALREADY parses the per-set games out of the draw page — it builds a
-- full `scores` map (index.ts, parseFullDraw) — and then drops it on the floor, because
-- buildMatchRows returns only { tournament_id, round, slot, p1_id, p2_id, winner_id }. The data is
-- fetched, parsed and discarded on every run.
--
-- Consequence today: the live app shows set scores only because EACH USER'S BROWSER separately
-- fetches and parses the same Wikipedia page. So the score is never in the database, no other
-- client can show it, and the parsing work is repeated once per visitor rather than once per cron.
--
-- WHY THIS IS SAFE. It is a nullable column. Every existing reader selects NAMED columns —
-- ingest-draw ('round, slot, winner_id'), recompute-score ('round, p1_id, p2_id, winner_id') — so
-- nothing sees a changed shape. There is no `select *` against matches anywhere in the app or the
-- edge functions. Existing rows get NULL, which correctly means "no score recorded", and the next
-- ingest run backfills every decided match.
--
-- FORMAT. Winner-first, standard tennis notation, space-separated sets: '6-4 3-6 7-6'.
-- Winner-first because that is how a score is read aloud and written in every draw sheet; storing
-- it in pairing order would make every consumer re-derive the orientation from winner_id.
-- NULL whenever the match has no winner yet, or the source published no score.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────

alter table public.matches add column if not exists score_line text;

comment on column public.matches.score_line is
  'Set score, winner-first, e.g. ''6-4 3-6 7-6''. NULL until the match is decided or when the '
  'source published no score. Written by ingest-draw from the draw page it already parses.';

-- Verify: the column exists and nothing else moved.
-- select column_name, data_type, is_nullable
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'matches'
--  order by ordinal_position;
--
-- After the next ingest run (within 5 minutes), decided matches should carry a score:
-- select round, slot, p1_id, p2_id, winner_id, score_line
--   from public.matches
--  where tournament_id = 'cincinnati_2026' and winner_id is not null
--  order by round, slot limit 10;
