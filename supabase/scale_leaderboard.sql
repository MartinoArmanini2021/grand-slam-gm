-- ── Leaderboard scale-hardening (apply in the Supabase SQL editor) ────────────
-- The public global board now reads the TOP entries by score directly, rather than
-- scanning the whole membership. Two changes make that fast + correct at 100k+ users.
--
-- Safe to run more than once (idempotent).

-- 1) Index the exact query the public board runs: entries for a tournament, best score
--    first. Turns the ORDER BY … LIMIT into an index scan instead of a full sort.
create index if not exists entries_tournament_score_idx
  on public.entries (tournament_id, score desc);

-- 2) Simplify the entries READ policy. Entries hold only leaderboard-public data
--    (squad, score, budget) — the same fields already shown to everyone on the board;
--    all PII lives in `profiles` and is exposed solely through the `public_profiles`
--    view. The old policy re-derived "do we share a league?" per row via a subquery over
--    league_members, which is O(members) and won't hold up on the huge public league.
--    Since every signed-in user is a member of the public league anyway, that check
--    always passed — so `using (true)` is equivalent for reads and far faster.
--    (Writes stay locked to your own row — those policies are unchanged.)
drop policy if exists "league entries readable" on public.entries;
create policy "league entries readable" on public.entries
  for select to authenticated using (true);
