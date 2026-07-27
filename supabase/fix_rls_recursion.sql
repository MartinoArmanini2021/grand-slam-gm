-- Fix: "infinite recursion detected in policy for relation entries" (Postgres 42P17).
-- The entries/leagues read policies referenced the entries table inside their own
-- USING clause, which re-triggers the same policy forever. This replaces them with a
-- SECURITY DEFINER helper that reads memberships without invoking RLS again.
-- Safe to run on the existing database; re-runnable.

create or replace function public.my_league_ids()
returns setof uuid
language sql security definer stable
set search_path = public as $$
  select league_id from public.entries
  where user_id = auth.uid() and league_id is not null
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
