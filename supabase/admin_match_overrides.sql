-- ── Admin result corrections that actually reach the SERVER ──────────────────
-- THE BUG THIS CLOSES: correcting a match in Match Admin wrote ONLY to the operator's own
-- browser (liveStore → localStorage). Scores come from public.matches, which no browser can
-- write, so a correction fixed that one device and left EVERY OTHER manager's score wrong —
-- indefinitely, because the next ingest run just re-applied the feed's version. The durable
-- override table (ingest_overrides_and_health.sql) existed, but only a hand-rolled POST with
-- the service-role key could fill it.
--
-- THE FIX: a real server-side admin role + two SECURITY DEFINER RPCs the app calls with the
-- operator's OWN JWT. No service-role key ever goes near the client.
--   set_match_override(round, slot, winner) → durable override + an immediate matches write
--   clear_match_override(round, slot)       → drop the correction, hand the slot back to the feed
-- ingest-draw already reads public.match_overrides every run and applies it with top
-- precedence, so a correction also survives every future cron cycle.
--
-- Run this once in the Supabase SQL Editor (idempotent), then grant yourself admin — see
-- "TO GRANT ADMIN" at the bottom. Safe to re-run.

-- ── 1. Who may correct a result ──────────────────────────────────────────────
-- Deliberately NOT a flag on profiles: profiles are client-writable, so a self-service
-- boolean there would let any manager promote themselves and rewrite the tournament.
create table if not exists public.app_admins (
  user_id  uuid primary key references auth.users on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
-- No policies + no grants: clients can never read or write the admin roster directly.
-- Membership is observable ONLY through is_admin() below, which reports on the caller alone.
revoke all on public.app_admins from anon, authenticated;

-- Is the CALLER an admin? Security definer so it can read the (client-invisible) roster,
-- but it only ever answers about auth.uid() — it can't be used to enumerate admins.
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid())
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ── 2. Set a correction ──────────────────────────────────────────────────────
-- Writes the durable override AND applies it to public.matches immediately, so the next
-- recompute (every minute) picks it up instead of waiting for the next ingest cycle.
create or replace function public.set_match_override(p_round text, p_slot int, p_winner text)
returns void language plpgsql security definer set search_path = public as $$
declare
  tid text := public.active_tournament_id();
  m   public.matches%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Not authorised to correct results' using errcode = '42501';
  end if;

  select * into m from public.matches
   where tournament_id = tid and round = p_round and slot = p_slot;
  if not found then
    raise exception 'No % match in slot % for % yet', p_round, p_slot, tid using errcode = 'P0002';
  end if;

  -- The winner MUST be one of the two players in the pairing — the same rule the
  -- matches_winner_in_pairing constraint and ingest-draw's buildMatchRows enforce. Checked
  -- here so a typo'd id is refused at the door rather than corrupting everyone's score.
  if p_winner is null or p_winner not in (m.p1_id, m.p2_id) then
    raise exception 'Winner % is not in the % slot % pairing', p_winner, p_round, p_slot
      using errcode = '23514';
  end if;

  insert into public.match_overrides (tournament_id, round, slot, winner_id)
  values (tid, p_round, p_slot, p_winner)
  on conflict (tournament_id, round, slot)
    do update set winner_id = excluded.winner_id, set_at = now();

  update public.matches set winner_id = p_winner
   where tournament_id = tid and round = p_round and slot = p_slot;
end;
$$;
revoke all on function public.set_match_override(text, int, text) from public;
grant execute on function public.set_match_override(text, int, text) to authenticated;

-- ── 3. Undo a correction ─────────────────────────────────────────────────────
create or replace function public.clear_match_override(p_round text, p_slot int)
returns void language plpgsql security definer set search_path = public as $$
declare tid text := public.active_tournament_id();
begin
  if not public.is_admin() then
    raise exception 'Not authorised to correct results' using errcode = '42501';
  end if;

  delete from public.match_overrides
   where tournament_id = tid and round = p_round and slot = p_slot;

  -- Clear the recorded winner too, so the undo is real: ingest-draw falls back to the
  -- parsed feed result for this slot on its next run. Leaving the old value in place would
  -- freeze the manual pick forever (buildMatchRows treats it as `existingWinners`).
  update public.matches set winner_id = null
   where tournament_id = tid and round = p_round and slot = p_slot;
end;
$$;
revoke all on function public.clear_match_override(text, int) from public;
grant execute on function public.clear_match_override(text, int) to authenticated;

-- ── TO GRANT ADMIN (run once per operator, here in the SQL editor) ───────────
--   insert into public.app_admins (user_id)
--   select id from auth.users where email = 'you@example.com'
--   on conflict do nothing;
--
-- TO REVOKE:  delete from public.app_admins where user_id = '<uuid>';
-- WHO IS ADMIN:  select u.email, a.added_at from public.app_admins a join auth.users u on u.id = a.user_id;
