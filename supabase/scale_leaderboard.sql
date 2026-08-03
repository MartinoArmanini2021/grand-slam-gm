-- ── Leaderboard scale-hardening (apply in the Supabase SQL editor) ────────────
-- The public global board now reads the TOP entries by score directly, rather than
-- scanning the whole membership. Two changes make that fast + correct at 100k+ users.
--
-- Safe to run more than once (idempotent).

-- 1) Index the exact query the public board runs: entries for a tournament, best score
--    first. Turns the ORDER BY … LIMIT into an index scan instead of a full sort.
create index if not exists entries_tournament_score_idx
  on public.entries (tournament_id, score desc);

-- 2) ⚠️ SUPERSEDED BY B8 — DO NOT RE-RUN the policy below.
--    This `using (true)` policy let ANY authenticated user read EVERY row of the base
--    `public.entries` table. B8 (hide_draft_squads_2_restrict.sql) replaced it with an
--    own-row-only policy and routed all board reads through the REDACTED `board_entries`
--    view, so a rival can't read an in-progress draft squad. Re-running the statements
--    below would re-open that leak, so they are commented out.
--
--      drop policy if exists "league entries readable" on public.entries;
--      create policy "league entries readable" on public.entries
--        for select to authenticated using (true);
