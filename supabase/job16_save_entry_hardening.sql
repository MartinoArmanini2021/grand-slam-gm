-- ── Job 16 — close the two remaining holes in save_entry ─────────────────────────────────────────
--
-- Applied 2026-08-26, with Martino's explicit go-ahead (this is the rule guarding every save, so it
-- is never touched without it). STRENGTHENS the server; nothing here relaxes an existing check.
--
-- HOLE 1 — the budget stopped being enforced the moment a transfer existed. Gate (d) is guarded on
--   `not v_stored_has_transfers`, deliberately, because post-lock spending is a different sum:
--   refunds from eliminations fund new signings. That accounting was simply never written, so from
--   the first transfer onward a crafted call could sign anyone at any price, three times over.
--   Gate (d4) below writes it: 150 - draft spend + refunds - new signings >= 0.
--
-- HOLE 2 — nothing checked WHO was being traded. The client only offers eliminated players to sell
--   and living ones to buy, but the client is not the referee. Gate (d5) enforces both, and only on
--   NEWLY ADDED transfers — old ones were legal when made, and a player who has since been knocked
--   out must not retroactively invalidate a save (the same reasoning as gate (i)).
--
-- Both gates mirror the client exactly: refund fractions from REFUND_FRACTION in the engine, the
-- full refund for a player who never reached a scored round, and "eliminated" derived from
-- public.matches — never from a client flag.
--
-- REHEARSED BEFORE APPLYING: gate (d4) was run against every stored entry. All four Cincinnati
-- squads stay solvent, and the server's independently computed bank matched the client's stored
-- bank to the penny on every one (30 / 0 / 1.9 / 16). A rule that cannot reproduce the numbers
-- managers already lived with is the wrong rule.

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
  -- CLIENT-SUPPLIED (untrusted): only ever used to shape non-limit behaviour, NEVER to decide a
  -- cap. v_stored_has_transfers below is the trustworthy one, read from the locked stored row.
  v_has_transfers boolean := jsonb_array_length(coalesce(p_state->'transfers', '[]'::jsonb)) > 0;
  v_stored_has_transfers boolean := false;   -- derived from the STORED entry (see the lock below)
  -- "touched" = the manager has begun mid-tournament changes (cashed a player in OR bought one).
  -- Until then a LOCKED squad is still the pristine draft, so it must be exactly 10 · 2/3/5. Once
  -- touched, cash-in-and-buy is allowed to shrink the squad (<10) and drift off 2/3/5 (any tier).
  v_touched boolean := jsonb_array_length(coalesce(p_state->'transfers', '[]'::jsonb)) > 0
                    or jsonb_array_length(coalesce(p_state->'cashedIn', '[]'::jsonb)) > 0;
  v_size int; v_distinct int; v_total int;
  v_tr_count int; v_prior_tr int;   -- transfer cap (d2/d3)
  v_plat int; v_gold int; v_silv int;
  v_existing public.entries%rowtype;
  v_found boolean;
  v_public uuid;
  r_round text; v_inc text; v_sto text;
  -- P6 — result-based squad/transfer freeze
  v_started boolean;
  v_result_rounds text[];
  v_inc_init text[]; v_sto_init text[];
  v_round_order text[] := array['R128','R64','R32','R16','QF','SF','F'];
  t_elem jsonb; v_tr_round text; v_next_round text;
  -- Job 16 — post-transfer budget accounting (d4) and trade validity (d5)
  v_draft_spend numeric; v_refunds numeric; v_new_spend numeric; v_available numeric;
  v_out text; v_in text; v_out_exit text; v_in_exit text; v_out_in_draw boolean;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  -- RATE GUARD (defense-in-depth vs a save FLOOD — the Aug-2026 save-storm, ~89M expensive
  -- conflicts/24h from a stuck tab). A transaction-scoped advisory lock keyed on the user means
  -- only ONE save_entry may run at a time per account. Auto-released at transaction end.
  if not pg_try_advisory_xact_lock(hashtext('save_entry:' || v_uid::text)::bigint) then
    raise exception 'A save is already in progress for your account — converging' using errcode = '40001';
  end if;

  -- B3: pin the entry to the canonical PUBLIC league and reject any other p_league.
  select id into v_public from public.leagues where is_public limit 1;
  if v_public is null then raise exception 'No public league configured'; end if;
  if p_league is distinct from v_public then raise exception 'Invalid league for this entry'; end if;

  v_squad := array(select jsonb_array_elements_text(coalesce(p_state->'myTeam', '[]'::jsonb)));
  v_size := coalesce(array_length(v_squad, 1), 0);
  v_distinct := (select count(distinct x) from unnest(v_squad) x);

  -- (a) no duplicates; size <= 10 always; EXACTLY 10 at lock (the pristine draft).
  if v_distinct <> v_size then raise exception 'Squad has duplicate players'; end if;
  if v_size > 10 then raise exception 'Squad can''t exceed 10 players (got %)', v_size; end if;
  if v_locked and not v_touched and v_size <> 10 then raise exception 'Your squad must be exactly 10 players to lock (got %)', v_size; end if;

  -- LOCK + LOAD THE STORED ENTRY FIRST, so every check below has a trustworthy view.
  select * into v_existing from public.entries
    where user_id = v_uid and league_id = v_public and tournament_id = p_tournament for update;
  v_found := found;
  v_stored_has_transfers := v_found
    and jsonb_array_length(coalesce(v_existing.state->'transfers', '[]'::jsonb)) > 0;

  -- (b) every id is a real, known player, SCOPED to the tournament being saved.
  if exists (select 1 from unnest(v_squad) sid where not exists (
      select 1 from public.player_stats ps where ps.id = sid and ps.tournament_id = p_tournament)) then
    raise exception 'Squad contains an unknown player';
  end if;

  -- (c) tier quota.
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

  -- (d) draft budget: sum of seeded prices <= 150 while no transfers exist.
  --     MUST read the STORED entry, never p_state: deriving "has transfers" from the client payload
  --     let any caller switch the cap off by inventing a transfer. Keep it that way.
  if not v_stored_has_transfers then
    select coalesce(sum(ps.price), 0) into v_total from unnest(v_squad) sid join public.player_stats ps on ps.id = sid and ps.tournament_id = p_tournament;
    if v_total > 150 then raise exception 'Squad costs $%M, over the $150M budget', v_total; end if;
  end if;

  -- results so far — needed by (d4)/(d5) below and by the P6 freeze further down.
  v_result_rounds := array(select distinct m.round from public.matches m
    where m.tournament_id = p_tournament and m.winner_id is not null);
  v_started := array_length(v_result_rounds, 1) is not null;

  -- (d2) TRANSFER CAP (mirrors MAX_TRANSFERS). Free repairs (the OUT player never reached a
  --      scored round) never spend the allowance. Keyed on `out`, never the round stamp.
  select count(*) into v_tr_count
    from jsonb_array_elements(coalesce(p_state->'transfers', '[]'::jsonb)) t
   where not exists (select 1 from public.player_stats ps where ps.id = t->>'out' and ps.tournament_id = p_tournament)
      or exists (select 1 from public.matches m
                  where m.tournament_id = p_tournament
                    and (m.p1_id = t->>'out' or m.p2_id = t->>'out'));

  -- (d3) apply the transfer cap now that the stored entry is loaded (see d2).
  select count(*) into v_prior_tr
    from jsonb_array_elements(case when v_found then coalesce(v_existing.state->'transfers', '[]'::jsonb) else '[]'::jsonb end) t
   where not exists (select 1 from public.player_stats ps where ps.id = t->>'out' and ps.tournament_id = p_tournament)
      or exists (select 1 from public.matches m
                  where m.tournament_id = p_tournament
                    and (m.p1_id = t->>'out' or m.p2_id = t->>'out'));
  if v_tr_count > greatest(3, v_prior_tr) then
    raise exception 'You have used all 3 transfers for this tournament';
  end if;

  -- ── (d4) JOB 16 — POST-TRANSFER BUDGET ───────────────────────────────────────────────────────
  -- The accounting gate (d) defers to. Runs whenever the manager has begun trading, so the moment
  -- gate (d) steps aside this one takes over — there is no window with no budget rule at all.
  --
  --   available = 150 - what the draft cost + every refund collected - every signing made
  --
  -- A sale refunds a FRACTION of the price, by how far the player got (an early exit refunds most;
  -- a semi-finalist nothing). A player who never reached a scored round refunds in FULL. Both
  -- mirror REFUND_FRACTION and saleRefund() in the client engine, and both are derived from
  -- public.matches, so no client flag can inflate them. Sold players are taken as a SET: the
  -- stored state records a paired sale in BOTH `transfers.out` and `cashedIn`, and counting it
  -- twice would hand out the refund twice.
  if v_touched then
    select coalesce(sum(ps.price), 0) into v_draft_spend
      from jsonb_array_elements_text(coalesce(p_state->'initialSquad', '[]'::jsonb)) sid
      join public.player_stats ps on ps.id = sid and ps.tournament_id = p_tournament;

    select coalesce(sum(
      round(ps.price * case
        -- never appeared in a scored round: full refund (only meaningful once play has begun —
        -- before the draw is ingested NOBODY has a match row, which must not read as a refund)
        when v_started and not exists (select 1 from public.matches m
              where m.tournament_id = p_tournament and (m.p1_id = s.pid or m.p2_id = s.pid)) then 1.0
        else case (select m.round from public.matches m
                    where m.tournament_id = p_tournament and (m.p1_id = s.pid or m.p2_id = s.pid)
                      and m.winner_id is not null and m.winner_id <> s.pid
                    order by array_position(v_round_order, m.round) desc limit 1)
          when 'R128' then 0.75 when 'R64' then 0.70 when 'R32' then 0.55
          when 'R16'  then 0.40 when 'QF'  then 0.25 else 0 end
      end, 1)), 0) into v_refunds
      from (
        select distinct pid from (
          select t->>'out' as pid from jsonb_array_elements(coalesce(p_state->'transfers', '[]'::jsonb)) t
          union
          select jsonb_array_elements_text(coalesce(p_state->'cashedIn', '[]'::jsonb))
        ) u where pid is not null
      ) s
      join public.player_stats ps on ps.id = s.pid and ps.tournament_id = p_tournament;

    select coalesce(sum(ps.price), 0) into v_new_spend
      from jsonb_array_elements(coalesce(p_state->'transfers', '[]'::jsonb)) t
      join public.player_stats ps on ps.id = t->>'in' and ps.tournament_id = p_tournament;

    v_available := 150 - v_draft_spend + v_refunds - v_new_spend;
    -- tolerance for the one-decimal refund rounding both sides share
    if v_available < -0.05 then
      raise exception 'Over budget by $%M — refunds don''t cover these signings', round(-v_available, 1);
    end if;
  end if;

  -- ── (d5) JOB 16 — WHO MAY BE TRADED ──────────────────────────────────────────────────────────
  -- Sell only the eliminated, sign only the living. Checked on NEWLY ADDED transfers alone: an
  -- older transfer was legal when it was made, and re-validating it against today's results would
  -- reject every later save the moment a signing was knocked out.
  for t_elem in
    select jsonb_array_elements(coalesce(p_state->'transfers','[]'::jsonb))
    except
    select jsonb_array_elements(case when v_found then coalesce(v_existing.state->'transfers','[]'::jsonb) else '[]'::jsonb end)
  loop
    v_out := t_elem->>'out';
    v_in  := t_elem->>'in';
    if v_in is null or v_in = '' then raise exception 'A transfer must name the player signed'; end if;

    v_out_in_draw := exists (select 1 from public.matches m
      where m.tournament_id = p_tournament and (m.p1_id = v_out or m.p2_id = v_out));
    v_out_exit := (select m.round from public.matches m
      where m.tournament_id = p_tournament and (m.p1_id = v_out or m.p2_id = v_out)
        and m.winner_id is not null and m.winner_id <> v_out
      order by array_position(v_round_order, m.round) desc limit 1);
    v_in_exit := (select m.round from public.matches m
      where m.tournament_id = p_tournament and (m.p1_id = v_in or m.p2_id = v_in)
        and m.winner_id is not null and m.winner_id <> v_in
      order by array_position(v_round_order, m.round) desc limit 1);

    -- OUT must be gone: knocked out, or never in the draw at all (the unscored opener).
    if not (v_out_exit is not null or (v_started and not v_out_in_draw)) then
      raise exception 'You can only sell an eliminated player (% is still in the draw)', v_out;
    end if;
    -- IN must have been alive when signed. The transfer is stamped with the round it was made in,
    -- whose results are already known, so a player who exited in that round or earlier was dead.
    if v_in_exit is not null
       and array_position(v_round_order, v_in_exit) <= array_position(v_round_order, t_elem->>'round') then
      raise exception 'You can only sign a player still in the draw (% was out in the %)', v_in, v_in_exit;
    end if;
  end loop;

  -- (e) F2 rev guard — the entry must be at the rev the client last read.
  if v_found and v_existing.rev <> coalesce(p_base_rev, 0) then
    raise exception 'entry changed elsewhere' using errcode = '40001';
  end if;

  -- (f) F1(2) captain/vice lock — for a round that already has results, the pick can't change.
  for r_round in select distinct m.round from public.matches m where m.tournament_id = p_tournament and m.winner_id is not null loop
    v_inc := (select c->>'playerId' from jsonb_array_elements(coalesce(p_state->'captainHistory','[]'::jsonb)) c where c->>'round' = r_round limit 1);
    v_sto := (select c->>'playerId' from jsonb_array_elements(coalesce(v_existing.state->'captainHistory','[]'::jsonb)) c where c->>'round' = r_round limit 1);
    if coalesce(v_inc,'') <> coalesce(v_sto,'') then raise exception 'Cannot change your % captain — that round has already been played', r_round; end if;
    v_inc := (select c->>'playerId' from jsonb_array_elements(coalesce(p_state->'viceCaptainHistory','[]'::jsonb)) c where c->>'round' = r_round limit 1);
    v_sto := (select c->>'playerId' from jsonb_array_elements(coalesce(v_existing.state->'viceCaptainHistory','[]'::jsonb)) c where c->>'round' = r_round limit 1);
    if coalesce(v_inc,'') <> coalesce(v_sto,'') then raise exception 'Cannot change your % vice-captain — that round has already been played', r_round; end if;
  end loop;

  -- (f2) P6 — result-based squad + transfer freeze.
  if v_started then
    -- (h) the drafted squad (initialSquad) is frozen once the tournament has a result.
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

    -- (i) a NEWLY added transfer can't score a round whose result is already in.
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

  -- (g) write. rev advances; score is never set here.
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
