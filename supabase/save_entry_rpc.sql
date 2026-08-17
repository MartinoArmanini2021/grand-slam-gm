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
-- NB (2026-08-14): player_stats is ONE table shared by every event, so these rows were re-aligned to
-- the ACTIVE event (Cincinnati) after two data corrections: the 2026 form refresh (added Montréal,
-- fixed the Båstad/Washington short-code collision) and — the bigger one — a current ATP ranking
-- snapshot. The pool had been carrying ranks dated 2026-07-20, i.e. BEFORE Washington and Montréal;
-- Jódar was seeded 12 here while listed at rank 25. 61 rankings, 27 prices and 1 tier moved
-- (Nakashima Silver→Gold). Ranking feeds the UPSET MULTIPLIER, so this changes future scoring —
-- safe because recompute-score only ever scores active_tournament_id(), and Montréal is complete
-- and frozen. Do NOT re-point app_config at a finished event after a ranking refresh: it would
-- rescore that event against ranks it was never played under.
-- Regenerate with scripts/apply-rankings.mjs → build-field.mjs → gen-seed.mjs (which cross-checks
-- every seed against this block).
alter table public.player_stats add column if not exists price int;
alter table public.player_stats add column if not exists tier  text;

insert into public.player_stats (id, ranking, price, tier) values
  ('zverev', 3, 50, 'Platinum'),
  ('augeraliassime', 4, 34, 'Platinum'),
  ('shelton', 6, 31, 'Platinum'),
  ('deminaur', 8, 25, 'Platinum'),
  ('fritz', 9, 23, 'Platinum'),
  ('medvedev', 7, 34, 'Platinum'),
  ('cobolli', 10, 18, 'Platinum'),
  ('bublik', 11, 19, 'Gold'),
  ('ruud', 17, 17, 'Gold'),
  ('rublev', 18, 17, 'Gold'),
  ('lehecka', 14, 19, 'Gold'),
  ('musetti', 15, 19, 'Gold'),
  ('darderi', 20, 16, 'Gold'),
  ('tien', 12, 22, 'Gold'),
  ('mensik', 16, 20, 'Gold'),
  ('tiafoe', 23, 16, 'Gold'),
  ('vacherot', 19, 14, 'Gold'),
  ('franciscocerundolo', 25, 15, 'Gold'),
  ('khachanov', 39, 10, 'Silver'),
  ('davidovichfokina', 20, 15, 'Gold'),
  ('fils', 21, 18, 'Gold'),
  ('paul', 24, 15, 'Gold'),
  ('jodar', 11, 24, 'Gold'),
  ('fonseca', 26, 14, 'Silver'),
  ('rinderknech', 28, 12, 'Silver'),
  ('norrie', 35, 12, 'Silver'),
  ('humbert', 30, 12, 'Silver'),
  ('nakashima', 22, 16, 'Gold'),
  ('etcheverry', 31, 10, 'Silver'),
  ('tabilo', 29, 11, 'Silver'),
  ('buse', 36, 12, 'Silver'),
  ('arnaldi', 34, 10, 'Silver'),
  ('blockx', 32, 11, 'Silver'),
  ('bergs', 33, 11, 'Silver'),
  ('navone', 44, 8, 'Silver'),
  ('moutet', 40, 8, 'Silver'),
  ('mannarino', 52, 6, 'Silver'),
  ('shapovalov', 48, 7, 'Silver'),
  ('cerundolo', 51, 9, 'Silver'),
  ('collignon', 38, 10, 'Silver'),
  ('munar', 43, 10, 'Silver'),
  ('majchrzak', 68, 8, 'Silver'),
  ('michelsen', 41, 12, 'Silver'),
  ('quinn', 45, 8, 'Silver'),
  ('hurkacz', 69, 7, 'Silver'),
  ('borges', 47, 10, 'Silver'),
  ('kecmanovic', 66, 6, 'Silver'),
  ('berrettini', 42, 10, 'Silver'),
  ('atmane', 45, 9, 'Silver'),
  ('marozsan', 63, 8, 'Silver'),
  ('zandschulp', 59, 9, 'Silver'),
  ('tirante', 50, 10, 'Silver'),
  ('hanfmann', 55, 9, 'Silver'),
  ('shang', 270, 4, 'Silver'),
  ('baez', 53, 10, 'Silver'),
  ('griekspoor', 56, 9, 'Silver'),
  ('carabelli', 76, 6, 'Silver'),
  ('landaluce', 67, 9, 'Silver'),
  ('altmaier', 65, 6, 'Silver'),
  ('cilic', 80, 7, 'Silver'),
  ('kopriva', 71, 8, 'Silver'),
  ('burruchaga', 61, 5, 'Silver'),
  ('svajda', 84, 7, 'Silver'),
  ('bellucci', 81, 6, 'Silver'),
  ('medjedovic', 73, 8, 'Silver'),
  ('sonego', 88, 6, 'Silver'),
  ('kovacevic', 96, 6, 'Silver'),
  ('busta', 72, 8, 'Silver'),
  ('vallejo', 70, 6, 'Silver'),
  ('struff', 43, 7, 'Silver'),
  ('royer', 78, 5, 'Silver'),
  ('fucsovics', 82, 6, 'Silver'),
  ('duckworth', 86, 6, 'Silver'),
  ('diallo', 92, 6, 'Silver'),
  ('merida', 40, 12, 'Silver'),
  ('popyrin', 104, 4, 'Silver'),
  ('droguet', 115, 7, 'Silver')
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
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  -- RATE GUARD (defense-in-depth vs a save FLOOD — the Aug-2026 save-storm, ~89M expensive
  -- conflicts/24h from a stuck tab). A transaction-scoped advisory lock keyed on the user means
  -- only ONE save_entry may run at a time per account. A burst of concurrent saves (a stuck tab,
  -- a second device, or a malicious direct caller with a valid JWT) is rejected HERE — cheaply,
  -- before the expensive `SELECT … FOR UPDATE` and the matches scan below — instead of piling up
  -- expensive row locks and exhausting the pool. Auto-released at transaction end.
  --   Why errcode 40001: the client already treats 40001 as a "conflict → converge on the cloud
  --   copy" and trips its circuit breaker after a few in a row. So a legit two-tab race converges
  --   safely (last-write-wins, as today), and a real flood self-limits via the client breaker —
  --   with NO client change. A single well-behaved tab (which serialises its own saves) never hits
  --   this, so normal play is completely unaffected.
  if not pg_try_advisory_xact_lock(hashtext('save_entry:' || v_uid::text)::bigint) then
    raise exception 'A save is already in progress for your account — converging' using errcode = '40001';
  end if;

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

  -- (a) no duplicates; size ≤ 10 always; EXACTLY 10 at lock (the pristine draft). Only AFTER the
  -- manager starts cashing in / buying (v_touched) may a locked squad drop below 10 (cash in and
  -- leave the slot empty). So the squad always BEGINS at 10 and only gains flexibility in-play.
  if v_distinct <> v_size then raise exception 'Squad has duplicate players'; end if;
  if v_size > 10 then raise exception 'Squad can''t exceed 10 players (got %)', v_size; end if;
  if v_locked and not v_touched and v_size <> 10 then raise exception 'Your squad must be exactly 10 players to lock (got %)', v_size; end if;

  -- (b) every id is a real, known player
  if exists (select 1 from unnest(v_squad) sid where not exists (select 1 from public.player_stats ps where ps.id = sid)) then
    raise exception 'Squad contains an unknown player';
  end if;

  -- (c) tier quota (tier from the seeded column): during the DRAFT never OVER 2/3/5, and the
  -- pristine locked squad must be EXACTLY 2/3/5. Only after the manager begins cashing in / buying
  -- (v_touched) may the composition drift — any tier, budget being the only limit.
  select
    count(*) filter (where ps.tier = 'Platinum'),
    count(*) filter (where ps.tier = 'Gold'),
    count(*) filter (where ps.tier = 'Silver')
    into v_plat, v_gold, v_silv
    from unnest(v_squad) sid join public.player_stats ps on ps.id = sid;
  if (not v_locked) and (v_plat > 2 or v_gold > 3 or v_silv > 5) then
    raise exception 'Too many in a tier (Platinum %/2, Gold %/3, Silver %/5)', v_plat, v_gold, v_silv;
  end if;
  if v_locked and not v_touched and (v_plat <> 2 or v_gold <> 3 or v_silv <> 5) then
    raise exception 'Your squad must be exactly 2 Platinum, 3 Gold, 5 Silver to lock (got %/%/%)', v_plat, v_gold, v_silv;
  end if;

  -- (d) budget: sum of seeded prices ≤ 150, enforced while no transfers exist (post-lock
  --     transfers spend elimination refunds — a separate accounting, deferred to the freeze).
  if not v_has_transfers then
    select coalesce(sum(ps.price), 0) into v_total from unnest(v_squad) sid join public.player_stats ps on ps.id = sid;
    if v_total > 150 then raise exception 'Squad costs $%M, over the $150M budget', v_total; end if;
  end if;

  -- (d2) TRANSFER CAP (mirrors MAX_TRANSFERS in src/data/squadRules.ts — keep in sync).
  --      Unlimited re-signing let the optimal manager recycle every loss into the best surviving
  --      player each round, so all squads converged and drafting stopped mattering (simulation:
  --      the best-vs-worst drafter gap collapsed from 45.3 pts to 11.5). Capped at 3.
  --      Compared against GREATEST(cap, what's already stored) so an entry that is already over
  --      the cap (made before this rule) can still be saved unchanged — only ADDING is refused.
  --      FREE REPAIRS: replacing a player who never reached a SCORED round doesn't spend the
  --      allowance — they never got to play for you. The test is the player who went OUT: if no row
  --      in public.matches names them, they never entered a scored round, because the ingest writes
  --      only scored rounds and deliberately never the Masters' unscored opening round (the one the
  --      32 seeds bye past). That covers both shapes of never-arrived — lost the opening round, or
  --      withdrew before it. Derived from the matches table, never a client flag, so it can't be
  --      spoofed. NB it is keyed on `out`, NOT on the transfer's `round`: the round stamp must stay
  --      truthful for scoring (it fixes when the signing starts earning), so a repair made during
  --      the R64→R32 break is stamped R64 — and charging off that stamp billed a manager for an
  --      opening-round repair purely because they did it after the first scored round. Mirrors
  --      transfersUsed() in src/data/tournament.ts (openingRoundExit).
  select count(*) into v_tr_count
    from jsonb_array_elements(coalesce(p_state->'transfers', '[]'::jsonb)) t
   where not exists (select 1 from public.player_stats ps where ps.id = t->>'out')   -- unknown id → never free
      or exists (select 1 from public.matches m
                  where m.tournament_id = p_tournament
                    and (m.p1_id = t->>'out' or m.p2_id = t->>'out'));

  -- Lock + load the existing entry (atomic rev guard + captain lock in one txn).
  select * into v_existing from public.entries
    where user_id = v_uid and league_id = v_public and tournament_id = p_tournament for update;
  v_found := found;

  -- (d3) apply the transfer cap now that the stored entry is loaded (see d2).
  select count(*) into v_prior_tr
    from jsonb_array_elements(case when v_found then coalesce(v_existing.state->'transfers', '[]'::jsonb) else '[]'::jsonb end) t
   where not exists (select 1 from public.player_stats ps where ps.id = t->>'out')   -- unknown id → never free
      or exists (select 1 from public.matches m
                  where m.tournament_id = p_tournament
                    and (m.p1_id = t->>'out' or m.p2_id = t->>'out'));
  if v_tr_count > greatest(3, v_prior_tr) then
    raise exception 'You have used all 3 transfers for this tournament';
  end if;

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
