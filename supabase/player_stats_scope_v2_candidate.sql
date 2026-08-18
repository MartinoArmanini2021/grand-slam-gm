-- ── Scope player_stats by tournament (fix 1.3) — SINGLE-STATEMENT FORM ───────────────────────────
-- Apply ONCE in the Supabase SQL editor. Idempotent — safe to re-run, and safe to run after a
-- partially-applied earlier attempt.
--
-- WHY THIS SHAPE. The first version of this file was a script: begin; three ALTERs; a DO block; an
-- index; commit; then two verification SELECTs. Pasted into the Supabase SQL editor it reported
-- "Success. No rows returned" and applied NOTHING — the tournament_id column did not exist
-- afterwards. Rather than diagnose the editor, this version removes every way the script could be
-- partially interpreted: it is ONE statement. A DO block cannot half-run — it either completes or
-- raises, and it carries its own implicit transaction, so no explicit begin/commit is needed (that
-- explicit transaction control, nested inside the editor's own, is the prime suspect).
--
-- Every DDL statement goes through EXECUTE so it is planned at the moment it runs, not when the
-- block is first parsed. Without that, the UPDATE referencing tournament_id could be planned before
-- the ALTER that creates the column.
--
-- It RAISES at the end if the key did not swap, so the editor cannot report success on a no-op
-- again. That is the whole point: the previous failure mode was silence.
--
-- THE PROBLEM IT FIXES. public.player_stats was keyed on `id` alone, with no notion of which
-- tournament a row described. recompute-score reads `ranking` from it every 3 minutes, and
-- save_entry reads `price`/`tier` for the salary cap and the 2/3/5 quota. Seeding a new field
-- overwrote the shared ids, so the next scoring run silently recomputed EVERY tournament —
-- including finished ones — against the new event's rankings. Past results drifted.
--
-- EXISTING ROWS — THE OBVIOUS ASSUMPTION IS WRONG. The table holds 109 rows; Cincinnati's field is
-- 96. The extra 13 are residue from earlier global seeds (Sinner at rank 1, Wawrinka, Safiullin),
-- SIX carrying NULL price/tier. Stamping all 109 as cincinnati_2026 would enshrine that residue as
-- live data. So every pre-existing row is parked under 'legacy_unscoped' and the Cincinnati seed
-- (runbook step 2) writes the 96 real entrants. Parked, not deleted: nothing can reach it, it is one
-- UPDATE to recover, and deleting rows on a live database to tidy up is not a trade worth making.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────

do $$
declare
  v_pk text;
  v_parked int;
begin
  -- 1) The column. EXECUTE so each statement is planned when it runs.
  execute 'alter table public.player_stats add column if not exists tournament_id text';
  execute 'update public.player_stats set tournament_id = ''legacy_unscoped'' where tournament_id is null';
  get diagnostics v_parked = row_count;
  execute 'alter table public.player_stats alter column tournament_id set not null';

  -- 2) Swap the key (id) → (tournament_id, id). Guarded on the CURRENT definition, so a second run
  --    is a no-op rather than an error.
  select pg_get_constraintdef(oid) into v_pk
    from pg_constraint
   where conrelid = 'public.player_stats'::regclass and contype = 'p';

  if v_pk is null then
    -- No primary key at all. Not what we expect, but adding the right one is still correct, and
    -- the seed's `on conflict (tournament_id, id)` REQUIRES it — without this the seed would fail.
    execute 'alter table public.player_stats add constraint player_stats_pkey primary key (tournament_id, id)';
  elsif v_pk = 'PRIMARY KEY (id)' then
    execute 'alter table public.player_stats drop constraint player_stats_pkey';
    execute 'alter table public.player_stats add constraint player_stats_pkey primary key (tournament_id, id)';
  elsif v_pk <> 'PRIMARY KEY (tournament_id, id)' then
    raise exception 'player_stats has an unexpected primary key: %. Stopping rather than guessing.', v_pk;
  end if;

  -- 3) Every lookup in save_entry and recompute-score filters on tournament_id.
  execute 'create index if not exists player_stats_tournament_idx on public.player_stats (tournament_id)';

  -- 4) ASSERT. The previous version could report success having done nothing; this cannot.
  select pg_get_constraintdef(oid) into v_pk
    from pg_constraint
   where conrelid = 'public.player_stats'::regclass and contype = 'p';
  if v_pk is distinct from 'PRIMARY KEY (tournament_id, id)' then
    raise exception 'MIGRATION DID NOT APPLY: primary key is % (expected PRIMARY KEY (tournament_id, id))',
      coalesce(v_pk, 'NONE');
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'player_stats'
                    and column_name = 'tournament_id' and is_nullable = 'NO') then
    raise exception 'MIGRATION DID NOT APPLY: tournament_id missing or nullable';
  end if;

  raise notice 'OK — key is %, % row(s) parked as legacy_unscoped this run', v_pk, v_parked;
end $$;
