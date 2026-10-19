-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- One-tap invites (growth plan item 2, 2026-10-20). NOT APPLIED. Apply only on Martino's word.
--
-- What it adds, in plain words:
--   · league_members.invited_by — who brought this manager into this league (null for older rows and
--     for anyone who typed the code by hand).
--   · join_league(p_code, p_ref) — the same join as today, plus the optional inviter. The old
--     one-argument call keeps working unchanged (p_ref defaults to null), so the live app is safe
--     whichever order the app and this file go out in.
--   · league_preview(p_code, p_ref) — what an invite link shows BEFORE signing in: the league's name,
--     how many managers are in it, and the inviter's team name. Readable without an account (that is
--     the point of the link). Never shows emails, never shows the public league.
--   · my_recruits() — how many managers joined a league through your links.
--
-- ROLLBACK at the bottom.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

alter table public.league_members add column if not exists invited_by uuid references auth.users (id) on delete set null;
create index if not exists league_members_invited_by_idx on public.league_members (invited_by) where invited_by is not null;

drop function if exists public.join_league(text);
create or replace function public.join_league(p_code text, p_ref uuid default null)
returns table (id uuid, name text)
language plpgsql security definer set search_path = public as $$
declare lg record; v_ref uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select l.id, l.name into lg from public.leagues l
   where l.code = upper(btrim(p_code)) and l.is_public = false limit 1;
  if lg.id is null then raise exception 'No league found with that code'; end if;
  -- The inviter counts only when they are in this league and are not the person joining.
  if p_ref is not null and p_ref <> auth.uid()
     and exists (select 1 from public.league_members m where m.league_id = lg.id and m.user_id = p_ref) then
    v_ref := p_ref;
  end if;
  -- on conflict do nothing: rejoining never rewrites who invited you
  insert into public.league_members (league_id, user_id, invited_by) values (lg.id, auth.uid(), v_ref)
  on conflict do nothing;
  return query select lg.id, lg.name;
end $$;
revoke all on function public.join_league(text, uuid) from public, anon;
grant execute on function public.join_league(text, uuid) to authenticated;

create or replace function public.league_preview(p_code text, p_ref uuid default null)
returns table (name text, members int, inviter_team text)
language sql stable security definer set search_path = public as $$
  select l.name,
         (select count(*)::int from public.league_members m where m.league_id = l.id),
         (select nullif(btrim(p.team_name), '') from public.profiles p
           where p.id = p_ref
             and exists (select 1 from public.league_members m where m.league_id = l.id and m.user_id = p_ref))
    from public.leagues l
   where l.code = upper(btrim(p_code)) and l.is_public = false
   limit 1;
$$;
revoke all on function public.league_preview(text, uuid) from public;
grant execute on function public.league_preview(text, uuid) to anon, authenticated;

create or replace function public.my_recruits()
returns int
language sql stable security definer set search_path = public as $$
  select count(distinct m.user_id)::int from public.league_members m where m.invited_by = auth.uid();
$$;
revoke all on function public.my_recruits() from public, anon;
grant execute on function public.my_recruits() to authenticated;

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (restores today's one-argument join_league exactly)
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- begin;
--   drop function if exists public.my_recruits();
--   drop function if exists public.league_preview(text, uuid);
--   drop function if exists public.join_league(text, uuid);
--   create or replace function public.join_league(p_code text)
--   returns table(id uuid, name text) language plpgsql security definer set search_path to 'public' as $function$
--   declare lg record;
--   begin
--     select l.id, l.name into lg from public.leagues l
--       where l.code = upper(btrim(p_code)) and l.is_public = false limit 1;
--     if lg.id is null then raise exception 'No league found with that code'; end if;
--     insert into public.league_members (league_id, user_id) values (lg.id, auth.uid()) on conflict do nothing;
--     return query select lg.id, lg.name;
--   end $function$;
--   revoke all on function public.join_league(text) from public, anon;
--   grant execute on function public.join_league(text) to authenticated;
--   drop index if exists public.league_members_invited_by_idx;
--   alter table public.league_members drop column if exists invited_by;
-- commit;
