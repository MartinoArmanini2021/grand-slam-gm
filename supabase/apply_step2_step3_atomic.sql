-- ── Runbook step 2 — seed + save function, as ONE transaction ────────────────────────────────────
-- Paste this whole file into the Supabase SQL editor and Run it ONCE. It replaces what the runbook
-- originally described as two separate steps. Requires step 1 (player_stats_scope.sql) to be done.
--
-- ═══ WHY THIS FILE EXISTS — a correction to my own step order, caught before it ran ═══
--
-- Step 1 parked all 109 pre-existing rows under 'legacy_unscoped'. All 96 Cincinnati players were
-- ALREADY in that table (verified: 0 missing, 0 ranking/price/tier differences against the seed),
-- so naively seeding them under 'cincinnati_2026' would leave every Cincinnati player with TWO
-- rows — 205 rows, 96 duplicated ids.
--
-- The save_entry deployed right now is the pre-1.3 one. It joins the player table by id ALONE:
--
--     from unnest(v_squad) sid join public.player_stats ps on ps.id = sid
--
-- (rollback_save_entry_pre_1_3.sql lines 127 and 138 — the tier quota and the budget sum). With two
-- rows per player that join returns each squad member twice, so a legal 2/3/5 squad counts as
-- 4/6/10 and a $148M squad sums to $296M. Every save fails:
--     'Too many in a tier (Platinum 4/2, Gold 6/3, Silver 10/5)'
--     'Squad costs $296M, over the $150M budget'
--
-- And it is worse than a failed save. cloud.ts maps that raise to `invalid`, and CloudSync.tsx:261
-- responds to `invalid` by calling revertToCloud() — so the manager's captain change is DISCARDED
-- and overwritten with the server copy, under a toast accusing them of a rule they did not break.
-- Client-side pre-validation passes, so nothing catches it before the round trip.
--
-- Reversing the order does not help: the new function filters on tournament_id, would find no rows
-- yet, and would reject every squad as 'Squad contains an unknown player'.
--
-- ═══ WHAT THIS FILE DOES ABOUT IT ═══
--
-- Two independent defences, because this runs on a live game:
--
--   1. NO DUPLICATE EVER EXISTS. Rather than seeding a second copy alongside the parked one, the
--      96 Cincinnati players are MOVED from 'legacy_unscoped' to 'cincinnati_2026'. Ids stay unique
--      at every instant, so even the unscoped function that is live right now reads exactly one row
--      per player and behaves correctly throughout. End state is 109 rows, not 205.
--
--      The 96 are named explicitly below, taken from the seed. NOT selected by a "has price and
--      tier" heuristic — that would also promote bublik, davidovichfokina, diallo, moutet, munar,
--      popyrin and quinn, who are residue from older fields and are NOT in the Cincinnati draw.
--
--   2. ONE TRANSACTION. Even with unique ids, the seed and the function replacement commit together
--      or not at all, so no session can observe a half-applied state. DDL is transactional in
--      Postgres, so 'create or replace function' is covered. If anything fails, everything rolls
--      back and you are exactly where you started.
--
-- The transaction ends with assertions that RAISE if the end state is wrong — which rolls the whole
-- thing back and shows you an error, rather than reporting success over a half-done migration.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────

begin;

-- ═══ PART 1 of 3 — move the 96 Cincinnati players out of the parked set ══════════════════════════
-- Idempotent: re-running matches nothing, because they are no longer 'legacy_unscoped'.
update public.player_stats
   set tournament_id = 'cincinnati_2026'
 where tournament_id = 'legacy_unscoped'
   and id in (
  'zverev', 'augeraliassime', 'djokovic', 'shelton', 'medvedev', 'deminaur', 'fritz', 'cobolli',
  'jodar', 'tien', 'lehecka', 'musetti', 'mensik', 'ruud', 'rublev', 'vacherot', 'darderi',
  'fils', 'nakashima', 'tiafoe', 'paul', 'franciscocerundolo', 'fonseca', 'rinderknech',
  'tabilo', 'humbert', 'etcheverry', 'blockx', 'bergs', 'arnaldi', 'norrie', 'buse', 'fery',
  'collignon', 'khachanov', 'merida', 'michelsen', 'berrettini', 'struff', 'navone', 'atmane',
  'borges', 'shapovalov', 'tsitsipas', 'tirante', 'cerundolo', 'mannarino', 'baez', 'assche',
  'hanfmann', 'griekspoor', 'halys', 'zandschulp', 'burruchaga', 'machac', 'marozsan',
  'altmaier', 'kecmanovic', 'landaluce', 'majchrzak', 'hurkacz', 'vallejo', 'kopriva', 'busta',
  'medjedovic', 'brooksby', 'carabelli', 'choinski', 'royer', 'faria', 'cilic', 'bellucci',
  'fucsovics', 'svajda', 'duckworth', 'sonego', 'shimabukuro', 'trungelliti', 'wong',
  'hijikata', 'kovacevic', 'walton', 'prizmic', 'jong', 'droguet', 'zheng', 'connell',
  'jacquet', 'mejia', 'dimitrov', 'draper', 'lajal', 'shang', 'monfils', 'kokkinakis', 'wolf'
   );

-- ═══ PART 2 of 3 — the Cincinnati seed (verbatim from seed_cincinnati_player_stats.sql) ══════════
-- After part 1 these rows already exist with these exact values, so the upsert is a no-op that
-- corrects any drift and creates anything part 1 did not find. Belt and braces.

-- ── Cincinnati Open 2026 — player_stats seed for server-side validation + scoring ────────────────
-- WHY ALL FOUR COLUMNS: save_entry validates the TIER QUOTA off player_stats.tier and the BUDGET off
-- .price, and recompute-score reads .ranking for the upset multiplier. A row carrying only `ranking`
-- leaves tier/price NULL — the quota check then reads a legal 2/3/5 squad as 2/3/4 (so it can never
-- be locked) and sum(price) silently under-counts the budget. Every drafted player needs all four.
--
-- Generated by scripts/gen-seed.mjs from src/data/cincinnati2026Field.json (built from the published draw and reconciled
-- against Wikipedia: 0 missing, 0 phantom). 96 players.
--
-- SAFE TO RUN ANY TIME, INCLUDING WHILE ANOTHER EVENT IS STILL BEING SCORED: the generator verifies
-- that every player shared with an existing seed (70 of them) carries an IDENTICAL rank, price
-- and tier — so this only ADDS the 26 players new to this event and cannot
-- retroactively alter a past score. The upsert keeps it re-runnable.
--
-- Regenerate with:  node scripts/gen-seed.mjs cincinnati_2026

insert into public.player_stats (tournament_id, id, ranking, price, tier) values
  ('cincinnati_2026', 'zverev', 3, 50, 'Platinum'),
  ('cincinnati_2026', 'augeraliassime', 4, 34, 'Platinum'),
  ('cincinnati_2026', 'djokovic', 5, 37, 'Platinum'),
  ('cincinnati_2026', 'shelton', 6, 31, 'Platinum'),
  ('cincinnati_2026', 'medvedev', 7, 34, 'Platinum'),
  ('cincinnati_2026', 'deminaur', 8, 25, 'Platinum'),
  ('cincinnati_2026', 'fritz', 9, 23, 'Platinum'),
  ('cincinnati_2026', 'cobolli', 10, 18, 'Platinum'),
  ('cincinnati_2026', 'jodar', 11, 24, 'Gold'),
  ('cincinnati_2026', 'tien', 12, 22, 'Gold'),
  ('cincinnati_2026', 'lehecka', 14, 19, 'Gold'),
  ('cincinnati_2026', 'musetti', 15, 19, 'Gold'),
  ('cincinnati_2026', 'mensik', 16, 20, 'Gold'),
  ('cincinnati_2026', 'ruud', 17, 17, 'Gold'),
  ('cincinnati_2026', 'rublev', 18, 17, 'Gold'),
  ('cincinnati_2026', 'vacherot', 19, 14, 'Gold'),
  ('cincinnati_2026', 'darderi', 20, 16, 'Gold'),
  ('cincinnati_2026', 'fils', 21, 18, 'Gold'),
  ('cincinnati_2026', 'nakashima', 22, 16, 'Gold'),
  ('cincinnati_2026', 'tiafoe', 23, 16, 'Gold'),
  ('cincinnati_2026', 'paul', 24, 15, 'Gold'),
  ('cincinnati_2026', 'franciscocerundolo', 25, 15, 'Gold'),
  ('cincinnati_2026', 'fonseca', 26, 14, 'Silver'),
  ('cincinnati_2026', 'rinderknech', 28, 12, 'Silver'),
  ('cincinnati_2026', 'tabilo', 29, 11, 'Silver'),
  ('cincinnati_2026', 'humbert', 30, 12, 'Silver'),
  ('cincinnati_2026', 'etcheverry', 31, 10, 'Silver'),
  ('cincinnati_2026', 'blockx', 32, 11, 'Silver'),
  ('cincinnati_2026', 'bergs', 33, 11, 'Silver'),
  ('cincinnati_2026', 'arnaldi', 34, 10, 'Silver'),
  ('cincinnati_2026', 'norrie', 35, 12, 'Silver'),
  ('cincinnati_2026', 'buse', 36, 12, 'Silver'),
  ('cincinnati_2026', 'fery', 37, 13, 'Silver'),
  ('cincinnati_2026', 'collignon', 38, 10, 'Silver'),
  ('cincinnati_2026', 'khachanov', 39, 10, 'Silver'),
  ('cincinnati_2026', 'merida', 40, 12, 'Silver'),
  ('cincinnati_2026', 'michelsen', 41, 12, 'Silver'),
  ('cincinnati_2026', 'berrettini', 42, 10, 'Silver'),
  ('cincinnati_2026', 'struff', 43, 7, 'Silver'),
  ('cincinnati_2026', 'navone', 44, 8, 'Silver'),
  ('cincinnati_2026', 'atmane', 45, 9, 'Silver'),
  ('cincinnati_2026', 'borges', 47, 10, 'Silver'),
  ('cincinnati_2026', 'shapovalov', 48, 7, 'Silver'),
  ('cincinnati_2026', 'tsitsipas', 49, 9, 'Silver'),
  ('cincinnati_2026', 'tirante', 50, 10, 'Silver'),
  ('cincinnati_2026', 'cerundolo', 51, 9, 'Silver'),
  ('cincinnati_2026', 'mannarino', 52, 6, 'Silver'),
  ('cincinnati_2026', 'baez', 53, 10, 'Silver'),
  ('cincinnati_2026', 'assche', 54, 5, 'Silver'),
  ('cincinnati_2026', 'hanfmann', 55, 9, 'Silver'),
  ('cincinnati_2026', 'griekspoor', 56, 9, 'Silver'),
  ('cincinnati_2026', 'halys', 57, 10, 'Silver'),
  ('cincinnati_2026', 'zandschulp', 59, 9, 'Silver'),
  ('cincinnati_2026', 'burruchaga', 61, 5, 'Silver'),
  ('cincinnati_2026', 'machac', 62, 11, 'Silver'),
  ('cincinnati_2026', 'marozsan', 63, 8, 'Silver'),
  ('cincinnati_2026', 'altmaier', 65, 6, 'Silver'),
  ('cincinnati_2026', 'kecmanovic', 66, 6, 'Silver'),
  ('cincinnati_2026', 'landaluce', 67, 9, 'Silver'),
  ('cincinnati_2026', 'majchrzak', 68, 8, 'Silver'),
  ('cincinnati_2026', 'hurkacz', 69, 7, 'Silver'),
  ('cincinnati_2026', 'vallejo', 70, 6, 'Silver'),
  ('cincinnati_2026', 'kopriva', 71, 8, 'Silver'),
  ('cincinnati_2026', 'busta', 72, 8, 'Silver'),
  ('cincinnati_2026', 'medjedovic', 73, 8, 'Silver'),
  ('cincinnati_2026', 'brooksby', 74, 7, 'Silver'),
  ('cincinnati_2026', 'carabelli', 76, 6, 'Silver'),
  ('cincinnati_2026', 'choinski', 77, 8, 'Silver'),
  ('cincinnati_2026', 'royer', 78, 5, 'Silver'),
  ('cincinnati_2026', 'faria', 79, 6, 'Silver'),
  ('cincinnati_2026', 'cilic', 80, 7, 'Silver'),
  ('cincinnati_2026', 'bellucci', 81, 6, 'Silver'),
  ('cincinnati_2026', 'fucsovics', 82, 6, 'Silver'),
  ('cincinnati_2026', 'svajda', 84, 7, 'Silver'),
  ('cincinnati_2026', 'duckworth', 86, 6, 'Silver'),
  ('cincinnati_2026', 'sonego', 88, 6, 'Silver'),
  ('cincinnati_2026', 'shimabukuro', 90, 7, 'Silver'),
  ('cincinnati_2026', 'trungelliti', 91, 5, 'Silver'),
  ('cincinnati_2026', 'wong', 93, 6, 'Silver'),
  ('cincinnati_2026', 'hijikata', 95, 8, 'Silver'),
  ('cincinnati_2026', 'kovacevic', 96, 6, 'Silver'),
  ('cincinnati_2026', 'walton', 98, 6, 'Silver'),
  ('cincinnati_2026', 'prizmic', 103, 8, 'Silver'),
  ('cincinnati_2026', 'jong', 106, 6, 'Silver'),
  ('cincinnati_2026', 'droguet', 115, 7, 'Silver'),
  ('cincinnati_2026', 'zheng', 121, 5, 'Silver'),
  ('cincinnati_2026', 'connell', 127, 5, 'Silver'),
  ('cincinnati_2026', 'jacquet', 134, 5, 'Silver'),
  ('cincinnati_2026', 'mejia', 136, 5, 'Silver'),
  ('cincinnati_2026', 'dimitrov', 142, 5, 'Silver'),
  ('cincinnati_2026', 'draper', 147, 6, 'Silver'),
  ('cincinnati_2026', 'lajal', 150, 5, 'Silver'),
  ('cincinnati_2026', 'shang', 270, 4, 'Silver'),
  ('cincinnati_2026', 'monfils', 327, 4, 'Silver'),
  ('cincinnati_2026', 'kokkinakis', 443, 4, 'Silver'),
  ('cincinnati_2026', 'wolf', 688, 4, 'Silver')
on conflict (tournament_id, id) do update set ranking = excluded.ranking, price = excluded.price, tier = excluded.tier;

-- Verify: every entrant has a COMPLETE row (a NULL price or tier is the bug described above).
-- select count(*) filter (where price is not null and tier is not null) as complete,
--        count(*) filter (where price is null or tier is null)         as broken
--   from public.player_stats;

-- ═══ PART 3 of 3 — the validated write path (verbatim from save_entry_rpc.sql) ════════════════════

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

-- 1) Authoritative price + tier per player live in public.player_stats, seeded PER EVENT by
--    scripts/gen-seed.mjs (e.g. supabase/seed_cincinnati_player_stats.sql). save_entry validates
--    the TIER QUOTA off player_stats.tier and the BUDGET off .price, and recompute-score reads
--    .ranking for the upset multiplier. The tier boundaries live only in src/data/tiers.ts; the
--    table holds their snapshot so this RPC never reimplements them. A parity test
--    (entryValidation.test.ts) pins the seeds to PLAYERS.
--
-- NO SEED IS EMBEDDED IN THIS FILE ANY MORE, and that removal is a bug fix, not tidying.
-- This file used to carry a 77-row block — the Montréal field, re-aligned to Cincinnati's
-- rankings during the 2026-08-14 refresh and then stamped 'cincinnati_2026' when fix 1.3 added
-- the tournament column. Seven of those 77 (bublik, davidovichfokina, diallo, moutet, munar,
-- popyrin, quinn) are NOT in the 96-player Cincinnati draw. Applying this file would have
-- inserted them as Cincinnati rows, i.e. told the server that seven non-entrants were legal
-- picks for a tournament they are not playing in — and left Cincinnati at 103 rows, so the
-- count that is supposed to prove the seed is right would have quietly disagreed with the draw.
--
-- The seed and the function are now separate files on purpose: a seed is per-event data with a
-- generator and a cross-check, while this is code. Coupling them is what let a stale field ride
-- along inside a security fix. Run the event's seed file first, then this.

alter table public.player_stats add column if not exists price int;
alter table public.player_stats add column if not exists tier  text;

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

  -- LOCK + LOAD THE STORED ENTRY FIRST. This used to sit further down, after validation, which is
  -- what made the budget bypass possible: with no server-side copy to consult, gate (d) fell back to
  -- the client's own p_state. Taking the row lock here costs nothing extra (the same lock was taken
  -- a few statements later) and gives every check below a trustworthy view of what is actually saved.
  select * into v_existing from public.entries
    where user_id = v_uid and league_id = v_public and tournament_id = p_tournament for update;
  v_found := found;
  v_stored_has_transfers := v_found
    and jsonb_array_length(coalesce(v_existing.state->'transfers', '[]'::jsonb)) > 0;

  -- (b) every id is a real, known player
  -- SCOPED: a player is only 'known' for the tournament being saved (player_stats is keyed
  -- (tournament_id, id) since fix 1.3), so a squad can never be validated against another
  -- event's prices, tiers or rankings.
  if exists (select 1 from unnest(v_squad) sid where not exists (
      select 1 from public.player_stats ps where ps.id = sid and ps.tournament_id = p_tournament)) then
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
    from unnest(v_squad) sid join public.player_stats ps on ps.id = sid and ps.tournament_id = p_tournament;
  if (not v_locked) and (v_plat > 2 or v_gold > 3 or v_silv > 5) then
    raise exception 'Too many in a tier (Platinum %/2, Gold %/3, Silver %/5)', v_plat, v_gold, v_silv;
  end if;
  if v_locked and not v_touched and (v_plat <> 2 or v_gold <> 3 or v_silv <> 5) then
    raise exception 'Your squad must be exactly 2 Platinum, 3 Gold, 5 Silver to lock (got %/%/%)', v_plat, v_gold, v_silv;
  end if;

  -- (d) budget: sum of seeded prices ≤ 150, enforced while no transfers exist (post-lock
  --     transfers spend elimination refunds — a separate accounting, deferred to the freeze).
  --
  --     ⚠️ SECURITY: this gate MUST read the STORED entry, never p_state. p_state is the raw client
  --     payload, so deriving "has transfers" from it let any signed-in caller switch the cap off by
  --     inventing a single transfer entry — squad size and the 2/3/5 quota still held, the $150M did
  --     not, for the whole draft window. v_stored_has_transfers comes from the row we just locked,
  --     which only this RPC can write, so a client cannot influence it. Keep it that way.
  if not v_stored_has_transfers then
    select coalesce(sum(ps.price), 0) into v_total from unnest(v_squad) sid join public.player_stats ps on ps.id = sid and ps.tournament_id = p_tournament;
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
   where not exists (select 1 from public.player_stats ps where ps.id = t->>'out' and ps.tournament_id = p_tournament)   -- unknown id → never free
      or exists (select 1 from public.matches m
                  where m.tournament_id = p_tournament
                    and (m.p1_id = t->>'out' or m.p2_id = t->>'out'));

  -- (the entry was locked + loaded ABOVE, before validation, so gate (d) can trust it)

  -- (d3) apply the transfer cap now that the stored entry is loaded (see d2).
  select count(*) into v_prior_tr
    from jsonb_array_elements(case when v_found then coalesce(v_existing.state->'transfers', '[]'::jsonb) else '[]'::jsonb end) t
   where not exists (select 1 from public.player_stats ps where ps.id = t->>'out' and ps.tournament_id = p_tournament)   -- unknown id → never free
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

-- ═══ ASSERT before committing ════════════════════════════════════════════════════════════════════
-- The project's documented failure mode is a paste that reports success having done nothing. These
-- make that impossible for this file: any wrong end state raises, and the raise rolls back part 1,
-- part 2 and part 3 together.
do $$
declare
  v_cin int; v_incomplete int; v_legacy int; v_dupes int;
begin
  select count(*), count(*) filter (where price is null or tier is null)
    into v_cin, v_incomplete
    from public.player_stats where tournament_id = 'cincinnati_2026';

  select count(*) into v_legacy
    from public.player_stats where tournament_id = 'legacy_unscoped';

  select count(*) into v_dupes from (
    select id from public.player_stats group by id having count(*) > 1
  ) d;

  if v_cin <> 96 then
    raise exception 'Cincinnati should have exactly 96 players, found %', v_cin;
  end if;
  if v_incomplete <> 0 then
    raise exception '% Cincinnati row(s) are missing price or tier - a legal 2/3/5 squad would read as illegal and could never be locked', v_incomplete;
  end if;
  if v_dupes <> 0 then
    raise exception '% player id(s) appear under more than one tournament - the live save_entry joins on id alone and would double-count them', v_dupes;
  end if;
  if not exists (select 1 from pg_proc where proname = 'save_entry' and prosrc like '%v_stored_has_transfers%') then
    raise exception 'save_entry did not install the salary-cap fix (budget gate still reads the client payload)';
  end if;

  raise notice 'OK - cincinnati_2026 % players, 0 incomplete; legacy_unscoped %; 0 duplicate ids', v_cin, v_legacy;
end $$;

commit;

-- ── Verify AFTER the commit ──────────────────────────────────────────────────────────────────────
-- Expect exactly two rows:  cincinnati_2026  96  0   /   legacy_unscoped  13  6
-- select tournament_id, count(*) as players,
--        count(*) filter (where price is null or tier is null) as incomplete_rows
--   from public.player_stats group by tournament_id order by tournament_id;
