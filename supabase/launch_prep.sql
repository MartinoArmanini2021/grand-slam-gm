-- === Launch prep: league management + clean slate (public league KEPT) ===
-- Run once before handing the app to friends. §A/§B are idempotent; §C wipes test data.

-- A. League management functions (owner-gated where noted).
-- Delete a private league you own (cascades its memberships).
create or replace function public.delete_league(p_league uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.leagues where id = p_league and owner_id = auth.uid() and is_public = false;
  if not found then raise exception 'Only the league owner can delete it'; end if;
end $$;

-- Leave a league (remove yourself).
create or replace function public.leave_league(p_league uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.league_members where league_id = p_league and user_id = auth.uid();
end $$;

-- Owner removes another member (never themselves — they delete the league instead).
create or replace function public.remove_member(p_league uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.leagues where id = p_league and owner_id = auth.uid()) then
    raise exception 'Only the league owner can remove members';
  end if;
  delete from public.league_members where league_id = p_league and user_id = p_user and user_id <> auth.uid();
end $$;

grant execute on function public.delete_league(uuid) to authenticated;
grant execute on function public.leave_league(uuid) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to authenticated;

-- B. Make sure every existing user is in the public league (in case any were created
--    before it was seeded) — so the public board shows everyone.
insert into public.league_members (league_id, user_id)
  select l.id, u.id from public.leagues l cross join auth.users u
  where l.is_public on conflict do nothing;

-- C. Clean slate for the launch — wipe every squad and every PRIVATE league (the
--    public league + its memberships stay, so the global board still works). Accounts
--    are kept. ⚠️ DELETES TEST DATA.
delete from public.entries;
delete from public.leagues where is_public = false;  -- cascades private memberships
