-- Paris 2026 from the Last 16 (owner, 3 Nov 2026). When squads open, the 16 players left are
-- 1. REGROUPED by ATP ranking among themselves: best 4 Platinum, next 5 Gold, last 7 Silver (the squad
--    is still 2 Platinum, 3 Gold, 5 Silver). With the usual groups (ATP top 10 / 11–25 / 26+) the
--    favourites winning leaves 8 Platinum, 3 Gold and 5 Silver: every squad would hold the same 8.
-- 2. REPRICED by one common factor, so the $200M budget sits halfway between the cheapest and the
--    dearest squad that can be built from them: f = 400 / (cheapest + dearest), each price rounded to
--    a whole $M (at least 1). The 16 left are the expensive players: with the favourites through, the
--    cheapest squad at the usual prices is $216M, over the budget. Stress-tested on 200,000 random
--    line-ups: the cheapest squad always fits under $200M and the dearest never does.
--
-- Computed from a snapshot of the original groups and prices, so a second run changes nothing and a
-- corrected Last 16 pairing (before the lock) recomputes cleanly; a player who drops out of the 16
-- gets his original group and price back.
--
-- Runs after every write to matches, in the same transaction, so it lands in the same moment the
-- eighth Last 16 pairing is written (the moment the app opens squads). It does nothing unless all
-- eight pairings are known AND nothing has started: once squads lock the groups and prices must never
-- move (guard_initial_squad re-checks every drafted squad's 2/3/5 and cost on each save). A failure
-- only warns: it can never block the feed's write.

create table if not exists public.paris_last16_original (
  id text primary key,
  ranking integer not null,
  tier text not null,
  price integer not null
);
alter table public.paris_last16_original enable row level security;
revoke all on public.paris_last16_original from public, anon, authenticated;
insert into public.paris_last16_original (id, ranking, tier, price)
select id, ranking, tier, price from public.player_stats where tournament_id = 'paris_2026'
on conflict (id) do nothing;

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
      else
        with r16 as (
          select m.p1_id as id from public.matches m where m.tournament_id = 'paris_2026' and m.round = 'R16'
          union select m.p2_id from public.matches m where m.tournament_id = 'paris_2026' and m.round = 'R16'
        ), g as (
          select o.id, o.price,
                 case when row_number() over (order by o.ranking, o.id) <= 4 then 'Platinum'
                      when row_number() over (order by o.ranking, o.id) <= 9 then 'Gold'
                      else 'Silver' end as tier
            from public.paris_last16_original o where o.id in (select id from r16)
        ), q as (
          select g.*, case g.tier when 'Platinum' then 2 when 'Gold' then 3 else 5 end as quota,
                 row_number() over (partition by g.tier order by g.price, g.id) as ra,
                 row_number() over (partition by g.tier order by g.price desc, g.id) as rd
            from g
        ), f as (
          select 400.0 / (sum(q.price) filter (where q.ra <= q.quota) + sum(q.price) filter (where q.rd <= q.quota)) as f
            from q
        ), target as (
          -- NB not coalesce(greatest(1, ...), o.price): greatest() skips nulls, so an empty q row gave 1
          select o.id,
                 case when q.id is null then o.tier else q.tier end as tier,
                 case when q.id is null then o.price else greatest(1, round(q.price * f.f))::int end as price
            from public.paris_last16_original o left join q on q.id = o.id cross join f
        )
        update public.player_stats ps set tier = t.tier, price = t.price
          from target t
         where ps.tournament_id = 'paris_2026' and ps.id = t.id
           and (ps.tier, ps.price) is distinct from (t.tier, t.price);
      end if;
    end if;
  exception when others then
    raise warning 'paris_regroup_last16: %', sqlerrm;
  end;
  return null;
end $$;

revoke all on function public.paris_regroup_last16() from public, anon, authenticated;

drop trigger if exists paris_regroup_last16 on public.matches;
create trigger paris_regroup_last16 after insert or update on public.matches
  for each statement execute function public.paris_regroup_last16();

-- After Paris: drop trigger paris_regroup_last16 on public.matches;
--              drop function public.paris_regroup_last16(); drop table public.paris_last16_original;
