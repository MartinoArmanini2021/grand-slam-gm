-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 1.4 — close the `v_touched` bypass (the twin of fix 1.2's budget bypass).
--
-- THE HOLE: v_touched was derived from p_state (the raw client payload), and it gated BOTH
-- shape rules for a locked squad — "exactly 10" and "exactly 2/3/5". Any signed-in caller
-- could bolt a fabricated `cashedIn: ["anything"]` onto an otherwise normal save and lock a
-- squad of any shape. It is not theoretical: zverev + shelton + deminaur + cobolli (4 Platinum,
-- $124M) + the six cheapest Silvers ($26M) = exactly $150M, so the budget gate — which fix 1.2
-- correctly re-anchored on the STORED row — passes it without complaint.
--
-- WHY NOT THE NAIVE FIX: deriving v_touched from the STORED row instead breaks the live game.
-- At the FIRST cash-in the stored row is still pristine (transfers [] and cashedIn []), while the
-- incoming squad is 9 players — so "must be exactly 10 to lock" fires and the manager's cash-in
-- is rejected. Worse, the rejection is DESTRUCTIVE: CloudSync treats an invalid result by calling
-- revertToCloud() (src/components/CloudSync.tsx:266-272), which throws the local edit away. The
-- same is true of the court's one-tap replacePlayer (gameStore.ts:322-360), which lands a 10-man
-- squad that has legitimately drifted off 2/3/5.
--
-- THE FIX — stop asking "has the manager been touched?" and start checking the BOOKS.
--   Tier 1 (structural, no results needed, cannot false-reject):
--     • initialSquad — the pristine draft — is ALWAYS exactly 10 distinct known players and
--       exactly 2/3/5 once locked. No client flag can switch this off. (initialSquad is written
--       once, by finalizeDraft, and gate (h) already freezes it the moment a result lands.)
--     • The live squad must BALANCE against it: myTeam = (initialSquad + every transfer-in)
--       − every declared cash-in, every cash-in is someone you actually acquired and are no
--       longer fielding, and every transfer vacates a cashed-in slot. This is exactly the
--       invariant sanitizeState already maintains client-side (gameStore.ts:96-107), so it
--       cannot reject an honest save — verified against all 8 live entries, see the notes at
--       the bottom of this file.
--     For an UNTOUCHED locked squad these two rules are provably IDENTICAL to the old lines 112
--     and 145 (with no transfers and no cash-ins, acquired == initialSquad, so the identity
--     forces myTeam == initialSquad == 10 · 2/3/5). Nothing is weakened; the touched case, which
--     used to be checked by NOTHING, is now checked by the identity.
--
--   Tier 2 (results-based, deliberately FAILS OPEN): a newly-declared cash-in is refused when the
--     server can positively see the player is still alive. "Positively" is the load-bearing word.
--     The client polls Wikipedia itself every 5 minutes (liveData.ts:41) while the server's ingest
--     cron runs on its own 5-minute schedule (setup_ingest_cron.sql:38), so the client is routinely
--     AHEAD of public.matches. A gate that demanded proof of elimination would therefore reject
--     real cash-ins made in the first minutes of a round break — and, per revertToCloud above,
--     silently delete them. So the server only asserts "still alive" when its picture of the draw
--     is at a CLEAN STOPPING POINT: v_settled_round is the deepest round that is fully decided AND
--     has no decided result after it — i.e. a round played out with the next one drawn but unplayed,
--     which is precisely the state at a break. Mid-ingest the round is not fully decided, so
--     v_settled_round is null and Tier 2 declines to assert anything. Tier 1 still holds throughout.
--
-- RESIDUAL, stated plainly: while a round is part-played (and during the ≤1 ingest cycle after it
-- finishes) Tier 2 is inert, so a crafted call could dispose of a player who is alive-but-unplayed.
-- That caller still pays a transfer from the cap of 3, still has to balance the books, and still
-- cannot alter initialSquad. Closing it needs a fresher feed than a 5-minute cron, not more SQL.
--
-- PREREQUISITE: apply supabase/seed_<event>_player_stats.sql first, as always.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.save_entry(
  p_tournament text, p_league uuid, p_state jsonb, p_base_rev bigint
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_squad text[];
  v_phase text := coalesce(p_state->>'phase', 'draft');
  v_locked boolean := (coalesce(p_state->>'phase', 'draft') <> 'draft');
  v_stored_has_transfers boolean := false;   -- derived from the STORED entry (see the lock below)
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
  -- 1.4 — the squad LEDGER. These replace v_touched (and the now-dead v_has_transfers): the
  -- rules below read the books, not a client flag.
  v_init text[];                     -- initialSquad — the pristine draft
  v_in_ids text[]; v_out_ids text[]; -- transfers[].in / transfers[].out
  v_cashed text[];                   -- cashedIn
  v_acquired text[];                 -- initialSquad + every transfer-in = everyone ever signed
  v_ip int; v_ig int; v_is int;      -- initialSquad tier counts
  v_settled_round text;              -- deepest CLEANLY-COMPLETED round (null when mid-ingest)
  v_bad text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  -- RATE GUARD (unchanged — see fix 1.1).
  if not pg_try_advisory_xact_lock(hashtext('save_entry:' || v_uid::text)::bigint) then
    raise exception 'A save is already in progress for your account — converging' using errcode = '40001';
  end if;

  -- B3: pin the entry to the canonical PUBLIC league (unchanged).
  select id into v_public from public.leagues where is_public limit 1;
  if v_public is null then raise exception 'No public league configured'; end if;
  if p_league is distinct from v_public then raise exception 'Invalid league for this entry'; end if;

  v_squad := array(select jsonb_array_elements_text(coalesce(p_state->'myTeam', '[]'::jsonb)));
  v_size := coalesce(array_length(v_squad, 1), 0);
  v_distinct := (select count(distinct x) from unnest(v_squad) x);

  -- (a) no duplicates; size ≤ 10 always. The "exactly 10 at lock" rule moved to (a3) below,
  --     where it is asked of initialSquad — the draft that must be complete — rather than of the
  --     live squad, which legitimately shrinks as players are cashed in.
  if v_distinct <> v_size then raise exception 'Squad has duplicate players'; end if;
  if v_size > 10 then raise exception 'Squad can''t exceed 10 players (got %)', v_size; end if;

  -- LOCK + LOAD THE STORED ENTRY FIRST (fix 1.2 — every gate below gets a trustworthy view).
  select * into v_existing from public.entries
    where user_id = v_uid and league_id = v_public and tournament_id = p_tournament for update;
  v_found := found;
  v_stored_has_transfers := v_found
    and jsonb_array_length(coalesce(v_existing.state->'transfers', '[]'::jsonb)) > 0;

  -- (b) every id in the live squad is a real, known player, SCOPED to this tournament (fix 1.3).
  if exists (select 1 from unnest(v_squad) sid where not exists (
      select 1 from public.player_stats ps where ps.id = sid and ps.tournament_id = p_tournament)) then
    raise exception 'Squad contains an unknown player';
  end if;

  -- ── 1.4 — read the ledger out of p_state once. Nothing here is TRUSTED; (a3)/(a4) below make
  --    every one of these arrays account for itself against the others.
  v_init     := array(select jsonb_array_elements_text(coalesce(p_state->'initialSquad', '[]'::jsonb)));
  v_cashed   := array(select jsonb_array_elements_text(coalesce(p_state->'cashedIn',     '[]'::jsonb)));
  v_in_ids   := array(select jsonb_array_elements(coalesce(p_state->'transfers','[]'::jsonb))->>'in');
  v_out_ids  := array(select jsonb_array_elements(coalesce(p_state->'transfers','[]'::jsonb))->>'out');
  v_acquired := v_init || v_in_ids;

  -- (c) tier quota during the DRAFT: never OVER 2/3/5 (a partial squad is still being built, so
  --     it is capped, not fixed). Unchanged.
  select
    count(*) filter (where ps.tier = 'Platinum'),
    count(*) filter (where ps.tier = 'Gold'),
    count(*) filter (where ps.tier = 'Silver')
    into v_plat, v_gold, v_silv
    from unnest(v_squad) sid join public.player_stats ps on ps.id = sid and ps.tournament_id = p_tournament;
  if (not v_locked) and (v_plat > 2 or v_gold > 3 or v_silv > 5) then
    raise exception 'Too many in a tier (Platinum %/2, Gold %/3, Silver %/5)', v_plat, v_gold, v_silv;
  end if;

  if v_locked then
    -- (a3) THE PRISTINE DRAFT — asked of initialSquad, and asked UNCONDITIONALLY. This is the
    --      rule the old v_touched could switch off. initialSquad is written exactly once (by
    --      finalizeDraft, gameStore.ts) and gate (h) freezes it the moment a result lands, so an
    --      honest entry answers this identically on every save for the rest of the tournament.
    if coalesce(array_length(v_init, 1), 0) <> 10
       or (select count(distinct x) from unnest(v_init) x) <> 10 then
      raise exception 'Your squad must be exactly 10 players to lock (got %)',
        coalesce(array_length(v_init, 1), 0);
    end if;
    if exists (select 1 from unnest(v_init) sid where not exists (
        select 1 from public.player_stats ps where ps.id = sid and ps.tournament_id = p_tournament)) then
      raise exception 'Squad contains an unknown player';
    end if;
    select
      count(*) filter (where ps.tier = 'Platinum'),
      count(*) filter (where ps.tier = 'Gold'),
      count(*) filter (where ps.tier = 'Silver')
      into v_ip, v_ig, v_is
      from unnest(v_init) sid join public.player_stats ps on ps.id = sid and ps.tournament_id = p_tournament;
    if v_ip <> 2 or v_ig <> 3 or v_is <> 5 then
      raise exception 'Your squad must be exactly 2 Platinum, 3 Gold, 5 Silver to lock (got %/%/%)',
        v_ip, v_ig, v_is;
    end if;

    -- (a4) THE BOOKS MUST BALANCE. myTeam = (initialSquad + transfer-ins) − cash-ins. This is what
    --      makes a fabricated `cashedIn` worthless: the squad you FIELD is now derived from the
    --      squad you DRAFTED, so an extra Platinum has to arrive as a transfer-in — which costs one
    --      of your 3 and has to vacate a slot you genuinely cashed in. Mirrors sanitizeState().
    select x into v_bad from unnest(v_squad) x where not x = any(v_acquired) limit 1;
    if found then raise exception 'You never drafted or signed % — squad rejected', v_bad; end if;

    select x into v_bad from unnest(v_acquired) x
      where not x = any(v_squad) and not x = any(v_cashed) limit 1;
    if found then raise exception '% has left your squad with no cash-in recorded', v_bad; end if;

    select x into v_bad from unnest(v_cashed) x where not x = any(v_acquired) limit 1;
    if found then raise exception 'Can''t cash in % — they were never on your squad', v_bad; end if;

    select x into v_bad from unnest(v_cashed) x where x = any(v_squad) limit 1;
    if found then raise exception 'Can''t cash in % while still fielding them', v_bad; end if;

    select t->>'out' into v_bad from jsonb_array_elements(coalesce(p_state->'transfers','[]'::jsonb)) t
      where not (t->>'out') = any(v_cashed) limit 1;
    if found then raise exception 'Transfer out of % without cashing them in', v_bad; end if;

    select t->>'in' into v_bad from jsonb_array_elements(coalesce(p_state->'transfers','[]'::jsonb)) t
      where not (t->>'in') = any(v_squad) or (t->>'in') = (t->>'out') limit 1;
    if found then raise exception 'Signed % but they are not in your squad', v_bad; end if;

    if (select count(distinct x) from unnest(v_in_ids) x)  <> coalesce(array_length(v_in_ids, 1), 0)
    or (select count(distinct x) from unnest(v_out_ids) x) <> coalesce(array_length(v_out_ids, 1), 0)
    or (select count(distinct x) from unnest(v_cashed) x)  <> coalesce(array_length(v_cashed, 1), 0) then
      raise exception 'Duplicate entry in your transfer / cash-in record';
    end if;
  end if;

  -- (d) budget (fix 1.2 — reads the STORED row, never p_state). Unchanged.
  if not v_stored_has_transfers then
    select coalesce(sum(ps.price), 0) into v_total from unnest(v_squad) sid join public.player_stats ps on ps.id = sid and ps.tournament_id = p_tournament;
    if v_total > 150 then raise exception 'Squad costs $%M, over the $150M budget', v_total; end if;
  end if;

  -- (d2) TRANSFER CAP — unchanged (free repairs keyed on `out` having no rows in public.matches).
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

  -- (e) F2 rev guard — unchanged.
  if v_found and v_existing.rev <> coalesce(p_base_rev, 0) then
    raise exception 'entry changed elsewhere' using errcode = '40001';
  end if;

  -- (f) F1(2) captain/vice lock — unchanged.
  for r_round in select distinct m.round from public.matches m where m.tournament_id = p_tournament and m.winner_id is not null loop
    v_inc := (select c->>'playerId' from jsonb_array_elements(coalesce(p_state->'captainHistory','[]'::jsonb)) c where c->>'round' = r_round limit 1);
    v_sto := (select c->>'playerId' from jsonb_array_elements(coalesce(v_existing.state->'captainHistory','[]'::jsonb)) c where c->>'round' = r_round limit 1);
    if coalesce(v_inc,'') <> coalesce(v_sto,'') then raise exception 'Cannot change your % captain — that round has already been played', r_round; end if;
    v_inc := (select c->>'playerId' from jsonb_array_elements(coalesce(p_state->'viceCaptainHistory','[]'::jsonb)) c where c->>'round' = r_round limit 1);
    v_sto := (select c->>'playerId' from jsonb_array_elements(coalesce(v_existing.state->'viceCaptainHistory','[]'::jsonb)) c where c->>'round' = r_round limit 1);
    if coalesce(v_inc,'') <> coalesce(v_sto,'') then raise exception 'Cannot change your % vice-captain — that round has already been played', r_round; end if;
  end loop;

  -- (f2) P6 — result-based squad + transfer freeze. Unchanged.
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

  -- (j) 1.4 TIER 2 — a cash-in must not dispose of a player the server can SEE is still alive.
  --     v_settled_round = the deepest round that is fully decided with no decided result after it:
  --     a round played out, next round drawn but unplayed. That is exactly the break at which the
  --     client opens the market (transferWindowOpen → roundPlayable), and its winners are exactly
  --     the survivors. When the server's copy is mid-ingest — some match of the newest round still
  --     unwritten — NO round qualifies, v_settled_round is null, and this gate stays silent rather
  --     than reject a manager whose Wikipedia poll simply beat our cron. FAIL OPEN IS DELIBERATE:
  --     an invalid result makes CloudSync revertToCloud(), i.e. a false rejection DELETES the
  --     manager's cash-in. Tier 1 above is the rule that never blinks; this one is the bonus.
  --
  --     Only NEWLY-declared cash-ins are tested (the `except` against the stored row, same shape as
  --     the P6 transfer check above). An old, already-accepted cash-in is never re-litigated, so
  --     the settled round rolling forward can never retroactively invalidate a stored entry.
  if v_locked and coalesce(array_length(v_cashed, 1), 0) > 0 then
    select r.round into v_settled_round from (
      select m.round,
             bool_and(m.winner_id is not null) as all_decided,
             max(array_position(v_round_order, m.round)) as pos
        from public.matches m
       where m.tournament_id = p_tournament
       group by m.round
    ) r
    where r.all_decided
      and not exists (select 1 from public.matches d
                       where d.tournament_id = p_tournament
                         and d.winner_id is not null
                         and array_position(v_round_order, d.round) > r.pos)
    order by r.pos desc limit 1;

    if v_settled_round is not null then
      for v_bad in
        select x from unnest(v_cashed) x
        except
        select jsonb_array_elements_text(coalesce(v_existing.state->'cashedIn','[]'::jsonb))
      loop
        if exists (select 1 from public.matches m
                    where m.tournament_id = p_tournament
                      and m.round = v_settled_round
                      and m.winner_id = v_bad) then
          raise exception 'Can''t cash in % — they are still in the tournament', v_bad;
        end if;
      end loop;
    end if;
  end if;

  -- (k) 1.4 — and a NEWLY signed player must not be one the server has already seen lose. Only
  --     ever fires on positive proof (a decided match this player lost), so it cannot false-reject
  --     during an ingest lag. Not load-bearing for security (signing a dead player only hurts the
  --     signer); it keeps the server's answer consistent with buyPlayer's own isEliminated guard.
  for v_bad in
    select jsonb_array_elements(coalesce(p_state->'transfers','[]'::jsonb))->>'in'
    except
    select jsonb_array_elements(coalesce(v_existing.state->'transfers','[]'::jsonb))->>'in'
  loop
    if exists (select 1 from public.matches m
                where m.tournament_id = p_tournament
                  and (m.p1_id = v_bad or m.p2_id = v_bad)
                  and m.winner_id is not null and m.winner_id <> v_bad) then
      raise exception 'Can''t sign % — they are already out of the tournament', v_bad;
    end if;
  end loop;

  -- (g) write. rev advances; score is never set here. Unchanged.
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
end $$;

revoke all on function public.save_entry(text, uuid, jsonb, bigint) from public, anon;
grant execute on function public.save_entry(text, uuid, jsonb, bigint) to authenticated;
