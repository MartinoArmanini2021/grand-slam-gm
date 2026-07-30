-- ─────────────────────────────────────────────────────────────────────────────
-- B8 — Part 2 of 2: close the direct-read bypass. Apply this ONLY AFTER Part 1 is in and
-- the app has been deployed to read board_entries (otherwise the live board breaks for the
-- window in between). After this, the base `entries` table is readable ONLY by its owner;
-- everyone reads the leaderboard through the redacting board_entries view (Part 1). The
-- recompute-score function uses the service role, which bypasses RLS, so scoring is unaffected.
--
-- Before this, a rival could bypass the view and read squads straight from
-- /rest/v1/entries?select=state. This revoke shuts that path.
-- ─────────────────────────────────────────────────────────────────────────────

-- anon can no longer read the base table at all (it reads the view instead).
revoke select on public.entries from anon;
drop policy if exists "entries readable by anon (public board)" on public.entries;

-- authenticated can read ONLY their own entry directly (own-squad restore, CloudSync). All
-- other entries are seen only via board_entries (redacted while in draft).
drop policy if exists "league entries readable" on public.entries;
drop policy if exists "own entry readable" on public.entries;
create policy "own entry readable" on public.entries
  for select to authenticated using (user_id = auth.uid());

-- Verify afterwards: an anon read of the view still works and redacts draft squads —
--   select user_id, state ? 'myTeam' as squad_visible from public.board_entries limit 5;
-- and a direct anon read of the base table is now blocked —
--   (a raw GET /rest/v1/entries?select=state with the anon key returns 401/permission denied)
