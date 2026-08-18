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
`-- Runbook steps 2 AND 3, APPLIED AS ONE TRANSACTION`, and Run.

**These were originally two separate steps. Combining them is a correction to my own step order,
and it is not optional.** Step 1 parked all 109 rows as `legacy_unscoped`; the seed adds Cincinnati's
96 under `cincinnati_2026`. Between those two moments every Cincinnati player exists **twice** — and
the `save_entry` deployed right now joins the player table by id alone, with no tournament filter:

```
from unnest(v_squad) sid join public.player_stats ps on ps.id = sid
```

Two rows per player means that join returns every squad member twice, so the tier quota counts
double — a legal 2/3/5 squad reads as 4/6/10 — and the budget sums double, so a $148M squad reads as
$296M. Every save in that window would fail, telling the manager they had broken a rule they had
not. Running the new function *first* fails too: it filters on the tournament and would find no rows
yet, rejecting every squad as "unknown player". **Both orders break; only one transaction works.**
Inside it, no other session ever sees the half-finished state.

If anything in the file fails, the whole thing rolls back and you are exactly where you started.

### Verify — three checks, all of which must pass

**a) The counts.** Expect exactly two rows:

```sql
select tournament_id, count(*) as players,
       count(*) filter (where price is null or tier is null) as incomplete_rows
from public.player_stats group by tournament_id order by tournament_id;
```

```
cincinnati_2026    96    0
legacy_unscoped   109    6
```

`cincinnati_2026` **must be 96 with 0 incomplete** — a NULL price or tier is the fault that reads a
legal squad as illegal, so it can never be locked. The `6` on the legacy row is the old residue and
is expected.

**b) The two copies agree.** Expect **0 rows**:

```sql
select c.id, l.ranking as parked_rank, c.ranking as seeded_rank
from public.player_stats c join public.player_stats l on l.id = c.id
where c.tournament_id = 'cincinnati_2026' and l.tournament_id = 'legacy_unscoped'
  and (l.ranking is distinct from c.ranking or l.price is distinct from c.price
       or l.tier is distinct from c.tier);
```

This matters because the **scorer deployed right now still reads rankings unfiltered** and collapses
duplicates by keeping whichever it sees last. That is harmless only while the parked copy and the
seeded copy hold the same numbers. They should — Cincinnati's field was already in this table before
the migration parked it — but "should" is not "is". **If this returns any rows, stop and tell me:
scores could move, and step 3 becomes urgent rather than routine.**

**c) The salary-cap fix took.** Expect `t`:

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

Filters rankings by tournament. Until this lands, the deployed version reads them unfiltered — which
check (b) above confirms is safe.

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
| **Then:** step 2 | Paste `supabase/rollback_save_entry_pre_1_3.sql`, THEN `delete from public.player_stats where tournament_id = 'cincinnati_2026';` — **in that order.** Removing the seeded rows while the scoped function is still installed would leave it with no players and reject every save. **Use that rollback file, not the original from git** — the original re-seeds with `on conflict (id)`, which cannot execute against the new key and aborts before reaching the function, so it would appear to revert and would not. |
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
