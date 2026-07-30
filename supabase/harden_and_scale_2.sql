-- ── Round 2 hardening + scale (apply in the Supabase SQL editor) ──────────────
-- Idempotent. Addresses the data-engineering review: a missing hot index, a
-- set-based scorer, invite-code collisions, and leaving the public league.

-- 1) Index league_members by user_id. The PK is (league_id, user_id) so lookups by
--    user_id (my_league_ids(), used by every leagues/entries RLS check) currently
--    seq-scan the giant public-league membership. This is the single most important
--    index for launch-day read performance.
create index if not exists league_members_user_id_idx on public.league_members (user_id);

-- 2) Set-based score application, called by the recompute-score Edge Function once per
--    ~5000-row chunk instead of one UPDATE per entry (the serial loop can't finish
--    inside the cron window at scale). SECURITY DEFINER; only the service role may call
--    it (clients can't write score — revoked below), so scores stay server-authoritative.
create or replace function public.apply_entry_scores(p_tournament text, p_scores jsonb)
returns void language sql security definer set search_path = public as $$
  update public.entries e
     set score = s.score, updated_at = now()
    from jsonb_to_recordset(p_scores) as s(user_id uuid, score int)
   where e.user_id = s.user_id and e.tournament_id = p_tournament;
$$;
revoke all on function public.apply_entry_scores(text, jsonb) from public, authenticated, anon;
grant execute on function public.apply_entry_scores(text, jsonb) to service_role;

-- 3) create_league: retry on the (rare but real, by birthday bound) 6-char invite-code
--    collision instead of failing with a raw unique-violation.
create or replace function public.create_league(p_name text)
returns table (id uuid, code text)
language plpgsql security definer set search_path = public as $$
declare new_id uuid; new_code text; attempts int := 0;
begin
  loop
    new_code := upper(substr(md5(gen_random_uuid()::text), 1, 6));
    begin
      insert into public.leagues (name, code, is_public, owner_id)
        values (coalesce(nullif(btrim(p_name), ''), 'My League'), new_code, false, auth.uid())
        returning leagues.id into new_id;
      exit;  -- inserted cleanly
    exception when unique_violation then
      attempts := attempts + 1;
      if attempts >= 8 then raise exception 'Could not generate a unique league code, please retry'; end if;
    end;
  end loop;
  insert into public.league_members (league_id, user_id) values (new_id, auth.uid()) on conflict do nothing;
  return query select new_id, new_code;
end $$;
grant execute on function public.create_league(text) to authenticated;

-- 4) leave_league: block leaving the PUBLIC league (which would make you vanish from the
--    global board). Private leagues can still be left.
create or replace function public.leave_league(p_league uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if (select is_public from public.leagues where id = p_league) then
    raise exception 'You cannot leave the public league';
  end if;
  delete from public.league_members where league_id = p_league and user_id = auth.uid();
end $$;
grant execute on function public.leave_league(uuid) to authenticated;
