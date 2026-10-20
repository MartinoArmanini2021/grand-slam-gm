-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- The weekly growth scorecard (Road to 500). READ-ONLY: every statement is a SELECT. Paste into the
-- Supabase SQL editor (or ask Claude to run it) once a week.
--
-- "Founding" managers = accounts created before 20 Oct 2026, the day the growth plan started (the 26
-- friends and family). Everyone after is a "new" manager, the number the plan is really about.
-- Section 1 needs supabase/2026-10-20_signup_source.sql applied; before that it shows one
-- "(not tracked yet)" line.
-- The visitors and "active on a day of play" numbers live in PostHog (only for visitors who allow
-- analytics); the HogQL is at the bottom.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

-- 0. The headline: accounts, new accounts, and squads in the active tournament
with f as (select timestamptz '2026-10-20 00:00+00' as since),
     t as (select public.active_tournament_id() as tid)
select
  (select count(*) from auth.users)                                                        as accounts,
  (select count(*) from auth.users, f where created_at >= f.since)                          as new_accounts,
  (select count(*) from auth.users where created_at >= now() - interval '7 days')           as signups_7d,
  (select count(*) from public.entries e, t where e.tournament_id = t.tid
     and jsonb_array_length(coalesce(e.state->'initialSquad','[]'::jsonb)) = 10)            as squads_now,
  (select count(*) from public.entries e, t, f where e.tournament_id = t.tid
     and jsonb_array_length(coalesce(e.state->'initialSquad','[]'::jsonb)) = 10
     and exists (select 1 from auth.users u where u.id = e.user_id and u.created_at >= f.since)) as new_squads_now,
  (select tid from t)                                                                       as tournament;

-- 1. Sign-ups and squads by source (which club, creator or post brought them)
select coalesce(p.signup_source,
         case when to_regclass('public.growth_by_source') is null then '(not tracked yet)' else '(no tag)' end) as source,
       count(*) as signups,
       count(*) filter (where exists (select 1 from public.entries e where e.user_id = p.id
                          and jsonb_array_length(coalesce(e.state->'initialSquad','[]'::jsonb)) = 10)) as drafted_any
  from public.profiles p
 where p.created_at >= timestamptz '2026-10-20 00:00+00'
 group by 1 order by 2 desc;

-- 2. Sign-ups per week (Monday weeks, UTC) and how many of them drafted
select date_trunc('week', u.created_at)::date as week,
       count(*) as signups,
       count(*) filter (where exists (select 1 from public.entries e where e.user_id = u.id
                          and jsonb_array_length(coalesce(e.state->'initialSquad','[]'::jsonb)) = 10)) as drafted
  from auth.users u
 group by 1 order by 1;

-- 3. Activation: of the accounts made in the last 30 days, how many drafted a squad
select count(*) as signups_30d,
       count(*) filter (where exists (select 1 from public.entries e where e.user_id = u.id
                          and jsonb_array_length(coalesce(e.state->'initialSquad','[]'::jsonb)) = 10)) as drafted,
       round(100.0 * count(*) filter (where exists (select 1 from public.entries e where e.user_id = u.id
                          and jsonb_array_length(coalesce(e.state->'initialSquad','[]'::jsonb)) = 10)) / nullif(count(*), 0), 1) as pct
  from auth.users u where u.created_at >= now() - interval '30 days';

-- 4. Come back: of each tournament's managers, how many drafted again in a later one
with m as (
  select e.user_id, e.tournament_id, min(e.updated_at) as at
    from public.entries e
   where jsonb_array_length(coalesce(e.state->'initialSquad','[]'::jsonb)) = 10
   group by 1, 2),
ordered as (select tournament_id, min(at) as start from m group by 1)
select a.tournament_id as tournament,
       count(distinct a.user_id) as managers,
       count(distinct a.user_id) filter (where exists (
         select 1 from m b join ordered ob on ob.tournament_id = b.tournament_id
          where b.user_id = a.user_id and ob.start > oa.start)) as came_back,
       round(100.0 * count(distinct a.user_id) filter (where exists (
         select 1 from m b join ordered ob on ob.tournament_id = b.tournament_id
          where b.user_id = a.user_id and ob.start > oa.start)) / nullif(count(distinct a.user_id), 0), 1) as pct
  from m a join ordered oa on oa.tournament_id = a.tournament_id
 group by a.tournament_id, oa.start order by oa.start;
-- NB entries.updated_at is rewritten by the scorer, so "start" is approximate; it only orders events.

-- 5. Leagues: private leagues, members, and invites that worked (invited_by needs 2026-10-20_invites.sql)
select (select count(*) from public.leagues where not is_public) as private_leagues,
       (select count(*) from public.league_members m join public.leagues l on l.id = m.league_id where not l.is_public) as memberships,
       (select count(*) from public.league_members m where m.joined_at >= now() - interval '7 days') as joins_7d;

-- ── PostHog (HogQL, project 534282): visitors and daily activity ─────────────────────────────────
-- Visitors per week (front page + app), consented visitors only since the banner:
--   select toStartOfWeek(timestamp, 1) as week, count(distinct distinct_id) as visitors
--     from events where event in ('screen_view', '$pageview') group by week order by week
-- Active managers per day of play (managers = signed-in distinct_ids):
--   select toDate(timestamp) as day, count(distinct person_id) as active
--     from events where event = 'screen_view' and person.properties.$user_id is not null
--    group by day order by day
-- Growth actions in the last 7 days:
--   select event, count() from events
--    where event in ('invite_shared','invite_copied','invite_opened','invite_signup_started',
--                    'squad_card_shared','quick_pick','language_changed','season_table_opened')
--      and timestamp > now() - interval 7 day group by event order by count() desc
