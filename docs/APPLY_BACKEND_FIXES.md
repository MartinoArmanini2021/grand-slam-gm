# Apply sequence — backend fixes 1.2, 1.3, 1.4

**Runs against the LIVE database while Cincinnati is mid-tournament with four active managers.**
The order is load-bearing. Nothing here deploys the app itself.

> **Status: step 1 is DONE** (applied 2026-08-18 — primary key confirmed as
> `PRIMARY KEY (tournament_id, id)`). Continue from step 2.

---

## Before each paste — the one habit that matters

A failed clipboard copy leaves the *previous* contents in place, and pasting that into the SQL
editor produces a cheerful **"Success. No rows returned"** while doing absolutely nothing. That
happened on the first attempt at step 1 and cost us a detour.

**So: after pasting, look at the first line in the editor box and check it matches the file.**
Every file below starts with a comment naming itself.

To copy a file, run its command in the **terminal**. `Set-Clipboard` prints nothing when it works —
silence is success, not failure.

---

## Step 1 — the migration ✅ DONE

`supabase/player_stats_scope.sql` — applied. Adds `tournament_id` to the player table and swaps the
primary key from `(id)` to `(tournament_id, id)`, so each event owns its own rankings and prices and
a finished event can no longer be rescored by loading the next one's field.

All 109 pre-existing rows are parked under `legacy_unscoped`. That is deliberate: the table held
**109 rows but Cincinnati's field is only 96**, the other 13 being residue from older seeds (Sinner
at rank 1, Wawrinka, Safiullin), six of them with missing price/tier. Rather than guess which rows
were Cincinnati's, the migration parks them all and the seed defines Cincinnati.

---

## Step 2 — the seed AND the save function, together, in one transaction

```
Get-Content C:\Users\marti\tennis-fantasy\supabase\apply_step2_step3_atomic.sql -Raw | Set-Clipboard
```

Paste into the SQL editor, confirm the first line reads
`-- ── Runbook step 2 — seed + save function, as ONE transaction`, and Run.

**This was originally two separate steps. Merging them is a correction to my own step order, and it
is not optional.**

Step 1 parked all 109 rows as `legacy_unscoped`. Every one of Cincinnati's 96 players was *already*
in that table, so simply seeding them under `cincinnati_2026` would have left each of them with
**two** rows. The `save_entry` running on your server right now joins the player table by id alone,
with no notion of tournament:

```
from unnest(v_squad) sid join public.player_stats ps on ps.id = sid
```

Two rows per player means every squad member gets counted twice — a legal 2/3/5 squad reads as
4/6/10, a $148M squad sums to $296M — and every save is rejected with a message accusing the manager
of breaking a rule they haven't. **And it doesn't stop at a rejection:** the app responds to a
rejected save by reverting to the server's copy, so their captain change is *discarded*, not just
refused. Running the new function first fails too — it filters by tournament and would find no rows
yet, rejecting every squad as "unknown player".

So the file **moves** the 96 players out of the parked set instead of adding a second copy. Each id
stays unique at every instant, which keeps even the old function reading correctly throughout. The
single transaction on top of that is a second, independent safety net. End state is 109 rows — the
same as now, relabelled — not 205.

If anything in the file fails, the whole thing rolls back and you are exactly where you started. The
file also checks its own work before committing, so it cannot report success over a half-done job.

### Verify — two checks

**a) The counts.** Expect exactly two rows:

```sql
select tournament_id, count(*) as players,
       count(*) filter (where price is null or tier is null) as incomplete_rows
from public.player_stats group by tournament_id order by tournament_id;
```

```
cincinnati_2026    96    0
legacy_unscoped    13    6
```

`cincinnati_2026` **must be 96 with 0 incomplete** — a NULL price or tier is the fault that reads a
legal squad as illegal, so it can never be locked. The remaining `13` are the old residue (Sinner,
Wawrinka, Safiullin and others in no current field), 6 of them incomplete. That is expected and
harmless: nothing reads them.

**b) The salary-cap fix took.** Expect `t`:

```sql
select prosrc like '%v_stored_has_transfers%' as budget_gate_reads_stored_row
from pg_proc where proname = 'save_entry';
```

**Then save a squad yourself** — open the app, change a captain, save. First real exercise of the
new scoped lookups.

---

## Step 3 — the scorer

```
npx supabase functions deploy recompute-score --project-ref mrdmlfumdsxufifjulbt
```

Filters rankings by tournament. Until this lands, the deployed version reads rankings **unfiltered**
— it simply asks for every row and looks players up by id. That is safe here precisely because step 2
moved the 96 rather than copying them: there is exactly one row per player, so filtered and
unfiltered reads return the same rankings and no score can move. Had we left duplicates in place,
this deploy would have been urgent rather than routine.

---

## Step 4 — the results feed

```
npx supabase functions deploy ingest-draw --project-ref mrdmlfumdsxufifjulbt
```

Carries the draw shape guard (1.1) and removes the hardcoded default (1.4).

**One deliberate behaviour change:** it now refuses a call that does not name a tournament rather
than assuming Montréal. Your crons always name one. A bare manual invoke will answer `400` by design.

---

## Step 5 — verify the whole thing

**Capture the scores BEFORE step 2** — do this now, keep the output:

```sql
select user_id, score from public.entries
where tournament_id = 'cincinnati_2026' order by score desc;
```

Five minutes after step 4, run it again — **every number must be identical.** Nothing here should
move a single point. If one moved, that is a real finding and I want to see it.

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
already-applied step 2, which reads the new column.

| Undo | How |
|---|---|
| **First:** steps 3, 4 | Redeploy each function from an earlier checkout. No data risk — redeploying changes no rows. |
| **Then:** step 2 | Paste `supabase/rollback_save_entry_pre_1_3.sql`, THEN `update public.player_stats set tournament_id = 'legacy_unscoped' where tournament_id = 'cincinnati_2026';` — **in that order.** **`UPDATE`, never `DELETE`.** Step 2 *moved* these rows rather than copying them, so they are the only copy of Cincinnati's player data — deleting them would destroy the live field and every save would fail with "unknown player". **Use that rollback file, not the original from git** — the original re-seeds with `on conflict (id)`, which cannot execute against the new key and aborts before reaching the function, so it would appear to revert and would not. |
| **Last:** step 1 | `alter table public.player_stats drop constraint player_stats_pkey; alter table public.player_stats add primary key (id); alter table public.player_stats drop column tournament_id;` — only valid once the rows above are done. |

---

## After this lands — two standing rules

1. **Do not switch the app to Montréal.** With Montréal's player rows absent, a save against it
   would be rejected as "unknown player". This is the *in-app tournament switcher*, not just a
   database setting — the client picks its tournament from its own config. Until the `completed`
   read-only status ships (Phase 2.1), Montréal being selectable is a live hazard, and that is the
   next thing I would build.
2. **The US Open seed** is generated with `node scripts/gen-seed.mjs usopen_2026`. It can no longer
   disturb Cincinnati or Montréal — that is the point of what you applied.
