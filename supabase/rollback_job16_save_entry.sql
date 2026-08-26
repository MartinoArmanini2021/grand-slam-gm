-- ── ROLLBACK for Job 16 ──────────────────────────────────────────────────────────────────────────
-- The EXACT save_entry definition deployed immediately before the Job 16 hardening
-- (captured from pg_get_functiondef on 2026-08-26, before applying
-- supabase/job16_save_entry_hardening.sql).
--
-- Run this and the two new gates — (d4) post-transfer budget and (d5) sell-eliminated /
-- buy-alive — disappear; every other rule returns to exactly what it was. Nothing else in
-- the schema is touched by Job 16, so this is the whole undo.

create or replace function public.save_entry(p_tournament text, p_league uuid, p_state jsonb, p_base_rev bigint)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_squad text[];
  v_phase text := coalesce(p_state->>'phase', 'draft');
  v_locked boolean := (coalesce(p_state->>'phase', 'draft') <> 'draft');
  v_has_transfers boolean := jsonb_array_length(coalesce(p_state->'transfers', '[]'::jsonb)) > 0;
  v_stored_has_transfers boolean := false;
  v_touched boolean := jsonb_array_length(coalesce(p_state->'transfers', '[]'::jsonb)) > 0
                    or jsonb_array_length(coalesce(p_state->'cashedIn', '[]'::jsonb)) > 0;
  v_size int; v_distinct int; v_total int;
  v_tr_count int; v_prior_tr int;
  v_plat int; v_gold int; v_silv int;
  v_existing public.entries%rowtype;
  v_found boolean;
  v_public uuid;
  r_round text; v_inc text; v_sto text;
  v_started boolean;
  v_result_rounds text[];
  v_inc_init text[]; v_sto_init text[];
  v_round_order text[] := array['R128','R64','R32','R16','QF','SF','F'];
  t_elem jsonb; v_tr_round text; v_next_round text;
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
  if v_locked and not v_touched and v_size <> 10 then raise exception 'Your squad must be exactly 10 players to lock (got %)', v_size; end if;

  select * into v_existing from public.entries
    where user_id = v_uid and league_id = v_public and tournament_id = p_tournament for update;
  v_found := found;
  v_stored_has_transfers := v_found
    and jsonb_array_length(coalesce(v_existing.state->'transfers', '[]'::jsonb)) > 0;

  if exists (select 1 from unnest(v_squad) sid where not exists (
      select 1 from public.player_stats ps where ps.id = sid and ps.tournament_id = p_tournament)) then
    raise exception 'Squad contains an unknown player';
  end if;

  select
    count(*) filter (where ps.tier = 'Platinum'),
    count(*) filter (where ps.tier = 'Gold'),
    count(*) filter (where ps.tier = 'Silver')
    into v_plat, v_gold, v_silv
    from unnest(v_squad) sid join public.player_stats ps on ps.id = sid and ps.tournament_id = p_tournament;
  if (not v_locked) and (v_plat > 2 or v_gold > 3 or v_silv > 5) then
    raise exception 'Too many in a tier (Platinum %/2, Gold %/3, Silver %/5)', v_plat, v_gold, v_silv;
  end if;
  if v_locked and not v_touched and (v_plat <> 2 or v_gold <> 3 or v_silv <> 5) then
    raise exception 'Your squad must be exactly 2 Platinum, 3 Gold, 5 Silver to lock (got %/%/%)', v_plat, v_gold, v_silv;
  end if;

  if not v_stored_has_transfers then
    select coalesce(sum(ps.price), 0) into v_total from unnest(v_squad) sid join public.player_stats ps on ps.id = sid and ps.tournament_id = p_tournament;
    if v_total > 150 then raise exception 'Squad costs $%M, over the $150M budget', v_total; end if;
  end if;

  select count(*) into v_tr_count
    from jsonb_array_elements(coalesce(p_state->'transfers', '[]'::jsonb)) t
   where not exists (select 1 from public.player_stats ps where ps.id = t->>'out' and ps.tournament_id = p_tournament)
      or exists (select 1 from public.matches m
                  where m.tournament_id = p_tournament
                    and (m.p1_id = t->>'out' or m.p2_id = t->>'out'));

  select count(*) into v_prior_tr
    from jsonb_array_elements(case when v_found then coalesce(v_existing.state->'transfers', '[]'::jsonb) else '[]'::jsonb end) t
   where not exists (select 1 from public.player_stats ps where ps.id = t->>'out' and ps.tournament_id = p_tournament)
      or exists (select 1 from public.matches m
                  where m.tournament_id = p_tournament
                    and (m.p1_id = t->>'out' or m.p2_id = t->>'out'));
  if v_tr_count > greatest(3, v_prior_tr) then
    raise exception 'You have used all 3 transfers for this tournament';
  end if;

  if v_found and v_existing.rev <> coalesce(p_base_rev, 0) then
    raise exception 'entry changed elsewhere' using errcode = '40001';
  end if;

  for r_round in select distinct m.round from public.matches m where m.tournament_id = p_tournament and m.winner_id is not null loop
    v_inc := (select c->>'playerId' from jsonb_array_elements(coalesce(p_state->'captainHistory','[]'::jsonb)) c where c->>'round' = r_round limit 1);
    v_sto := (select c->>'playerId' from jsonb_array_elements(coalesce(v_existing.state->'captainHistory','[]'::jsonb)) c where c->>'round' = r_round limit 1);
    if coalesce(v_inc,'') <> coalesce(v_sto,'') then raise exception 'Cannot change your % captain — that round has already been played', r_round; end if;
    v_inc := (select c->>'playerId' from jsonb_array_elements(coalesce(p_state->'viceCaptainHistory','[]'::jsonb)) c where c->>'round' = r_round limit 1);
    v_sto := (select c->>'playerId' from jsonb_array_elements(coalesce(v_existing.state->'viceCaptainHistory','[]'::jsonb)) c where c->>'round' = r_round limit 1);
    if coalesce(v_inc,'') <> coalesce(v_sto,'') then raise exception 'Cannot change your % vice-captain — that round has already been played', r_round; end if;
  end loop;

  v_result_rounds := array(select distinct m.round from public.matches m
    where m.tournament_id = p_tournament and m.winner_id is not null);
  v_started := array_length(v_result_rounds, 1) is not null;
  if v_started then
    v_inc_init := array(select jsonb_array_elements_text(coalesce(p_state->'initialSquad','[]'::jsonb)));
    v_sto_init := array(select jsonb_array_elements_text(coalesce(v_existing.state->'initialSquad','[]'::jsonb)));
    if (select array(select unnest(v_inc_init) x order by x))
         is distinct from
       (select array(select unnest(v_sto_init) x order by x)) then
      if coalesce(array_length(v_sto_init, 1), 0) = 0
        then raise exception 'The tournament has started — the draft is closed';
        else raise exception 'The tournament has started — your squad is locked';
      end if;
    end if;

    for t_elem in
      select jsonb_array_elements(coalesce(p_state->'transfers','[]'::jsonb))
      except
      select jsonb_array_elements(coalesce(v_existing.state->'transfers','[]'::jsonb))
    loop
      v_tr_round := t_elem->>'round';
      v_next_round := (select v_round_order[i + 1] from generate_subscripts(v_round_order, 1) i
                       where v_round_order[i] = v_tr_round limit 1);
      if v_next_round is not null and v_next_round = any(v_result_rounds) then
        raise exception 'Too late to transfer for the % — that round has already started', v_next_round;
      end if;
    end loop;
  end if;

  insert into public.entries (user_id, league_id, tournament_id, squad, captain_history, phase, current_round_index, budget, state, rev, updated_at)
    values (v_uid, v_public, p_tournament, v_squad,
            coalesce(p_state->'captainHistory','[]'::jsonb), v_phase,
            coalesce((p_state->>'currentRoundIndex')::int, 0),
            coalesce((p_state->>'budget')::numeric, 150),
            p_state, coalesce(p_base_rev, 0) + 1, now())
  on conflict (user_id, league_id, tournament_id) do update
    set squad = excluded.squad, captain_history = excluded.captain_history, phase = excluded.phase,
        current_round_index = excluded.current_round_index, budget = excluded.budget,
        state = excluded.state, rev = excluded.rev, updated_at = now();

  return coalesce(p_base_rev, 0) + 1;
end $function$;
