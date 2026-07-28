-- === Launch prep: clean slate + private-leagues-only + league management ===
-- Run once before handing the app to friends. Idempotent except the final wipe (§C),
-- which deletes all test squads + leagues on purpose.

-- A. New users no longer auto-join a global "everyone" league — players see only the
--    private leagues they explicitly join. The public league remains ONLY as the
--    placeholder every entry references (entries.league_id is NOT NULL); it has no
--    members and is never shown as a board.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;

-- B. League management functions (owner-gated where noted).
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

-- C. Clean slate for the launch — wipe every squad, league, and membership (accounts
--    are kept). The public placeholder league is preserved. ⚠️ DELETES TEST DATA.
delete from public.entries;
delete from public.league_members;
delete from public.leagues where is_public = false;
