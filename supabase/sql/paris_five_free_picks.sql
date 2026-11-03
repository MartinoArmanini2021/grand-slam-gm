-- Paris 2026 from the Last 16: FIVE players, any mix, $100M (owner, 3 Nov 2026: "buy 5 players with the
-- budget that you have, free from any limitations of tier"). Replaces the 10-player 2/3/5 regroup of
-- paris_regroup_last16.sql for this event; every other tournament keeps 10 players at 2/3/5.
--
-- Simulated before the switch (18,000 Last 16 tournaments, 30 managers each): two squads share about 2
-- players instead of 7, two in three of all possible fives fit the budget, no way of picking wins most
-- of the time.
--
-- 1. squad_size_for / tier_quotas_apply: the event's squad shape, one place.
-- 2. budget_for('paris_2026') = 100.
-- 3. save_entry, guard_initial_squad, market_check read the shape instead of 10 and 2/3/5. Edited in
--    place from the live definitions, each edit matched exactly once or the migration stops.
-- 4. paris_regroup_last16 (the trigger on matches) no longer regroups: the 16 keep their groups as
--    labels, and their prices are scaled by one common factor so $100M sits halfway between the
--    cheapest and the dearest five: f = 200 / (cheapest five + dearest five). Every run is written
--    to paris_reprice_log (ok or not), so a failure is never only a line in the Postgres log.
-- 5. From the independent review (3 Nov): guard_initial_squad no longer re-checks a squad whose
--    initialSquad did not change (a corrected pairing after squads open can move prices, and the
--    re-check on the scorer's bulk UPDATE would have aborted scoring for everyone); a free-pick
--    draft takes only players with a match in the event (the 40 knocked out before the Last 16 are
--    in player_stats too); growth_by_source and notification_candidates count the event's squad
--    size instead of 10.

create or replace function public.squad_size_for(p_tournament text)
returns integer language sql immutable parallel safe as $$
  select case when p_tournament = 'paris_2026' then 5 else 10 end;
$$;

create or replace function public.tier_quotas_apply(p_tournament text)
returns boolean language sql immutable parallel safe as $$
  select p_tournament is distinct from 'paris_2026';
$$;

create or replace function public.budget_for(p_tournament text)
returns numeric language sql immutable parallel safe as $$
  select (case when p_tournament in ('montreal_2026', 'cincinnati_2026', 'usopen_2026') then 150
               when p_tournament = 'paris_2026' then 100
               else 200 end)::numeric;
$$;

-- Refunds in full: with five players and only the dearest left after the Last 16, a 30% refund
-- almost never pays for anyone still in the draw (simulated: 0.7 of the 5 transfers used per manager;
-- in full: 2.7, and the winner still leads the middle of the table by ~33 points).
create or replace function public.refund_fraction_for(p_tournament text, p_round text)
returns numeric language sql immutable parallel safe as $$
  select (case
    when p_tournament in ('montreal_2026', 'cincinnati_2026', 'usopen_2026') then
      case p_round when 'R128' then 0.75 when 'R64' then 0.70 when 'R32' then 0.55
                   when 'R16' then 0.40 when 'QF' then 0.25 else 0 end
    when p_tournament = 'paris_2026' then 1.0
    else
      case p_round when 'R128' then 0.60 when 'R64' then 0.55 when 'R32' then 0.45
                   when 'R16' then 0.30 when 'QF' then 0.15 else 0 end
  end)::numeric;
$$;

create or replace function pg_temp.once(p_src text, p_old text, p_new text, p_what text)
returns text language plpgsql as $$
declare n int := (length(p_src) - length(replace(p_src, p_old, ''))) / length(p_old);
begin
  if n <> 1 then raise exception 'paris_five_free_picks: % matched % times, expected once', p_what, n; end if;
  return replace(p_src, p_old, p_new);
end $$;

do $mig$
declare d text;
begin
  -- save_entry
  d := pg_get_functiondef('public.save_entry(text,uuid,jsonb,bigint)'::regprocedure);
  d := pg_temp.once(d,
    $o$if v_size > 10 then raise exception 'Squad can''t exceed 10 players (got %)', v_size; end if;$o$,
    $n$if v_size > public.squad_size_for(p_tournament) then raise exception 'Squad can''t exceed % players (got %)', public.squad_size_for(p_tournament), v_size; end if;$n$,
    'save_entry size cap');
  d := pg_temp.once(d,
    $o$if v_plat > 2 or v_gold > 3 or v_silv > 5 then$o$,
    $n$if public.tier_quotas_apply(p_tournament) and (v_plat > 2 or v_gold > 3 or v_silv > 5) then$n$,
    'save_entry tier cap');
  d := pg_temp.once(d,
    $o$if v_locked and v_size <> 10 then$o$,
    $n$if not public.tier_quotas_apply(p_tournament) and exists (select 1 from unnest(v_squad) sid
        where not exists (select 1 from public.matches m where m.tournament_id = p_tournament
                            and (m.p1_id = sid or m.p2_id = sid))) then
      raise exception 'Pick only players still in the draw';
    end if;
    if v_locked and v_size <> public.squad_size_for(p_tournament) then$n$,
    'save_entry lock size');
  d := pg_temp.once(d,
    $o$'Your squad must be exactly 10 players to lock (got %)', v_size;$o$,
    $n$'Your squad must be exactly % players to lock (got %)', public.squad_size_for(p_tournament), v_size;$n$,
    'save_entry lock size message');
  d := pg_temp.once(d,
    $o$if v_locked and (v_plat <> 2 or v_gold <> 3 or v_silv <> 5) then$o$,
    $n$if v_locked and public.tier_quotas_apply(p_tournament) and (v_plat <> 2 or v_gold <> 3 or v_silv <> 5) then$n$,
    'save_entry lock tiers');
  execute d;

  -- guard_initial_squad
  d := pg_get_functiondef('public.guard_initial_squad()'::regprocedure);
  d := pg_temp.once(d,
    $o$  if v_n = 0 then return new; end if;$o$,
    $n$  if v_n = 0 then return new; end if;
  -- An UPDATE that leaves the drafted squad as it was (the scorer, an armband or transfer save)
  -- passed this check when the squad was drafted: prices may have moved since, never re-judge it.
  if tg_op = 'UPDATE' and new.state->'initialSquad' is not distinct from old.state->'initialSquad' then
    return new;
  end if;$n$,
    'guard unchanged squad');
  d := pg_temp.once(d,
    $o$if v_n <> 10 then$o$,
    $n$if v_n <> public.squad_size_for(new.tournament_id) then$n$,
    'guard size');
  d := pg_temp.once(d,
    $o$'Your drafted squad must be exactly 10 players (got %)', v_n;$o$,
    $n$'Your drafted squad must be exactly % players (got %)', public.squad_size_for(new.tournament_id), v_n;$n$,
    'guard size message');
  d := pg_temp.once(d,
    $o$if v_plat <> 2 or v_gold <> 3 or v_silv <> 5 then$o$,
    $n$if public.tier_quotas_apply(new.tournament_id) and (v_plat <> 2 or v_gold <> 3 or v_silv <> 5) then$n$,
    'guard tiers');
  execute d;

  -- market_check
  d := pg_get_functiondef('public.market_check(text,jsonb,jsonb,timestamptz)'::regprocedure);
  d := pg_temp.once(d,
    $o$if coalesce(array_length(v_team, 1), 0) > 10 then return public.market_err('Squad can''t exceed 10 players'); end if;$o$,
    $n$if coalesce(array_length(v_team, 1), 0) > public.squad_size_for(p_tournament) then return public.market_err(format('Squad can''t exceed %s players', public.squad_size_for(p_tournament))); end if;$n$,
    'market_check size cap');
  d := pg_temp.once(d,
    $o$if v_plat > 2 or v_gold > 3 or v_silv > 5 then$o$,
    $n$if public.tier_quotas_apply(p_tournament) and (v_plat > 2 or v_gold > 3 or v_silv > 5) then$n$,
    'market_check tier cap');
  execute d;

  -- notification_candidates (dormant while notify_mode = 'off'): the event's squad size
  d := pg_get_functiondef('public.notification_candidates(timestamptz)'::regprocedure);
  if (length(d) - length(replace(d, $o$jsonb_array_length(coalesce(e.state->'initialSquad', '[]'::jsonb)) = 10$o$, ''))) = 0 then
    raise exception 'paris_five_free_picks: notification_candidates squad test not found';
  end if;
  d := replace(d, $o$jsonb_array_length(coalesce(e.state->'initialSquad', '[]'::jsonb)) = 10$o$,
                  $n$jsonb_array_length(coalesce(e.state->'initialSquad', '[]'::jsonb)) = public.squad_size_for(v_tid)$n$);
  d := pg_temp.once(d, $o$'{}'::text[], 10, public.max_transfers_for(v_tid)$o$,
                       $n$'{}'::text[], public.squad_size_for(v_tid), public.max_transfers_for(v_tid)$n$, 'notify draft slots');
  d := pg_temp.once(d, $o$greatest(0, 10 - coalesce(array_length(e.squad, 1), 0))$o$,
                       $n$greatest(0, public.squad_size_for(v_tid) - coalesce(array_length(e.squad, 1), 0))$n$, 'notify empty slots');
  execute d;
end $mig$;

create or replace view public.growth_by_source as
 SELECT COALESCE(signup_source, '(before tracking)'::text) AS source,
    count(*) AS signups,
    count(*) FILTER (WHERE (EXISTS ( SELECT 1
           FROM entries e
          WHERE e.user_id = p.id AND jsonb_array_length(COALESCE(e.state -> 'initialSquad'::text, '[]'::jsonb)) = public.squad_size_for(e.tournament_id)))) AS drafted,
    min(created_at) AS first_signup,
    max(created_at) AS last_signup
   FROM profiles p
  GROUP BY (COALESCE(signup_source, '(before tracking)'::text));

-- every reprice run, ok or not (read it on Wed night; never exposed to the app)
create table if not exists public.paris_reprice_log (
  at timestamptz not null default now(),
  ok boolean not null,
  note text not null
);
alter table public.paris_reprice_log enable row level security;
revoke all on public.paris_reprice_log from public, anon, authenticated;

-- the Last 16 reprice: same guards as before (all eight pairings known, nothing started, still the
-- draft), computed from the snapshot so a rerun changes nothing and a corrected pairing recomputes.
create or replace function public.paris_regroup_last16()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  begin
    if now() < (select p.first_ball from public.round_plan p where p.tournament_id = 'paris_2026' and p.round = 'R16')
       and (select count(*) from public.matches m where m.tournament_id = 'paris_2026' and m.round = 'R16'
              and m.p1_id <> 'tbd' and m.p2_id <> 'tbd') = 8
       and (select s.phase from public.market_state('paris_2026', now()) s) = 'draft' then
      select count(*) into v_n from public.paris_last16_original o
       where o.id in (select m.p1_id from public.matches m where m.tournament_id = 'paris_2026' and m.round = 'R16'
                      union select m.p2_id from public.matches m where m.tournament_id = 'paris_2026' and m.round = 'R16');
      if v_n <> 16 then
        raise warning 'paris_regroup_last16: % of the 16 Last 16 players are known, nothing changed', v_n;
        insert into public.paris_reprice_log (ok, note)
          values (false, format('%s of the 16 Last 16 players are in the snapshot: prices unchanged', v_n));
      else
        with r16 as (
          select m.p1_id as id from public.matches m where m.tournament_id = 'paris_2026' and m.round = 'R16'
          union select m.p2_id from public.matches m where m.tournament_id = 'paris_2026' and m.round = 'R16'
        ), q as (
          select o.id, o.price,
                 row_number() over (order by o.price, o.id) as ra,
                 row_number() over (order by o.price desc, o.id) as rd
            from public.paris_last16_original o where o.id in (select id from r16)
        ), f as (
          select 200.0 / (sum(q.price) filter (where q.ra <= 5) + sum(q.price) filter (where q.rd <= 5)) as f
            from q
        ), target as (
          -- NB not coalesce(greatest(1, ...), o.price): greatest() skips nulls, so an empty q row gave 1
          select o.id, o.tier,
                 case when q.id is null then o.price else greatest(1, round(q.price * f.f))::int end as price
            from public.paris_last16_original o left join q on q.id = o.id cross join f
        )
        update public.player_stats ps set tier = t.tier, price = t.price
          from target t
         where ps.tournament_id = 'paris_2026' and ps.id = t.id
           and (ps.tier, ps.price) is distinct from (t.tier, t.price);
        get diagnostics v_n = row_count;
        if v_n > 0 then
          insert into public.paris_reprice_log (ok, note)
            select true, format('%s prices set; cheapest five $%sM, dearest five $%sM', v_n,
                     (select sum(price) from (select ps.price from public.player_stats ps join public.matches m
                        on m.tournament_id = 'paris_2026' and m.round = 'R16' and ps.id in (m.p1_id, m.p2_id)
                       where ps.tournament_id = 'paris_2026' order by ps.price limit 5) a),
                     (select sum(price) from (select ps.price from public.player_stats ps join public.matches m
                        on m.tournament_id = 'paris_2026' and m.round = 'R16' and ps.id in (m.p1_id, m.p2_id)
                       where ps.tournament_id = 'paris_2026' order by ps.price desc limit 5) b));
        end if;
      end if;
    end if;
  exception when others then
    raise warning 'paris_regroup_last16: %', sqlerrm;
    begin
      insert into public.paris_reprice_log (ok, note) values (false, 'reprice failed: ' || sqlerrm);
    exception when others then null;
    end;
  end;
  return null;
end $$;

revoke all on function public.paris_regroup_last16() from public, anon, authenticated;

-- After Paris: drop trigger paris_regroup_last16 on public.matches;
--              drop function public.paris_regroup_last16(); drop table public.paris_last16_original;
--              squad_size_for / tier_quotas_apply / budget_for stay (they pin Paris's shape for the scorer).
