-- ── The scoring squad can never be illegal, whatever writes it (2026-08-19) ──────────────────────
-- APPLIED TO PRODUCTION. Kept here for version control and re-application.
--
-- THE HOLE. recompute-score scores EXCLUSIVELY off state.initialSquad and explicitly never falls
-- back to myTeam. That array was validated NOWHERE: every gate in save_entry read v_squad, built
-- from myTeam, while the insert stored p_state verbatim. A caller could send a perfectly legal
-- 10-player myTeam through the front door and attach an initialSquad naming all 96 entrants — no
-- size cap, no budget, no tier quota, not even a check the ids were real. That squad owns the
-- winner of every match in every round: ~328 points against ~86 for the best legal squad, ~3.8x.
--
-- WHY A TRIGGER AND NOT ONLY THE INLINE CHECK IN save_entry. Both exist, and they do different
-- jobs. The inline check gives a friendly, early error on the sanctioned path. THIS is the
-- guarantee: it holds for any write path, and it survives someone re-applying an older copy of
-- save_entry_rpc.sql — not hypothetical, since that function is embedded verbatim inside
-- apply_step2_step3_atomic.sql, which is documented as idempotent and safe to re-run. A stale copy
-- of the function would silently reopen the hole; it cannot get past this.
--
-- Constraint at the data layer, friendly message at the API layer.
--
-- STRUCTURAL RULES ONLY — size, duplicates, known ids, tier, price. No results data is consulted,
-- so this can never false-reject because the feed is a few minutes behind the client.
--
-- VERIFIED AGAINST PRODUCTION BEFORE AND AFTER APPLYING:
--   • All 8 live Cincinnati entries pass. The 4 locked squads are 10 distinct, 0 unknown, exactly
--     2/3/5, at $149M / $150M / $150M / $150M. The 4 unlocked hold an empty initialSquad and return
--     early. Nobody is rejected.
--   • Exploit rehearsed in a rolled-back transaction: a 96-player initialSquad was refused with
--     'Your drafted squad must be exactly 10 players (got 96)', while a legitimate re-save of the
--     real stored state was accepted.

create or replace function public.guard_initial_squad() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  v_init text[];
  v_n int; v_distinct int; v_unknown int;
  v_plat int; v_gold int; v_silv int; v_cost int;
begin
  v_init := array(select jsonb_array_elements_text(coalesce(new.state->'initialSquad', '[]'::jsonb)));
  v_n := coalesce(array_length(v_init, 1), 0);
  if v_n = 0 then return new; end if;   -- still drafting: nothing frozen yet

  select count(distinct x) into v_distinct from unnest(v_init) x;
  if v_distinct <> v_n then
    raise exception 'Your drafted squad has duplicate players';
  end if;
  if v_n <> 10 then
    raise exception 'Your drafted squad must be exactly 10 players (got %)', v_n;
  end if;

  select count(*) into v_unknown from unnest(v_init) sid
   where not exists (select 1 from public.player_stats ps
                      where ps.id = sid and ps.tournament_id = new.tournament_id);
  if v_unknown > 0 then
    raise exception 'Your drafted squad contains % unknown player(s)', v_unknown;
  end if;

  select count(*) filter (where ps.tier = 'Platinum'),
         count(*) filter (where ps.tier = 'Gold'),
         count(*) filter (where ps.tier = 'Silver'),
         coalesce(sum(ps.price), 0)
    into v_plat, v_gold, v_silv, v_cost
    from unnest(v_init) sid
    join public.player_stats ps on ps.id = sid and ps.tournament_id = new.tournament_id;

  if v_plat <> 2 or v_gold <> 3 or v_silv <> 5 then
    raise exception 'Your drafted squad must be exactly 2 Platinum, 3 Gold, 5 Silver (got %/%/%)',
      v_plat, v_gold, v_silv;
  end if;
  -- STRICTLY greater than. Three of the four live managers are sitting on exactly $150M; >= would
  -- lock them out of their own entries on their next save.
  if v_cost > 150 then
    raise exception 'Your drafted squad costs $%M, over the $150M budget', v_cost;
  end if;

  return new;
end;
$fn$;

drop trigger if exists trg_guard_initial_squad on public.entries;
create trigger trg_guard_initial_squad
  before insert or update on public.entries
  for each row execute function public.guard_initial_squad();

revoke all on function public.guard_initial_squad() from public, anon, authenticated;
