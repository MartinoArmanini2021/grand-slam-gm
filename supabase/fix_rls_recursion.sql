-- Fix: "infinite recursion detected in policy for relation entries" (Postgres 42P17).
-- The entries/leagues read policies referenced the entries table inside their own
-- USING clause, which re-triggers the same policy forever. This replaces them with a
-- SECURITY DEFINER helper that reads memberships without invoking RLS again.
-- Safe to run on the existing database; re-runnable.
--
-- SECURITY: my_league_ids() reads from league_members, NOT entries. Deriving league
-- access from entries.league_id would let a user self-grant read access to a PRIVATE
-- league by inserting an entry with that league's id (the entries INSERT policy only
-- checks user_id). Membership is the sole source of truth (matches schema.sql /
-- private_leagues.sql), so this file is safe to apply in ANY order.
create or replace function public.my_league_ids()
returns setof uuid
language sql security definer stable
set search_path = public as $$
  select league_id from public.league_members
  where user_id = auth.uid()
$$;

drop policy if exists "league entries readable" on public.entries;
create policy "league entries readable" on public.entries
  for select to authenticated using (
    user_id = auth.uid()
    or league_id in (select public.my_league_ids())
  );

drop policy if exists "leagues readable" on public.leagues;
create policy "leagues readable" on public.leagues
  for select to authenticated using (
    is_public
    or id in (select public.my_league_ids())
  );
