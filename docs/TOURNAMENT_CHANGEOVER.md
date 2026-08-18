# Changing tournaments — Cincinnati → US Open

**The procedure for ending one event and starting the next.** Written before it is needed, because
the last cutover is what caused the 12-hour leaderboard freeze.

Read the whole thing once before starting. The order is load-bearing and two of the steps have a
window where getting it wrong is silent.

---

## The one rule that matters

**Do not repoint the server at the new tournament until the old one's final score is settled.**

`recompute-score` only ever scores the tournament named in `app_config`. The moment you repoint it,
Cincinnati stops being recalculated — permanently, in practice, because you will not point back.
If the final's result had not yet been ingested and scored, whoever won Cincinnati on the last
match never gets those points, and nothing anywhere reports a problem. The leaderboard just stops,
frozen at a number that is wrong.

Everything else here is recoverable. That is not.

---

## Part 1 — Prepare (any time after the US Open draw publishes)

Nothing here touches the running game. All of it is safe while Cincinnati is still being played.

### 1.1 Build the field from the published draw

```bash
cd C:\Users\marti\tennis-fantasy
```
```bash
node scripts/build-field.mjs usopen_2026
```

Then prove it matches the real draw — **this is not optional**, it is what caught a 4-team-bracket
miscount at the Cincinnati cutover:

```bash
node scripts/reconcile-field.mjs usopen_2026
```

Must report **0 missing, 0 phantom**. If it reports anything else, stop and tell me: the field is
the input to everything below, and a wrong field means wrong prices, wrong tiers and wrong scores.

If the draw contains entrants outside the top-300 pool (wildcards, qualifiers), add them to the
`manual` list for `usopen_2026` in `scripts/lib/events.mjs` and re-run both commands.

### 1.2 Generate the player seed

```bash
node scripts/gen-seed.mjs usopen_2026
```

Writes `supabase/seed_usopen_player_stats.sql`. Every player gets **all four** of id, ranking, price
and tier — a row missing price or tier makes a legal 2/3/5 squad read as illegal, so it can never be
locked.

### 1.3 Teach the results feed about the new event

`supabase/functions/ingest-draw/index.ts` carries a `TOURNAMENTS` registry. Add a `usopen_2026`
entry alongside the existing two, importing the field JSON from 1.1. **A Grand Slam has no byes**, so
its rounds are `['R128','R64','R32','R16','QF','SF','F']` — not the Masters list.

Then deploy it:

```bash
npx supabase functions deploy ingest-draw --project-ref mrdmlfumdsxufifjulbt
```

**Why now and not later:** the feed refuses a tournament it does not carry. Deployed after the
switch, every ingest run 400s and the leaderboard never starts. Deployed now, it changes nothing —
the crons are still asking for Cincinnati.

### 1.4 Apply the seed

Copy it:

```bash
Get-Content C:\Users\marti\tennis-fantasy\supabase\seed_usopen_player_stats.sql -Raw | Set-Clipboard
```

Paste into the Supabase SQL editor. **Check the first line matches the file before you Run** — a
failed copy leaves the previous clipboard contents in place and reports success having done nothing.

Verify — the US Open row must show its full field with **0 incomplete**:

```sql
select tournament_id, count(*) as players,
       count(*) filter (where price is null or tier is null) as incomplete_rows
from public.player_stats group by tournament_id order by tournament_id;
```

This cannot disturb Cincinnati. Since fix 1.3 the table is keyed `(tournament_id, id)`, so each
event owns its own rows — that is precisely what that migration bought.

---

## Part 2 — The switch (one sitting, after Cincinnati's final)

### 2.1 Prove Cincinnati is finished and settled

The final must have a result **and** the scores must have stopped moving:

```sql
select round, count(*) as matches, count(winner_id) as decided
from public.matches where tournament_id = 'cincinnati_2026'
group by round order by min(slot);
```

`F` must show `1 / 1`. Then take the standings twice, five minutes apart:

```sql
select user_id, score from public.entries
where tournament_id = 'cincinnati_2026' order by score desc;
```

**Identical both times.** If any number moved, scoring is still catching up — wait. Repointing now
would freeze the leaderboard mid-calculation and there is no going back to fix it.

### 2.2 Repoint the server

```sql
update public.app_config
   set value = 'usopen_2026', updated_at = now()
 where key = 'active_tournament_id';
```

```sql
select public.active_tournament_id();
```

Must return `usopen_2026`. If it returns NULL, the row is missing or misnamed — stop. (It returns
NULL rather than guessing, deliberately: it used to fall back to a hardcoded `montreal_2026`, which
would have quietly pointed the whole pipeline at a finished event.)

### 2.3 Watch one full cycle before touching the client

Wait five minutes, then:

```sql
select 'ingest'  as feed, last_run_at::text, ok::text, coalesce(error, 'none') as err
from public.ingest_health  where tournament_id = public.active_tournament_id()
union all
select 'scoring', last_run_at::text, ok::text, coalesce(error, 'none')
from public.scoring_health where tournament_id = public.active_tournament_id();
```

Both `ok = true`, both recent. **This is the checkpoint.** If the feed is unhappy, the only thing
that has changed is one config row — put it back and nobody has seen anything:

```sql
update public.app_config set value = 'cincinnati_2026', updated_at = now() where key = 'active_tournament_id';
```

### 2.4 Ship the client

In `src/data/tournamentConfig.ts`:

- `cincinnati_2026` → `status: 'completed'`
- `usopen_2026` → `status: 'live'`
- fill in the US Open `schedule` from the published order of play

```bash
npm test
```
```bash
npm run deploy:preview
```

Check the preview, then deploy to production.

**Why the client goes last:** between 2.2 and here, managers are still looking at Cincinnati while
the server has moved on. That is harmless — Cincinnati is over and its scores are final. The reverse
order is not: a client offering the US Open before the server scores it would show every new squad
sitting on zero points, with nothing wrong that anyone could see.

---

## What your managers experience

Nothing abrupt, and this is what Phase 2.1 and 2.4 bought:

- **Never used the switcher** → they open on the US Open, ready to draft.
- **Had switched to Cincinnati at some point** → they land on Cincinnati, see the finished-tournament
  card with the champion, where they placed and their final score, and a button to the US Open.
- **Either way** they can go back to Cincinnati or Montréal any time and browse — squads, standings,
  the full draw — with every control inert and a line explaining why.

No one gets a save rejection, and no one loses work to a stale tournament.

---

## After it lands

- Cincinnati's scores in `public.entries` are now frozen for good. Nothing recomputes a tournament
  that is not the active one.
- Archive it the way Montréal was: `docs/archive/cincinnati_2026/`, and **capture the player_stats
  rows scoped to `cincinnati_2026`**, not the whole table. The Montréal archive got this wrong — it
  dumped the live table on the day, which by then held the *next* event's rankings.
- `montreal_2026` and `cincinnati_2026` both stay in the switcher as completed events. That is the
  season-long story working as intended, not clutter.
