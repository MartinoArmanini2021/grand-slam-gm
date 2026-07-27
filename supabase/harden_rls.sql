-- Security hardening from the end-of-day review. Safe to run on the existing DB.
--
-- M4 — Stop leaking PII. The old "profiles readable to all authenticated" policy
-- exposed first_name / last_name / country to every signed-in user. Lock the base
-- table to own-row reads, and expose ONLY the safe public columns (username, team
-- name/emblem) via a view for the shared leaderboard.
drop policy if exists "profiles readable" on public.profiles;
drop policy if exists "own profile readable" on public.profiles;
create policy "own profile readable" on public.profiles
  for select to authenticated using (auth.uid() = id);

-- The view is intentionally SECURITY DEFINER (default) so it can surface these safe
-- columns for every player to the leaderboard, without exposing the PII columns.
create or replace view public.public_profiles as
  select id, username, team_name, team_emblem from public.profiles;
grant select on public.public_profiles to authenticated;

-- M6 — Prevent duplicate entries. league_id was nullable; Postgres treats NULLs as
-- distinct in the unique(user_id, league_id, tournament_id) index, so a NULL league_id
-- would let every save insert a new duplicate row (double-counting the leaderboard).
-- Every entry already carries the public league id, so this is safe.
alter table public.entries alter column league_id set not null;
