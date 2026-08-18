# Apply sequence — backend fixes 1.2, 1.3, 1.4

**Everything below runs against the LIVE database while Cincinnati is mid-tournament with four
active managers.** The order is load-bearing. Follow it top to bottom.

Nothing here touches the frontend, so no deploy of the app is involved.

---

## Before you start

**Pick your moment: between rounds, not mid-round.** No step below blocks saves for more than a
second or two, but if something does go wrong you want managers idle rather than actively drafting.

**You will need:** the Supabase SQL editor, and a terminal in `C:\Users\marti\tennis-fantasy`.

**What you are applying**

| | Fix | Why it matters |
|---|---|---|
| 1.2 | The salary cap could be bypassed | Live right now — anyone signed in can field a squad at any price |
| 1.3 | Each tournament gets its own player data | Must land before the US Open field is seeded, or every past score moves |
| 1.4 | Neither job can guess a tournament | Both currently fall back to a finished event |

---

## Step 1 — the migration

Supabase → SQL Editor → New query. Paste the whole of `supabase/player_stats_scope.sql` and Run.

To copy it to your clipboard, in the **terminal**:

```
Get-Content C:\Users\marti\tennis-fantasy\supabase\player_stats_scope.sql -Raw | Set-Clipboard
```

**Expected result.** The last statement prints one row:

```
tournament_id     players   best_rank   worst_rank
cincinnati_2026   109       2           688
```

**Why this goes first.** The new `save_entry` refers to a `tournament_id` column on the player table.
Apply the function before the column exists and *every save fails immediately*.

**Is anything broken between step 1 and step 2?** No — and this is the part worth understanding. The
function currently live looks players up by id alone. Because the only rows in the table are
Cincinnati's, each id still matches exactly one row, so live saves keep working normally in the gap.
The gap is safe; it is only the reverse order that breaks.

**If it fails:** nothing has changed — the file runs inside a transaction, so a failure rolls the
whole thing back. Send me the error.

---

## Step 2 — the validated write path

Same SQL editor, new query. Paste the whole of `supabase/save_entry_rpc.sql` and Run.

```
Get-Content C:\Users\marti\tennis-fantasy\supabase\save_entry_rpc.sql -Raw | Set-Clipboard
```

This one file delivers **both** the salary-cap fix (1.2) and the tournament scoping (1.3). It
replaces the function wholesale, so there is no partial state.

**Expected result.** No errors. The seed block at the top re-inserts its rows harmlessly.

**Verify the cap fix actually took** — run this and expect `t`:

```sql
select prosrc like '%v_stored_has_transfers%' as budget_gate_reads_stored_row
from pg_proc where proname = 'save_entry';
```

**If it fails:** the old function is still in place and still working. Nothing is lost. Send me the
error.

---

## Step 3 — the scorer

In the **terminal**:

```
npx supabase functions deploy recompute-score --project-ref mrdmlfumdsxufifjulbt
```

**Why after the migration.** This version filters rankings by tournament. Deployed before the column
existed, it would error on every run and scoring would stop.

**Is anything broken between steps 1 and 3?** No. The version currently deployed reads *all*
rankings with no filter — and since only Cincinnati's rows exist, that is exactly the right data.

---

## Step 4 — the results feed

```
npx supabase functions deploy ingest-draw --project-ref mrdmlfumdsxufifjulbt
```

This carries the draw shape guard (1.1) and the removal of the hardcoded default (1.4). It is
independent of the migration, so its position here is convenience, not dependency.

**One behaviour change:** this version *refuses* a call that does not name a tournament, instead of
assuming Montréal. Your crons always name one, so they are unaffected — but a bare manual invoke
will now answer `400` by design.

---

## Step 5 — verify the whole pipeline

Wait about five minutes, then run this in the SQL editor. Both rows should show a `last_run_at`
within the last few minutes and `ok = true`:

```sql
select 'ingest'  as feed, last_run_at, ok, error from public.ingest_health  where tournament_id = public.active_tournament_id()
union all
select 'scoring' as feed, last_run_at, ok, error from public.scoring_health where tournament_id = public.active_tournament_id();
```

Then confirm the scores are still sane — these should match what the leaderboard showed before you
started:

```sql
select user_id, score from public.entries
where tournament_id = 'cincinnati_2026' order by score desc;
```

**Tell me if any score moved.** Nothing in this sequence should change a single point. If one did,
that is a real finding and I want to see it.

---

## If you need to undo

| Step | How to reverse |
|---|---|
| 1 | `alter table public.player_stats drop constraint player_stats_pkey; alter table public.player_stats add primary key (id); alter table public.player_stats drop column tournament_id;` — safe only if you have **not** yet seeded a second tournament |
| 2 | Re-apply the previous `save_entry_rpc.sql` from git: `git show 6c10568:supabase/save_entry_rpc.sql` |
| 3, 4 | `npx supabase functions deploy <name>` from an earlier checkout |

Steps 3 and 4 are independently reversible and carry no data risk — redeploying an edge function
changes no rows.

---

## After this lands — two standing rules

1. **Do not point `app_config.active_tournament_id` back at `montreal_2026`.** With Montréal's player
   rows deliberately absent, a save against it would now be rejected as "unknown player". That is
   correct for a finished event, but the app has no read-only mode yet — that is the `completed`
   status work (Phase 2.1), and it is the next thing I would build.
2. **When the US Open field is ready**, its seed is generated with
   `node scripts/gen-seed.mjs usopen_2026` and applied the same way. It can no longer disturb
   Cincinnati or Montréal — that is the whole point of what you just applied.
