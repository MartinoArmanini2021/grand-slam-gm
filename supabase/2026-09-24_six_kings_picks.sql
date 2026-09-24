-- =====================================================================================================
-- Six Kings Slam picks — a small side game, separate from the main game
-- Written 2026-09-24 (Martino chose "a simple picks page in the app"; plan approved the same day).
-- The Six Kings Slam 2026: Riyadh, 21, 22 and 24 Oct (23 is a rest day); six players, six matches (two
-- quarter-finals with the top two seeds on a bye, two semi-finals, a third-place match, the final).
--
-- THE GAME. Pick the winner of every match; a day's picks lock at its first ball. A correct pick scores
-- the main game's round points (QF 8 · SF 13 · third place 8 · F 20) times the main game's upset bonus.
-- Scores are NOT stored here: the app works them out from the picks and the results, so there is no
-- score to fake. Nothing here touches the main game (entries, save_entry, market_check, the scorer).
--
-- WHAT IS HERE
--   public.pick_players   the event's players (name, flag, ATP rank for the upset bonus, ATP id for photos)
--   public.pick_matches   the six matches; players 'tbd' until known; starts_at = the lock
--   public.picks          one row per manager per match
--   public.save_pick()    the ONLY write path for managers: SECURITY DEFINER, like save_entry
-- Security mirrors public.matches: RLS on everywhere, SELECT-only grants for the client roles (Supabase's
-- default privileges would otherwise hand them INSERT/UPDATE/DELETE/TRUNCATE; RLS does not govern
-- TRUNCATE). A manager's picks are private until that match starts, so nobody can copy them; after the
-- start everyone can see them (like squads after the lock).
--
-- OPERATIONS (by hand, SQL editor or the MCP, a few minutes each) — see the DATA section at the bottom:
--   · load the six players now (ranks refreshed before Day 1: they feed the upset bonus);
--   · load the six matches when the bracket is announced, starts_at = each day's first ball (early floor,
--     pinned the evening before; Riyadh = UTC+3);
--   · after each match: set winner_id + score_line, and move the winner (or, for third place, the loser)
--     into the next match's 'tbd' slot.
--
-- Tests: supabase/six_kings_picks_tests.sql (a rolled-back transaction that poses as two managers).
-- =====================================================================================================

-- PRE-CHECK (read-only)
select to_regclass('public.pick_players') is null  as players_absent,    -- expect true
       to_regclass('public.pick_matches') is null  as matches_absent,    -- expect true
       to_regclass('public.picks') is null         as picks_absent,      -- expect true
       to_regprocedure('public.save_pick(text,integer,text)') is null as fn_absent;  -- expect true

-- =====================================================================================================
-- UP — one transaction
-- =====================================================================================================
begin;

create table public.pick_players (
  event_id text not null,
  id       text not null,
  name     text not null,
  country  text,            -- IOC code
  flag     text,            -- emoji
  atp_rank int,             -- feeds the upset bonus: refresh before the first match
  atp_id   text,            -- ATP headshot id
  primary key (event_id, id)
);

create table public.pick_matches (
  event_id   text not null,
  match_no   int  not null,
  round      text not null check (round in ('QF', 'SF', '3P', 'F')),
  p1_id      text not null default 'tbd',
  p2_id      text not null default 'tbd',
  winner_id  text,
  score_line text,
  starts_at  timestamptz,   -- the lock: that day's first ball
  primary key (event_id, match_no),
  constraint pick_matches_winner_in_pair check (winner_id is null or winner_id in (p1_id, p2_id))
);

create table public.picks (
  event_id   text        not null,
  user_id    uuid        not null,
  match_no   int         not null,
  player_id  text        not null,
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id, match_no),
  foreign key (event_id, match_no) references public.pick_matches (event_id, match_no)
);

comment on table public.picks is
  'Six Kings Slam style side game: one pick per manager per match. Written only by save_pick(); readable by '
  'its owner, and by everyone once that match has started.';

alter table public.pick_players enable row level security;
alter table public.pick_matches enable row level security;
alter table public.picks        enable row level security;

create policy "pick_players readable" on public.pick_players for select to anon, authenticated using (true);
create policy "pick_matches readable" on public.pick_matches for select to anon, authenticated using (true);
create policy "picks readable once the match starts" on public.picks for select to anon, authenticated
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.pick_matches m
                where m.event_id = picks.event_id and m.match_no = picks.match_no
                  and m.starts_at is not null and m.starts_at <= now())
  );

revoke all on public.pick_players, public.pick_matches, public.picks from anon, authenticated;
grant select on public.pick_players, public.pick_matches, public.picks to anon, authenticated;

create or replace function public.save_pick(p_event text, p_match int, p_player text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  m public.pick_matches%rowtype;
begin
  if v_uid is null then raise exception 'Sign in to make a pick'; end if;

  select * into m from public.pick_matches where event_id = p_event and match_no = p_match;
  if not found then raise exception 'No such match'; end if;
  if m.p1_id = 'tbd' or m.p2_id = 'tbd' then
    raise exception 'The players for this match are not known yet';
  end if;
  if m.starts_at is null then raise exception 'This match has no start time yet'; end if;
  if now() >= m.starts_at then raise exception 'Picks for this match are closed — play has started'; end if;
  if m.winner_id is not null then raise exception 'This match is already decided'; end if;
  if p_player is null or p_player not in (m.p1_id, m.p2_id) then
    raise exception 'Pick one of the two players in this match';
  end if;

  insert into public.picks (event_id, user_id, match_no, player_id)
  values (p_event, v_uid, p_match, p_player)
  on conflict (event_id, user_id, match_no)
  do update set player_id = excluded.player_id, updated_at = now();
end;
$$;

revoke all on function public.save_pick(text, int, text) from public, anon;
grant execute on function public.save_pick(text, int, text) to authenticated;

commit;

-- VERIFY (read-only)
select t.relname, t.relrowsecurity as rls_on,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = t.relname) as policies,
       has_table_privilege('anon', t.oid, 'SELECT')          as anon_select,       -- expect true
       has_table_privilege('anon', t.oid, 'INSERT')          as anon_insert,       -- expect false
       has_table_privilege('authenticated', t.oid, 'INSERT') as auth_insert,       -- expect false
       has_table_privilege('authenticated', t.oid, 'UPDATE') as auth_update,       -- expect false
       has_table_privilege('anon', t.oid, 'TRUNCATE')        as anon_truncate      -- expect false
  from pg_class t
 where t.oid in ('public.pick_players'::regclass, 'public.pick_matches'::regclass, 'public.picks'::regclass);
select has_function_privilege('anon', 'public.save_pick(text,integer,text)', 'EXECUTE')          as anon_exec,  -- expect false
       has_function_privilege('authenticated', 'public.save_pick(text,integer,text)', 'EXECUTE') as auth_exec;  -- expect true

-- =====================================================================================================
-- DATA — the event itself (event id 'sixkings_2026')
-- =====================================================================================================
-- Players: provisional ranks = the order of the ATP ranking of 22 Sep 2026 (the Shanghai projected seeds:
-- Sinner 1, Zverev 2, Alcaraz 3, de Minaur 10, Djokovic 11, Fritz 12). REFRESH them before Day 1:
--   update public.pick_players set atp_rank = <n> where event_id = 'sixkings_2026' and id = '<id>';
-- insert into public.pick_players (event_id, id, name, country, flag, atp_rank, atp_id) values
--   ('sixkings_2026', 'sinner',   'Jannik Sinner',    'ITA', '🇮🇹', 1,  'S0AG'),
--   ('sixkings_2026', 'zverev',   'Alexander Zverev', 'GER', '🇩🇪', 2,  'Z355'),
--   ('sixkings_2026', 'alcaraz',  'Carlos Alcaraz',   'ESP', '🇪🇸', 3,  'A0E2'),
--   ('sixkings_2026', 'deminaur', 'Alex de Minaur',   'AUS', '🇦🇺', 10, 'DH58'),
--   ('sixkings_2026', 'djokovic', 'Novak Djokovic',   'SRB', '🇷🇸', 11, 'D643'),
--   ('sixkings_2026', 'fritz',    'Taylor Fritz',     'USA', '🇺🇸', 12, 'FB98');
--
-- Matches (when the bracket is announced; example shape — the two byes and pairings come from the bracket):
-- insert into public.pick_matches (event_id, match_no, round, p1_id, p2_id, starts_at) values
--   ('sixkings_2026', 1, 'QF', '<a>',   '<b>', '2026-10-21T<hh>:00:00Z'),
--   ('sixkings_2026', 2, 'QF', '<c>',   '<d>', '2026-10-21T<hh>:00:00Z'),
--   ('sixkings_2026', 3, 'SF', '<bye1>', 'tbd', '2026-10-22T<hh>:00:00Z'),
--   ('sixkings_2026', 4, 'SF', '<bye2>', 'tbd', '2026-10-22T<hh>:00:00Z'),
--   ('sixkings_2026', 5, '3P', 'tbd',   'tbd', '2026-10-24T<hh>:00:00Z'),
--   ('sixkings_2026', 6, 'F',  'tbd',   'tbd', '2026-10-24T<hh>:00:00Z');
-- After a match:
--   update public.pick_matches set winner_id = '<id>', score_line = '6-4 7-5'
--    where event_id = 'sixkings_2026' and match_no = <n>;
--   update public.pick_matches set p2_id = '<winner>' where event_id = 'sixkings_2026' and match_no = <next>;

-- =====================================================================================================
-- ROLLBACK — display-only side game; dropping loses the picks, nothing in the main game.
-- =====================================================================================================
-- drop function if exists public.save_pick(text, int, text);
-- drop table if exists public.picks;
-- drop table if exists public.pick_matches;
-- drop table if exists public.pick_players;
