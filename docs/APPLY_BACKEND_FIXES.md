# Apply sequence — backend fixes 1.2, 1.3, 1.4

**Runs against the LIVE database while Cincinnati is mid-tournament with four active managers.**
The order is load-bearing. Follow it top to bottom. Nothing here deploys the app itself.

> **This runbook was adversarially reviewed before you were given it**, and the review found real
> faults in the first draft — a wrong expected output, a rollback that could not execute, and a
> false assumption about what is in the table. Those are fixed below. What survived the review is
> the core claim: **the gaps between steps are safe**, because the function currently live looks
> players up by id alone and each id still resolves to exactly one row throughout.

---

## Before you start

**Pick your moment: between rounds.** No step blocks saves for more than a second, but if something
goes wrong you want managers idle rather than mid-draft.

**You need:** the Supabase SQL editor, and a terminal in `C:\Users\marti\tennis-fantasy`.

To copy any file to your clipboard, in the **terminal**:

```
Get-Content C:\Users\marti\tennis-fantasy\<file> -Raw | Set-Clipboard
```

**What is actually in the player table.** It holds **109 rows, but Cincinnati has only 96 players.**
The extra 13 are leftovers from older seeds — Sinner, Wawrinka, Safiullin and others who are in no
current field, six of them missing price/tier. The migration therefore does *not* guess: it parks
everything under `legacy_unscoped`, and the seed in step 2 defines what Cincinnati is. After step 2,
Cincinnati contains exactly 96 players — provable rather than assumed.

---

## Step 1 — the migration

SQL editor, new query, paste `supabase/player_stats_scope.sql`, Run.

**Expected output — two results.**

1. The grouped count:

```
tournament_id      players   incomplete_rows
legacy_unscoped    109       6
```

`incomplete_rows = 6` is **expected here** — those are the leftovers with missing price/tier. They
become harmless the moment step 2 gives Cincinnati its own clean rows.

2. The key assertion, which must read exactly:

```
PRIMARY KEY (tournament_id, id)
```

**If any of this differs, stop and tell me.** A mismatch is a stop condition, not a curiosity.

**Why first.** The new save function asks "which tournament does this player belong to?". Applied
before the column exists, every squad save fails instantly.

**Is the gap safe?** Yes. The live function looks players up by id alone, and every row still has a
unique id, so saves keep working normally until step 3.

**If it fails:** nothing changed — the file runs in a transaction and rolls back whole.

---

## Step 2 — Cincinnati's own player rows

SQL editor, paste `supabase/seed_cincinnati_player_stats.sql`, Run.

**Expected:** no errors. Re-run the grouped query from step 1 and you should now see:

```
tournament_id      players   incomplete_rows
cincinnati_2026    96        0
legacy_unscoped    109       6
```

**`cincinnati_2026` must be 96 with 0 incomplete.** A NULL price or tier is the fault that reads a
legal 2/3/5 squad as 2/3/4, so it can never be locked.

**This step is new** and must come before step 3: the new save function reads Cincinnati's rows, and
until this runs there are none.

---

## Step 3 — the validated write path

SQL editor, paste `supabase/save_entry_rpc.sql`, Run.

This one file delivers **both** the salary-cap fix (1.2) and the tournament scoping (1.3). It
replaces the function wholesale — no partial state.

**One late change you should know about.** Until this morning this file *also* re-seeded the player
table, carrying 77 rows left over from Montréal. Seven of them — Bublik, Davidovich Fokina, Diallo,
Moutet, Munar, Popyrin and Quinn — **are not in the Cincinnati draw.** Running it would have told
the server those seven were legal Cincinnati picks and pushed the table to 103 rows, so step 2's
count would no longer have matched the draw. The seed block is gone; seeding is step 2's job and
only step 2's. A test now fails if a seed ever creeps back into this file.

**Re-run step 1's grouped query afterwards.** It must still say `cincinnati_2026 96 0`. If step 3
changed that number, something re-seeded and I want to know.

**Verify the cap fix took** — expect `t`:

```sql
select prosrc like '%v_stored_has_transfers%' as budget_gate_reads_stored_row
from pg_proc where proname = 'save_entry';
```

**Then save a squad yourself** — open the app, change a captain, save. This is the first moment the
scoped lookups are exercised for real.

---

## Step 4 — the scorer

```
npx supabase functions deploy recompute-score --project-ref mrdmlfumdsxufifjulbt
```

**Why after the migration.** It now filters rankings by tournament; deployed earlier it would error
every run and scoring would stop. Meanwhile the deployed version reads rankings unfiltered, which
returns the same rows, so nothing drifts while you work.

---

## Step 5 — the results feed

```
npx supabase functions deploy ingest-draw --project-ref mrdmlfumdsxufifjulbt
```

Carries the draw shape guard (1.1) and the removal of the hardcoded default (1.4). Independent of
the migration — its position is convenience.

**One deliberate behaviour change:** it now refuses a call that does not name a tournament rather
than assuming Montréal. Your crons always name one. A bare manual invoke will answer `400` by design.

---

## Step 6 — verify

**Capture the scores BEFORE step 1** — do this now and keep the output:

```sql
select user_id, score from public.entries
where tournament_id = 'cincinnati_2026' order by score desc;
```

Five minutes after step 5, run it again — **every number must be identical.** Nothing in this
sequence should move a single point. If one moved, that is a real finding and I want to see it.

Then the pipeline:

```sql
select 'ingest'  as feed, last_run_at, ok, error from public.ingest_health  where tournament_id = public.active_tournament_id()
union all
select 'scoring' as feed, last_run_at, ok, error from public.scoring_health where tournament_id = public.active_tournament_id();
```

Both rows: `last_run_at` within a few minutes, `ok = true`.

---

## If you need to undo

**Reverse order — work up this table from the bottom.** Undoing step 1 first would break the
already-applied steps 2 and 3, which both read the new column.

| Undo | How |
|---|---|
| **First:** steps 4, 5 | `npx supabase functions deploy <name>` from an earlier checkout. No data risk — redeploying changes no rows. |
| **Then:** step 3 | Paste `supabase/rollback_save_entry_pre_1_3.sql`. **Use that file, not the original from git** — the original re-seeds with `on conflict (id)`, which cannot execute against the new key and aborts before reaching the function, so it would appear to revert and would not. |
| **Then:** step 2 | `delete from public.player_stats where tournament_id = 'cincinnati_2026';` |
| **Last:** step 1 | `alter table public.player_stats drop constraint player_stats_pkey; alter table public.player_stats add primary key (id); alter table public.player_stats drop column tournament_id;` — only valid once the three above are done. |

---

## After this lands — two standing rules

1. **Do not switch the app to Montréal.** With Montréal's player rows absent, a save against it
   would be rejected as "unknown player". Note this is the *in-app tournament switcher*, not just a
   database setting — the client picks its tournament from its own config. Until the `completed`
   read-only status ships (Phase 2.1), Montréal being selectable is a live hazard, and that is the
   next thing I would build.
2. **The US Open seed** is generated with `node scripts/gen-seed.mjs usopen_2026` and applied like
   step 2. It can no longer disturb Cincinnati or Montréal — that is the point of what you applied.
