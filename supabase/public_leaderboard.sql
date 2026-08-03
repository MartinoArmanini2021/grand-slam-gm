-- ── Public leaderboard: allow the cached edge endpoint (anon role) to read it ──
-- Apply in the Supabase SQL editor. Idempotent.
--
-- The /api/leaderboard edge function serves the public board from Cloudflare's cache so
-- board reads don't scale with user count. It reads with the PUBLIC anon key, so anon
-- needs SELECT on the two PUBLIC, non-PII datasets it returns: game entries (squad /
-- score / budget — already shown to everyone on the board) and the public_profiles view
-- (username / team name / emblem only). No first/last name, country, email, or phone is
-- exposed — those live in `profiles`, which stays locked to own-row reads.
-- Writes are unchanged: a client still cannot write another row or the score column.

-- ⚠️ SUPERSEDED BY B8 — DO NOT RE-RUN the entries grant/policy below.
-- The public board now reads the REDACTED `board_entries` view (which hides in-progress
-- draft squads), and anon SELECT was granted on that view in hide_draft_squads_1_view.sql.
-- hide_draft_squads_2_restrict.sql deliberately REVOKED anon's direct read of the base
-- `public.entries` table. Re-running the two statements below would re-open every user's
-- pre-lock squad to anyone — so they are commented out. Only `public_profiles` (safe,
-- non-PII) is still granted.
--
--   grant select on public.entries to anon;
--   drop policy if exists "entries readable by anon (public board)" on public.entries;
--   create policy "entries readable by anon (public board)" on public.entries
--     for select to anon using (true);

grant select on public.public_profiles to anon;
