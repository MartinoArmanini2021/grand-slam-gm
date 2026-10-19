-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- Market emails (growth plan item 1, 2026-10-20). NOT APPLIED. Apply only on Martino's word.
--
-- What it adds, in plain words:
--   · notification_prefs — one row per manager: emails on/off and the language (en / it).
--   · notification_log   — one row per email we decided to send (or would have sent in a dry run).
--                          Its primary key is what makes an email go out ONCE, even if two runs overlap.
--   · market_state()     — "is the market open, for which round, and when does it lock?", worked out
--                          exactly the way market_check() (the save path) works it out.
--   · notification_candidates() — who is due which email right now. Four kinds:
--        draft_open   the draw is out and you have no squad yet          (once per tournament)
--        draft_lock   the draft locks within 2 hours and you have no squad (once per tournament)
--        market_open  the market opened and you have a knocked-out player or an empty slot,
--                     and transfers left                                  (once per round)
--        market_lock  it locks within 2 hours and that is still true      (once per round)
--   · app_config 'notify_mode' = 'off' | 'dry_run' | 'live'. Starts OFF. Nothing is sent unless it
--     says 'live' AND the edge function has its RESEND_API_KEY. 'dry_run' only writes log rows.
--   · the cron line is at the bottom, COMMENTED OUT, so applying this file schedules nothing.
--
-- ROLLBACK at the bottom.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── preferences ────────────────────────────────────────────────────────────────────────────────
create table if not exists public.notification_prefs (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  email_reminders boolean not null default true,
  locale          text    not null default 'en' check (locale in ('en', 'it')),
  updated_at      timestamptz not null default now()
);
alter table public.notification_prefs enable row level security;
drop policy if exists notification_prefs_read_own on public.notification_prefs;
create policy notification_prefs_read_own on public.notification_prefs
  for select to authenticated using (user_id = auth.uid());
-- No insert/update policy: writes go through set_notification_prefs() only.
revoke all on public.notification_prefs from anon, authenticated;
grant select on public.notification_prefs to authenticated;

create or replace function public.set_notification_prefs(p_email_reminders boolean, p_locale text)
returns public.notification_prefs
language plpgsql security definer set search_path = public as $$
declare r public.notification_prefs;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if p_locale is not null and p_locale not in ('en', 'it') then raise exception 'Unknown language'; end if;
  insert into public.notification_prefs as np (user_id, email_reminders, locale, updated_at)
  values (auth.uid(), coalesce(p_email_reminders, true), coalesce(p_locale, 'en'), now())
  on conflict (user_id) do update
     set email_reminders = coalesce(p_email_reminders, np.email_reminders),
         locale          = coalesce(p_locale, np.locale),
         updated_at      = now()
  returning * into r;
  return r;
end $$;
revoke all on function public.set_notification_prefs(boolean, text) from public, anon;
grant execute on function public.set_notification_prefs(boolean, text) to authenticated;

-- The one-click unsubscribe (edge function notify-unsubscribe, service role only).
create or replace function public.unsubscribe_reminders(p_user uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare was boolean;
begin
  select email_reminders into was from public.notification_prefs where user_id = p_user;
  insert into public.notification_prefs (user_id, email_reminders, updated_at)
  values (p_user, false, now())
  on conflict (user_id) do update set email_reminders = false, updated_at = now();
  return coalesce(was, true);
end $$;
revoke all on function public.unsubscribe_reminders(uuid) from public, anon, authenticated;
grant execute on function public.unsubscribe_reminders(uuid) to service_role;

-- ── the log (also the once-only lock) ─────────────────────────────────────────────────────────
create table if not exists public.notification_log (
  user_id       uuid not null references auth.users (id) on delete cascade,
  tournament_id text not null,
  kind          text not null check (kind in ('draft_open', 'draft_lock', 'market_open', 'market_lock')),
  round         text not null default '',
  status        text not null check (status in ('dry_run', 'sent', 'failed')),
  detail        text,
  created_at    timestamptz not null default now(),
  primary key (user_id, tournament_id, kind, round)
);
alter table public.notification_log enable row level security;   -- no policies: service role only
revoke all on public.notification_log from anon, authenticated;

-- Claim one email before sending it. False = already claimed (by an earlier or a parallel run).
create or replace function public.claim_notification(
  p_user uuid, p_tournament text, p_kind text, p_round text, p_dry_run boolean)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notification_log (user_id, tournament_id, kind, round, status)
  values (p_user, p_tournament, p_kind, coalesce(p_round, ''), case when p_dry_run then 'dry_run' else 'sent' end)
  on conflict do nothing;
  return found;
end $$;

create or replace function public.notification_failed(
  p_user uuid, p_tournament text, p_kind text, p_round text, p_detail text)
returns void
language sql security definer set search_path = public as $$
  update public.notification_log set status = 'failed', detail = left(p_detail, 500)
   where user_id = p_user and tournament_id = p_tournament and kind = p_kind and round = coalesce(p_round, '');
$$;
revoke all on function public.claim_notification(uuid, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.notification_failed(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.claim_notification(uuid, text, text, text, boolean) to service_role;
grant execute on function public.notification_failed(uuid, text, text, text, text) to service_role;

insert into public.app_config (key, value) values ('notify_mode', 'off') on conflict (key) do nothing;

-- ── the market, as the save path sees it ──────────────────────────────────────────────────────
-- Same three steps as market_check() 1–3: which rounds have begun, which round is the window, and
-- whether every earlier round is complete (or we are inside the 6-hour valve).
create or replace function public.market_state(p_tournament text, p_now timestamptz default now())
returns table (phase text, window_round text, locks_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  v_order text[] := array['R128','R64','R32','R16','QF','SF','F'];
  v_started text[]; v_window text; v_pos int; v_start timestamptz; v_waiting text;
begin
  if not exists (select 1 from public.matches m where m.tournament_id = p_tournament) then
    return query select 'no_draw'::text, null::text, null::timestamptz; return;
  end if;
  v_started := array(select distinct m.round from public.matches m
     where m.tournament_id = p_tournament
       and (m.winner_id is not null or (m.started_at is not null and m.started_at <= p_now)));
  select o.r into v_window
    from unnest(v_order) with ordinality as o(r, pos)
   where exists (select 1 from public.matches m where m.tournament_id = p_tournament and m.round = o.r)
     and not (o.r = any(v_started))
   order by o.pos limit 1;
  if v_window is not null then
    select min(m.started_at) into v_start from public.matches m
     where m.tournament_id = p_tournament and m.round = v_window;
  end if;
  if coalesce(array_length(v_started, 1), 0) = 0 then
    -- the draft: it locks at the first round's first ball (stamped, else the round plan's)
    return query select 'draft'::text, v_window,
      coalesce(v_start, (select min(p.first_ball) from public.round_plan p
                          where p.tournament_id = p_tournament and p.round = v_window));
    return;
  end if;
  if v_window is null then
    return query select 'closed'::text, null::text, null::timestamptz; return;
  end if;
  v_pos := array_position(v_order, v_window);
  select m.round into v_waiting from public.matches m
   where m.tournament_id = p_tournament and array_position(v_order, m.round) < v_pos and m.winner_id is null
   order by array_position(v_order, m.round) desc limit 1;
  if v_waiting is null or (v_start is not null and p_now >= v_start - interval '6 hours') then
    return query select 'open'::text, v_window, v_start;
  else
    return query select 'waiting'::text, v_window, v_start;
  end if;
end $$;
revoke all on function public.market_state(text, timestamptz) from public, anon;
grant execute on function public.market_state(text, timestamptz) to authenticated, service_role;

-- ── who is due which email ────────────────────────────────────────────────────────────────────
create or replace function public.notification_candidates(p_now timestamptz default now())
returns table (
  user_id uuid, email text, locale text, kind text, tournament_id text, round text,
  locks_at timestamptz, players_out text[], empty_slots int, transfers_left int, team_name text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_tid text := public.active_tournament_id();
  s record;
begin
  if coalesce((select value from public.app_config where key = 'notify_mode'), 'off') = 'off' then return; end if;
  if v_tid is null or exists (select 1 from public.tournament_status ts where ts.tournament_id = v_tid) then return; end if;
  select * into s from public.market_state(v_tid, p_now);
  if s.locks_at is null or p_now >= s.locks_at then return; end if;

  if s.phase = 'draft' then
    return query
    select u.id, u.email::text, coalesce(np.locale, 'en'),
           case when p_now >= s.locks_at - interval '2 hours' then 'draft_lock' else 'draft_open' end,
           v_tid, ''::text, s.locks_at, '{}'::text[], 10, public.max_transfers_for(v_tid), p.team_name
      from auth.users u
      left join public.notification_prefs np on np.user_id = u.id
      left join public.profiles p on p.id = u.id
     where u.email is not null and u.email_confirmed_at is not null
       and coalesce(np.email_reminders, true)
       and not exists (select 1 from public.entries e where e.user_id = u.id and e.tournament_id = v_tid
                         and jsonb_array_length(coalesce(e.state->'initialSquad', '[]'::jsonb)) = 10)
       and not exists (select 1 from public.notification_log l where l.user_id = u.id and l.tournament_id = v_tid
                         and l.kind = case when p_now >= s.locks_at - interval '2 hours' then 'draft_lock' else 'draft_open' end);
    return;
  end if;

  if s.phase <> 'open' then return; end if;
  -- One email per round: the "open" one only while the lock is more than 2.5 hours away, so nobody
  -- gets "it's open" and "it locks soon" in the same half hour.
  return query
  with mgr as (
    select e.user_id, e.squad,
           array(select x from unnest(e.squad) x where exists (
                   select 1 from public.matches m where m.tournament_id = v_tid
                      and (m.p1_id = x or m.p2_id = x) and m.winner_id is not null and m.winner_id <> x)) as out_ids,
           greatest(0, 10 - coalesce(array_length(e.squad, 1), 0)) as empty_slots,
           public.max_transfers_for(v_tid) - (
             select count(*) from jsonb_array_elements(coalesce(e.state->'transfers', '[]'::jsonb)) t
              where exists (select 1 from public.matches m where m.tournament_id = v_tid
                               and (m.p1_id = t->>'out' or m.p2_id = t->>'out')))::int as transfers_left
      from public.entries e
     where e.tournament_id = v_tid
       and jsonb_array_length(coalesce(e.state->'initialSquad', '[]'::jsonb)) = 10
  ), due as (
    select mgr.*, case when p_now >= s.locks_at - interval '2 hours' then 'market_lock'
                       when p_now <  s.locks_at - interval '150 minutes' then 'market_open' end as k
      from mgr
     where (coalesce(array_length(mgr.out_ids, 1), 0) > 0 or mgr.empty_slots > 0)
       and mgr.transfers_left > 0
  )
  select u.id, u.email::text, coalesce(np.locale, 'en'), d.k, v_tid, s.window_round, s.locks_at,
         array(select coalesce(ps.field_name, o) from unnest(d.out_ids) o
                 left join lateral (select f->>'name' as field_name
                                      from public.tournament_fields tf, jsonb_array_elements(tf.field) f
                                     where tf.tournament_id = v_tid and f->>'id' = o limit 1) ps on true),
         d.empty_slots, d.transfers_left, p.team_name
    from due d
    join auth.users u on u.id = d.user_id
    left join public.notification_prefs np on np.user_id = u.id
    left join public.profiles p on p.id = u.id
   where d.k is not null
     and u.email is not null
     and coalesce(np.email_reminders, true)
     and not exists (select 1 from public.notification_log l where l.user_id = u.id and l.tournament_id = v_tid
                       and l.kind = d.k and l.round = s.window_round);
end $$;
revoke all on function public.notification_candidates(timestamptz) from public, anon, authenticated;
grant execute on function public.notification_candidates(timestamptz) to service_role;

commit;

-- ── schedule (NOT run by applying this file) ──────────────────────────────────────────────────
-- Every 10 minutes, the same Vault-key pattern as the other jobs (see setup_scoring_cron.sql):
--
-- select cron.schedule('send-notifications', '*/10 * * * *', $$
--   select net.http_post(
--     url     := 'https://mrdmlfumdsxufifjulbt.supabase.co/functions/v1/send-notifications',
--     headers := jsonb_build_object('Content-Type', 'application/json',
--                  'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets
--                                                  where name = 'service_role_key')),
--     body    := '{}'::jsonb);
-- $$);
--
-- Going live, in order: apply this file → deploy the two edge functions → set their secrets
-- (RESEND_API_KEY, NOTIFY_FROM, NOTIFY_UNSUB_SECRET, PUBLIC_APP_URL) → notify_mode = 'dry_run' for one
-- market window and read notification_log → notify_mode = 'live'.

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- begin;
--   select cron.unschedule('send-notifications');   -- only if it was scheduled
--   drop function if exists public.notification_candidates(timestamptz);
--   drop function if exists public.market_state(text, timestamptz);
--   drop function if exists public.notification_failed(uuid, text, text, text, text);
--   drop function if exists public.claim_notification(uuid, text, text, text, boolean);
--   drop function if exists public.unsubscribe_reminders(uuid);
--   drop function if exists public.set_notification_prefs(boolean, text);
--   drop table if exists public.notification_log;
--   drop table if exists public.notification_prefs;
--   delete from public.app_config where key = 'notify_mode';
-- commit;
