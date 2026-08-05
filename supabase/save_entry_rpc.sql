-- ─────────────────────────────────────────────────────────────────────────────
-- F1 (+ Phase-2 B2/B3) — Server-side entry validation + the SINGLE validated write path.
-- Apply in the Supabase SQL editor (idempotent). RE-RUN this if you applied an earlier
-- version — it now also (B3) pins the entry to the canonical public league inside save_entry
-- and rejects a crafted p_league, (B2) revokes the direct write path to `leagues`, and
-- (P6) freezes the drafted squad + transfers once the tournament has a result (so a late lock
-- can't capture winners into initialSquad, and a transfer can't score an already-played round).
--
-- F1: the client can no longer write entries.state directly, so it can never field an illegal
-- squad or retroactively re-pick a captain after a round's results are in. Every entry write
-- goes through save_entry(), which validates + version-guards atomically.
--
-- ⚠️ PREREQUISITE: run supabase/add_entry_rev.sql first (this RPC writes entries.rev).
-- ⚠️ DEPLOY ORDER: deploy the client that calls save_entry FIRST (it falls back to the old
-- path until this RPC exists), THEN run this file. After this runs, direct writes to
-- entries are revoked — the RPC is the only way in for a client.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Authoritative price + tier per player, SEEDED from the client's canonical values
--    (getTier / PLAYERS[i].price). The tier boundaries live only in src/data/tiers.ts —
--    this table holds their SNAPSHOT so the RPC never reimplements them. A parity test
--    (entryValidation.test.ts) pins these to PLAYERS; re-seed by regenerating this block
--    if the field or the pricing model changes. Prices are a point-in-time snapshot: they
--    are fixed for the tournament (rank/form/surface don't change mid-event).
alter table public.player_stats add column if not exists price int;
alter table public.player_stats add column if not exists tier  text;

insert into public.player_stats (id, ranking, price, tier) values
  ('zverev', 2, 50, 'Platinum'),
  ('augeraliassime', 4, 34, 'Platinum'),
  ('shelton', 6, 25, 'Platinum'),
  ('deminaur', 5, 32, 'Platinum'),
  ('fritz', 10, 25, 'Platinum'),
  ('medvedev', 8, 33, 'Platinum'),
  ('cobolli', 9, 20, 'Platinum'),
  ('bublik', 11, 19, 'Gold'),
  ('ruud', 13, 20, 'Gold'),
  ('rublev', 14, 20, 'Gold'),
  ('lehecka', 12, 21, 'Gold'),
  ('musetti', 15, 21, 'Gold'),
  ('darderi', 21, 15, 'Gold'),
  ('tien', 16, 18, 'Gold'),
  ('mensik', 18, 19, 'Gold'),
  ('tiafoe', 17, 18, 'Gold'),
  ('vacherot', 19, 15, 'Gold'),
  ('franciscocerundolo', 22, 17, 'Gold'),
  ('khachanov', 26, 13, 'Silver'),
  ('davidovichfokina', 20, 15, 'Gold'),
  ('fils', 23, 18, 'Gold'),
  ('paul', 24, 16, 'Gold'),
  ('jodar', 25, 16, 'Gold'),
  ('fonseca', 28, 14, 'Silver'),
  ('rinderknech', 27, 11, 'Silver'),
  ('norrie', 39, 10, 'Silver'),
  ('humbert', 29, 13, 'Silver'),
  ('nakashima', 32, 12, 'Silver'),
  ('etcheverry', 31, 10, 'Silver'),
  ('tabilo', 30, 12, 'Silver'),
  ('buse', 35, 13, 'Silver'),
  ('arnaldi', 33, 9, 'Silver'),
  ('blockx', 38, 10, 'Silver'),
  ('bergs', 34, 10, 'Silver'),
  ('navone', 47, 7, 'Silver'),
  ('moutet', 40, 8, 'Silver'),
  ('mannarino', 46, 7, 'Silver'),
  ('shapovalov', 67, 6, 'Silver'),
  ('cerundolo', 50, 9, 'Silver'),
  ('collignon', 37, 11, 'Silver'),
  ('munar', 43, 10, 'Silver'),
  ('majchrzak', 71, 9, 'Silver'),
  ('michelsen', 44, 11, 'Silver'),
  ('quinn', 45, 8, 'Silver'),
  ('hurkacz', 70, 6, 'Silver'),
  ('borges', 48, 9, 'Silver'),
  ('kecmanovic', 58, 6, 'Silver'),
  ('berrettini', 42, 11, 'Silver'),
  ('atmane', 49, 8, 'Silver'),
  ('marozsan', 54, 8, 'Silver'),
  ('zandschulp', 55, 8, 'Silver'),
  ('tirante', 57, 9, 'Silver'),
  ('hanfmann', 52, 9, 'Silver'),
  ('shang', 270, 4, 'Silver'),
  ('baez', 56, 9, 'Silver'),
  ('griekspoor', 66, 7, 'Silver'),
  ('carabelli', 69, 6, 'Silver'),
  ('landaluce', 62, 10, 'Silver'),
  ('altmaier', 61, 5, 'Silver'),
  ('cilic', 86, 7, 'Silver'),
  ('kopriva', 68, 8, 'Silver'),
  ('burruchaga', 60, 5, 'Silver'),
  ('svajda', 73, 7, 'Silver'),
  ('bellucci', 79, 6, 'Silver'),
  ('medjedovic', 72, 9, 'Silver'),
  ('sonego', 77, 7, 'Silver'),
  ('kovacevic', 93, 6, 'Silver'),
  ('busta', 65, 9, 'Silver'),
  ('vallejo', 63, 6, 'Silver'),
  ('struff', 41, 8, 'Silver'),
  ('royer', 75, 4, 'Silver'),
  ('fucsovics', 76, 7, 'Silver'),
  ('duckworth', 82, 6, 'Silver'),
  ('diallo', 92, 6, 'Silver')
on conflict (id) do update set ranking = excluded.ranking, price = excluded.price, tier = excluded.tier;

-- 2) The single validated write path. SECURITY DEFINER (runs as the table owner, bypassing
--    RLS) but self-checks auth.uid(), so a caller can only ever write their OWN entry. It
--    NEVER touches score (server-authoritative). Mirrors src/data/entryValidation.ts.
create or replace function public.save_entry(
  p_tournament text, p_league uuid, p_state jsonb, p_base_rev bigint
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_squad text[];
  v_phase text := coalesce(p_state->>'phase', 'draft');
  v_locked boolean := (coalesce(p_state->>'phase', 'draft') <> 'draft');
  v_has_transfers boolean := jsonb_array_length(coalesce(p_state->'transfers', '[]'::jsonb)) > 0;
  v_size int; v_distinct int; v_total int;
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
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  -- B3: pin the entry to the canonical PUBLIC league and reject any other p_league. Entries
  -- only ever live in the public league (private-league boards join on user_id, not on the
  -- entry's league_id), so accepting an arbitrary p_league would let a client create a SECOND
  -- entry for the same tournament under a different league_id — a duplicate row on the board.
  -- Deriving the league here (not trusting the client) makes one entry per user per tournament.
  select id into v_public from public.leagues where is_public limit 1;
  if v_public is null then raise exception 'No public league configured'; end if;
  if p_league is distinct from v_public then raise exception 'Invalid league for this entry'; end if;

  v_squad := array(select jsonb_array_elements_text(coalesce(p_state->'myTeam', '[]'::jsonb)));
  v_size := coalesce(array_length(v_squad, 1), 0);
  v_distinct := (select count(distinct x) from unnest(v_squad) x);

  -- (a) no duplicates; size ≤ 10 always. NOTE: a locked squad may now hold FEWER than 10 —
  -- mid-tournament a manager can CASH IN an eliminated player and leave the slot empty (play a
  -- man down) or buy any-tier replacement later. The exact-10 lock is enforced only at draft
  -- time by the client's finalizeDraft, so the initial locked squad always arrives as 10.
  if v_distinct <> v_size then raise exception 'Squad has duplicate players'; end if;
  if v_size > 10 then raise exception 'Squad can''t exceed 10 players (got %)', v_size; end if;

  -- (b) every id is a real, known player
  if exists (select 1 from unnest(v_squad) sid where not exists (select 1 from public.player_stats ps where ps.id = sid)) then
    raise exception 'Squad contains an unknown player';
  end if;

  -- (c) tier quota — the 2/3/5 structure is enforced ONLY during the draft (tier from the seeded
  -- column). Once the squad is locked, mid-tournament Cash-In-and-buy lets a manager buy ANY tier
  -- with the refunded money, so the composition may drift away from 2/3/5 (budget is the only limit).
  select
    count(*) filter (where ps.tier = 'Platinum'),
    count(*) filter (where ps.tier = 'Gold'),
    count(*) filter (where ps.tier = 'Silver')
    into v_plat, v_gold, v_silv
    from unnest(v_squad) sid join public.player_stats ps on ps.id = sid;
  if (not v_locked) and (v_plat > 2 or v_gold > 3 or v_silv > 5) then
    raise exception 'Too many in a tier (Platinum %/2, Gold %/3, Silver %/5)', v_plat, v_gold, v_silv;
  end if;

  -- (d) budget: sum of seeded prices ≤ 150, enforced while no transfers exist (post-lock
  --     transfers spend elimination refunds — a separate accounting, deferred to the freeze).
  if not v_has_transfers then
    select coalesce(sum(ps.price), 0) into v_total from unnest(v_squad) sid join public.player_stats ps on ps.id = sid;
    if v_total > 150 then raise exception 'Squad costs $%M, over the $150M budget', v_total; end if;
  end if;

  -- Lock + load the existing entry (atomic rev guard + captain lock in one txn).
  select * into v_existing from public.entries
    where user_id = v_uid and league_id = v_public and tournament_id = p_tournament for update;
  v_found := found;

  -- (e) F2 rev guard — the entry must be at the rev the client last read.
  if v_found and v_existing.rev <> coalesce(p_base_rev, 0) then
    raise exception 'entry changed elsewhere' using errcode = '40001'; -- client detects → converge
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

  -- (f2) P6 — result-based squad + transfer freeze: the squad-membership twin of the captain
  --      lock above. Once a result is in you can't lock/re-lock a squad whose results you can
  --      already see (a late draft picking winners — the twin of the P3 hole), nor transfer a
  --      player into a round that's already under way.
  v_result_rounds := array(select distinct m.round from public.matches m
    where m.tournament_id = p_tournament and m.winner_id is not null);
  v_started := array_length(v_result_rounds, 1) is not null;
  if v_started then
    -- (h) the drafted squad (initialSquad) is frozen once the tournament has a result. Compared
    --     order-insensitively — only a genuine change (or a first, too-late lock) is rejected.
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

    -- (i) a NEWLY added transfer can't score a round whose result is already in. A transfer is
    --     logged against round X and first scores the NEXT round; reject it if that next round
    --     already has a result (you'd be swapping in a player after seeing that round play out).
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
end $$;

revoke all on function public.save_entry(text, uuid, jsonb, bigint) from public, anon;
grant execute on function public.save_entry(text, uuid, jsonb, bigint) to authenticated;

-- 3) THE SECURITY BOUNDARY — close the direct write path. After this, a client (authenticated
--    OR anon) cannot INSERT/UPDATE entries at all; save_entry (definer) and the recompute-score
--    service role are the only writers. SELECT stays open (the leaderboard reads entries).
--    A raw PATCH to entries.state now returns 403 — verified by scripts/verify-save-entry.mjs.
--    (anon has no update policy today so a raw write already changes nothing, but we revoke
--    the privilege explicitly so the boundary is unambiguous — a future accidental grant
--    still can't reopen it.)
revoke insert, update on public.entries from authenticated;
revoke insert, update on public.entries from anon;

-- 4) B2 — close the direct write path to LEAGUES. The RLS "create league" policy allowed any
--    authenticated user to INSERT a league with no restriction on is_public — i.e. create a
--    rogue PUBLIC league (publicLeagueId() picks is_public LIMIT 1, so a second one could route
--    entries to the wrong board) or spam leagues. The app only ever creates leagues via the
--    create_league RPC (SECURITY DEFINER, unaffected by these revokes), so close the raw path.
drop policy if exists "create league" on public.leagues;
revoke insert, update, delete on public.leagues from authenticated;
revoke insert, update, delete on public.leagues from anon;
