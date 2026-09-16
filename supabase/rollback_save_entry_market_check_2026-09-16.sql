-- ── ROLLBACK — production save_entry and market_check exactly as deployed on 2026-09-16 ──────────
--
-- Captured READ-ONLY with pg_get_functiondef on 2026-09-16 (export sprint, Session 7) from project
-- mrdmlfumdsxufifjulbt. These are the CURRENT production bodies: the basket market of 2 September
-- 2026 (basket_market_migration.sql plus the ambiguous-t fix) with the per-tournament economy of
-- 15 September 2026 (migration 20260915214823: budget_for / max_transfers_for, the lines marked ">>").
--
-- Fingerprints, as the database computes them (md5 of the exact text of each definition below):
--   save_entry    da7a3cd17681562333f285a4bf7bff0e   (7,982 characters)
--   market_check  1fc927743aeefa00ed9d1d9d4aa0df02   (11,100 characters)
-- Before relying on this file, compare against what is live:
--   select p.proname, md5(pg_get_functiondef(p.oid)), length(pg_get_functiondef(p.oid))
--     from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('save_entry', 'market_check');
-- Different fingerprints mean production has moved on since this capture: capture again, do not run this.
--
-- What running this does: restores BOTH functions to exactly these bodies, nothing else. It does not
-- create or touch budget_for, max_transfers_for, market_err or round_label, which these bodies call
-- and which must still exist. It supersedes rollback_job16_save_entry.sql (a 26 August capture,
-- pre-basket) — see the SUPERSEDED note at the top of that file.
--
-- Apply in the Supabase SQL editor as one script, only on Martino's word.

CREATE OR REPLACE FUNCTION public.save_entry(p_tournament text, p_league uuid, p_state jsonb, p_base_rev bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_squad text[];
  v_phase text := coalesce(p_state->>'phase', 'draft');
  v_locked boolean := (coalesce(p_state->>'phase', 'draft') <> 'draft');
  v_size int; v_distinct int; v_total numeric;
  v_plat int; v_gold int; v_silv int;
  v_existing public.entries%rowtype;
  v_found boolean;
  v_public uuid;
  r_round text; v_inc text; v_sto text;
  v_started text[];
  v_inc_init text[]; v_sto_init text[];
  v_chk jsonb;
  v_budget numeric;
  v_cashed jsonb;
  v_cap numeric := public.budget_for(p_tournament);                                     -- >> new
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  if not pg_try_advisory_xact_lock(hashtext('save_entry:' || v_uid::text)::bigint) then
    raise exception 'A save is already in progress for your account — converging' using errcode = '40001';
  end if;

  select id into v_public from public.leagues where is_public limit 1;
  if v_public is null then raise exception 'No public league configured'; end if;
  if p_league is distinct from v_public then raise exception 'Invalid league for this entry'; end if;

  v_squad := array(select jsonb_array_elements_text(coalesce(p_state->'myTeam', '[]'::jsonb)));
  v_size := coalesce(array_length(v_squad, 1), 0);
  v_distinct := (select count(distinct x) from unnest(v_squad) x);
  if v_distinct <> v_size then raise exception 'Squad has duplicate players'; end if;
  if v_size > 10 then raise exception 'Squad can''t exceed 10 players (got %)', v_size; end if;
  if exists (select 1 from unnest(v_squad) sid where not exists (
      select 1 from public.player_stats ps where ps.id = sid and ps.tournament_id = p_tournament)) then
    raise exception 'Squad contains an unknown player';
  end if;

  select * into v_existing from public.entries
    where user_id = v_uid and league_id = v_public and tournament_id = p_tournament for update;
  v_found := found;
  if v_found and v_existing.rev <> coalesce(p_base_rev, 0) then
    raise exception 'entry changed elsewhere' using errcode = '40001';
  end if;

  -- JOB 20: rounds that have BEGUN — a result exists, or the clock has passed a stamped start.
  v_started := array(select distinct m.round from public.matches m
    where m.tournament_id = p_tournament
      and (m.winner_id is not null or (m.started_at is not null and m.started_at <= now())));

  if coalesce(array_length(v_started, 1), 0) = 0 then
    -- DRAFT PHASE: nothing has begun. Shape rules only; nothing is sold or transferred yet.
    if jsonb_array_length(coalesce(p_state->'transfers', '[]'::jsonb)) > 0 then
      raise exception 'No transfers before the first ball';
    end if;
    select count(*) filter (where ps.tier = 'Platinum'),
           count(*) filter (where ps.tier = 'Gold'),
           count(*) filter (where ps.tier = 'Silver')
      into v_plat, v_gold, v_silv
      from unnest(v_squad) sid join public.player_stats ps on ps.id = sid and ps.tournament_id = p_tournament;
    if v_plat > 2 or v_gold > 3 or v_silv > 5 then
      raise exception 'Too many in a tier (Platinum %/2, Gold %/3, Silver %/5)', v_plat, v_gold, v_silv;
    end if;
    if v_locked and v_size <> 10 then
      raise exception 'Your squad must be exactly 10 players to lock (got %)', v_size;
    end if;
    if v_locked and (v_plat <> 2 or v_gold <> 3 or v_silv <> 5) then
      raise exception 'Your squad must be exactly 2 Platinum, 3 Gold, 5 Silver to lock (got %/%/%)', v_plat, v_gold, v_silv;
    end if;
    select coalesce(sum(ps.price), 0) into v_total
      from unnest(v_squad) sid join public.player_stats ps on ps.id = sid and ps.tournament_id = p_tournament;
    if v_total > v_cap then raise exception 'Squad costs $%M, over the $%M budget', v_total, v_cap; end if;   -- >> was hardcoded
    v_budget := round(v_cap - v_total, 1);                                                                    -- >> was hardcoded
    p_state := p_state || jsonb_build_object('budget', v_budget, 'cashedIn', '[]'::jsonb);
  else
    -- LOCKED PHASE: the basket. Entries are closed, the initial squad is frozen, the net change is validated.
    if not v_found then raise exception 'The tournament has started — the draft is closed'; end if;
    v_inc_init := array(select jsonb_array_elements_text(coalesce(p_state->'initialSquad', '[]'::jsonb)));
    v_sto_init := array(select jsonb_array_elements_text(coalesce(v_existing.state->'initialSquad', '[]'::jsonb)));
    if (select array(select unnest(v_inc_init) x order by x))
         is distinct from
       (select array(select unnest(v_sto_init) x order by x)) then
      raise exception 'The tournament has started — your squad is locked';
    end if;

    v_chk := public.market_check(p_tournament, p_state, v_existing.state, now());
    if not coalesce((v_chk->>'ok')::boolean, false) then
      raise exception '%', coalesce(v_chk->>'error', 'This change can''t be saved');
    end if;

    -- armband lock — a round's pick freezes when that round STARTS (Job 20).
    foreach r_round in array v_started loop
      v_inc := (select c->>'playerId' from jsonb_array_elements(coalesce(p_state->'captainHistory', '[]'::jsonb)) c where c->>'round' = r_round limit 1);
      v_sto := (select c->>'playerId' from jsonb_array_elements(coalesce(v_existing.state->'captainHistory', '[]'::jsonb)) c where c->>'round' = r_round limit 1);
      if coalesce(v_inc, '') <> coalesce(v_sto, '') then
        raise exception 'Cannot change your % captain — that round has already started', r_round;
      end if;
      v_inc := (select c->>'playerId' from jsonb_array_elements(coalesce(p_state->'viceCaptainHistory', '[]'::jsonb)) c where c->>'round' = r_round limit 1);
      v_sto := (select c->>'playerId' from jsonb_array_elements(coalesce(v_existing.state->'viceCaptainHistory', '[]'::jsonb)) c where c->>'round' = r_round limit 1);
      if coalesce(v_inc, '') <> coalesce(v_sto, '') then
        raise exception 'Cannot change your % vice-captain — that round has already started', r_round;
      end if;
    end loop;

    -- the server owns the bank; the ledger of sales only ever grows (old draft-time ghosts stay inert).
    v_budget := (v_chk->>'bank')::numeric;
    v_cashed := (select coalesce(jsonb_agg(to_jsonb(g.x) order by g.first_ord), '[]'::jsonb)
                   from (select w.x, min(w.ord) as first_ord
                           from (select u.x, row_number() over () as ord
                                   from (select jsonb_array_elements_text(coalesce(v_existing.state->'cashedIn', '[]'::jsonb)) as x
                                         union all select jsonb_array_elements_text(coalesce(p_state->'cashedIn', '[]'::jsonb))
                                         union all select jsonb_array_elements_text(coalesce(v_chk->'removed', '[]'::jsonb))) u
                                ) w
                          group by w.x) g);
    p_state := p_state || jsonb_build_object('budget', v_budget, 'cashedIn', v_cashed);
  end if;

  insert into public.entries (user_id, league_id, tournament_id, squad, captain_history, phase, current_round_index, budget, state, rev, updated_at)
    values (v_uid, v_public, p_tournament, v_squad,
            coalesce(p_state->'captainHistory', '[]'::jsonb), v_phase,
            coalesce((p_state->>'currentRoundIndex')::int, 0),
            v_budget,
            p_state, coalesce(p_base_rev, 0) + 1, now())
  on conflict (user_id, league_id, tournament_id) do update
    set squad = excluded.squad, captain_history = excluded.captain_history, phase = excluded.phase,
        current_round_index = excluded.current_round_index, budget = excluded.budget,
        state = excluded.state, rev = excluded.rev, updated_at = now();

  return coalesce(p_base_rev, 0) + 1;
end $function$

CREATE OR REPLACE FUNCTION public.market_check(p_tournament text, p_state jsonb, p_stored jsonb, p_now timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order text[] := array['R128','R64','R32','R16','QF','SF','F'];
  v_started text[];
  v_window text; v_tag text; v_pos int;
  v_window_start timestamptz; v_waiting text; v_open boolean;
  v_init text[]; v_team text[];
  v_stored_tr jsonb[]; v_in_tr jsonb[]; v_committed jsonb[]; v_window_tr jsonb[];
  v_lineage text[]; v_c_in text[]; v_c_out text[]; v_w_in text[]; v_w_out text[];
  v_ins text[]; v_removed text[];
  v_draft_spend numeric := 0; v_refunds numeric := 0; v_spend numeric := 0; v_bank numeric := 0;
  v_used int := 0; v_plat int; v_gold int; v_silv int;
  t_elem jsonb; x text; i int;
  v_exit text; v_in_draw boolean;
  v_cap numeric := public.budget_for(p_tournament);                                     -- >> new
  v_max int := public.max_transfers_for(p_tournament);                                  -- >> new
begin
  -- 1. rounds that have BEGUN: a result exists, or the clock passed a stamped start (Job 20).
  v_started := array(select distinct m.round from public.matches m
     where m.tournament_id = p_tournament
       and (m.winner_id is not null or (m.started_at is not null and m.started_at <= p_now)));
  if coalesce(array_length(v_started, 1), 0) = 0 then
    return public.market_err('The draft window is still open');
  end if;

  -- 2. the window: the first round with rows on the schedule that has not begun.
  select o.r into v_window
    from unnest(v_order) with ordinality as o(r, pos)
   where exists (select 1 from public.matches m where m.tournament_id = p_tournament and m.round = o.r)
     and not (o.r = any(v_started))
   order by o.pos limit 1;
  if v_window is null then
    return public.market_err('The market is closed — there is no round left to transfer for');
  end if;
  v_pos := array_position(v_order, v_window);
  v_tag := v_order[v_pos - 1];

  -- 3. open only when every earlier round is complete, or inside the 6-hour valve before the window's stamped first ball.
  select min(m.started_at) into v_window_start
    from public.matches m where m.tournament_id = p_tournament and m.round = v_window;
  select m.round into v_waiting from public.matches m
   where m.tournament_id = p_tournament and array_position(v_order, m.round) < v_pos and m.winner_id is null
   order by array_position(v_order, m.round) desc limit 1;
  v_open := v_waiting is null
         or (v_window_start is not null and p_now >= v_window_start - interval '6 hours');
  if not v_open then
    return public.market_err(format('The market opens when the %s is complete', public.round_label(v_waiting)),
                             jsonb_build_object('window', v_window, 'waiting_on', v_waiting));
  end if;

  v_init := array(select jsonb_array_elements_text(coalesce(p_state->'initialSquad', '[]'::jsonb)));
  v_team := array(select jsonb_array_elements_text(coalesce(p_state->'myTeam', '[]'::jsonb)));
  v_stored_tr := array(select t from jsonb_array_elements(coalesce(p_stored->'transfers', '[]'::jsonb)) t);
  v_in_tr := array(select t from jsonb_array_elements(coalesce(p_state->'transfers', '[]'::jsonb)) t);

  -- 4. committed transfers: stored ones whose effective round (the round after their tag) has begun. Frozen.
  v_committed := array(select t from unnest(v_stored_tr) t
     where v_order[array_position(v_order, t->>'round') + 1] = any(v_started));
  foreach t_elem in array v_committed loop
    if not (t_elem = any(v_in_tr)) then
      return public.market_err('Transfers from earlier rounds can''t be changed');
    end if;
  end loop;
  v_window_tr := array(select t from unnest(v_in_tr) t where not (t = any(v_committed)));

  -- 5. lineage: the initial squad with the committed transfers applied in order (the scorer's squadForRound).
  v_lineage := v_init;
  foreach t_elem in array v_committed loop
    i := array_position(v_lineage, t_elem->>'out');
    if i is not null then v_lineage[i] := t_elem->>'in'; end if;
  end loop;
  v_c_in := array(select t->>'in' from unnest(v_committed) t);
  v_c_out := array(select t->>'out' from unnest(v_committed) t);

  -- 6. window transfers: filed for this window, both names present, no repeats.
  v_w_in := array(select t->>'in' from unnest(v_window_tr) t);
  v_w_out := array(select t->>'out' from unnest(v_window_tr) t);
  foreach t_elem in array v_window_tr loop
    if coalesce(t_elem->>'round', '') <> v_tag then
      return public.market_err(format('A transfer for the %s must be filed as %s', public.round_label(v_window), v_tag));
    end if;
    if coalesce(t_elem->>'in', '') = '' or coalesce(t_elem->>'out', '') = '' then
      return public.market_err('A transfer must name both the player sold and the player signed');
    end if;
  end loop;
  if (select count(distinct y) from unnest(v_w_in) y) <> coalesce(array_length(v_w_in, 1), 0) then
    return public.market_err('A player can only be signed once');
  end if;
  if (select count(distinct y) from unnest(v_w_out) y) <> coalesce(array_length(v_w_out, 1), 0) then
    return public.market_err('A sold player can only be replaced once');
  end if;

  -- 7. the net change against the committed squad.
  v_ins := array(select y from unnest(v_team) y where y <> all(v_lineage));
  v_removed := array(select y from unnest(v_lineage) y where y <> all(v_team));
  foreach x in array v_w_in loop
    if not (x = any(v_team)) then return public.market_err(format('%s is signed but not in your squad', x)); end if;
    if x = any(v_lineage) then return public.market_err(format('%s is already in your squad', x)); end if;
  end loop;
  foreach x in array v_ins loop
    if not (x = any(v_w_in)) then return public.market_err(format('%s is in your squad without a transfer', x)); end if;
  end loop;
  foreach x in array v_removed loop
    v_in_draw := exists (select 1 from public.matches m where m.tournament_id = p_tournament and (m.p1_id = x or m.p2_id = x));
    v_exit := (select m.round from public.matches m
                where m.tournament_id = p_tournament and (m.p1_id = x or m.p2_id = x)
                  and m.winner_id is not null and m.winner_id <> x
                order by array_position(v_order, m.round) desc limit 1);
    if v_in_draw and v_exit is null then
      return public.market_err(format('You can only sell an eliminated player (%s is still in the draw)', x));
    end if;
  end loop;
  foreach x in array v_w_out loop
    if not (x = any(v_removed)) then
      return public.market_err(format('%s can''t be the player replaced — he is still in your squad', x));
    end if;
  end loop;
  foreach x in array v_w_in loop
    v_in_draw := exists (select 1 from public.matches m where m.tournament_id = p_tournament and (m.p1_id = x or m.p2_id = x));
    v_exit := (select m.round from public.matches m
                where m.tournament_id = p_tournament and (m.p1_id = x or m.p2_id = x)
                  and m.winner_id is not null and m.winner_id <> x
                order by array_position(v_order, m.round) desc limit 1);
    if (not v_in_draw) or v_exit is not null then
      return public.market_err(format('You can only sign a player still in the draw (%s is out)', x));
    end if;
  end loop;

  -- 8. shape: at most 10, never above the tier quota, every id known.
  if coalesce(array_length(v_team, 1), 0) > 10 then return public.market_err('Squad can''t exceed 10 players'); end if;
  if exists (select 1 from unnest(v_team) sid where not exists (
        select 1 from public.player_stats ps where ps.id = sid and ps.tournament_id = p_tournament)) then
    return public.market_err('Squad contains an unknown player');
  end if;
  select count(*) filter (where ps.tier = 'Platinum'),
         count(*) filter (where ps.tier = 'Gold'),
         count(*) filter (where ps.tier = 'Silver')
    into v_plat, v_gold, v_silv
    from unnest(v_team) sid join public.player_stats ps on ps.id = sid and ps.tournament_id = p_tournament;
  if v_plat > 2 or v_gold > 3 or v_silv > 5 then
    return public.market_err(format('Too many in a tier (Platinum %s/2, Gold %s/3, Silver %s/5)', v_plat, v_gold, v_silv));
  end if;

  -- 9. the cap: max_transfers_for(tournament) chargeable transfers; replacing a player with no match row is free.   -- >> was hardcoded
  select count(*) into v_used from unnest(v_committed || v_window_tr) t
   where exists (select 1 from public.matches m where m.tournament_id = p_tournament
                   and (m.p1_id = t->>'out' or m.p2_id = t->>'out'));
  if v_used > v_max then return public.market_err(format('You have used all %s transfers for this tournament', v_max)); end if;   -- >> was hardcoded

  -- 10. money: budget_for(tournament) - draft spend + refunds on EVERY player ever sold (earlier windows' outs + this window's removed)   -- >> was hardcoded
  --     - every signing ever made (earlier windows' ins + this window's). Same ledger the client keeps.
  select coalesce(sum(ps.price), 0) into v_draft_spend
    from unnest(v_init) sid join public.player_stats ps on ps.id = sid and ps.tournament_id = p_tournament;
  select coalesce(sum(round(ps.price * (
           case when not exists (select 1 from public.matches m where m.tournament_id = p_tournament and (m.p1_id = r.pid or m.p2_id = r.pid)) then 1.0
                else case (select m.round from public.matches m
                             where m.tournament_id = p_tournament and (m.p1_id = r.pid or m.p2_id = r.pid)
                               and m.winner_id is not null and m.winner_id <> r.pid
                             order by array_position(v_order, m.round) desc limit 1)
                       when 'R128' then 0.75 when 'R64' then 0.70 when 'R32' then 0.55
                       when 'R16' then 0.40 when 'QF' then 0.25 else 0 end
           end), 1)), 0) into v_refunds
    from (select distinct y as pid from unnest(v_c_out || v_removed) y) r
    join public.player_stats ps on ps.id = r.pid and ps.tournament_id = p_tournament;
  select coalesce(sum(ps.price), 0) into v_spend
    from unnest(v_c_in || v_w_in) sid join public.player_stats ps on ps.id = sid and ps.tournament_id = p_tournament;
  v_bank := round(v_cap - v_draft_spend + v_refunds - v_spend, 1);                     -- >> was hardcoded
  if v_bank < -0.05 then
    return public.market_err(format('Over budget by $%sM — refunds don''t cover these signings', round(-v_bank, 1)));
  end if;

  return jsonb_build_object(
    'ok', true, 'window', v_window, 'tag', v_tag, 'locks_at', v_window_start,
    'bank', v_bank, 'used', v_used, 'refunds', v_refunds, 'spend', v_spend, 'draft_spend', v_draft_spend,
    'budget', v_cap, 'max_transfers', v_max,                                             -- >> new (informational)
    'lineage', to_jsonb(v_lineage), 'removed', to_jsonb(v_removed), 'ins', to_jsonb(v_ins),
    'committed', coalesce(array_length(v_committed, 1), 0),
    'window_transfers', coalesce(array_length(v_window_tr, 1), 0));
end $function$
