# Changing tournaments — the runbook

**Ending one event and starting the next.** Written generically: `OLD` is the finishing tournament,
`NEW` is the one starting. Substitute ids as you go.

Read it once before starting. The order is load-bearing, and the steps marked **SILENT** fail without
an error message — the app keeps working and shows you something wrong.

Rewritten 2026-08-28 after the Cincinnati → US Open changeover, which sprang six traps this document
did not previously mention. They are all here now.

---

## The three rules

**1. Do not repoint the server until OLD's final score has settled.**
`recompute-score` only ever scores the tournament in `app_config`. Repoint it and OLD stops being
recalculated — permanently in practice. If the final had not been ingested and scored, the winner
never gets those points and nothing reports a problem. The leaderboard just freezes at a wrong
number. Everything else in this document is recoverable. This is not.

**2. Never re-apply prices once they are published.**
Prices and tiers are what managers drafted against. Re-applying them reprices the field under squads
that are already locked. If the display data is wrong, fix the display data — the shelf and
`player_stats` are separate tables and you can correct one without touching the other. Since
2026-09-16 the generator enforces this itself: with `status: 'live'` or `'completed'` in
`scripts/lib/events.mjs`, `gen-seed.mjs` emits an upsert that never touches price or tier — re-running
it for a published event only refreshes rankings and adds full rows for players who have none.

**3. Unknown is not zero.**
Anywhere the pipeline lacks data it must write `null`, never a stand-in. A `0-0` record reads as
"played two matches, lost none" and a `50` reads as a real 50%. Both are claims about a player you
cannot make.

---

## Part 1 — Prepare (safe while OLD is still being played)

### 1.1 Build the field

    node scripts/build-field.mjs NEW
    node scripts/reconcile-field.mjs NEW

Must report **0 missing, 0 phantom**. Not optional — it caught a 4-team-bracket miscount at the
Cincinnati cutover.

Entrants outside the top-300 pool (wildcards, protected rankings) go in the `manual` list for NEW in
`scripts/lib/events.mjs`, then re-run both.

> **SILENT — a manual entry needs an `atpId` or the player has no face.** Look it up on the player's
> own Wikipedia page: the ATP profile link is `atptour.com/en/players/<name-slug>/<ID>/`, and the
> slug being the player's name is what proves the id is theirs. A `{{ATP|ID}}` template works too.
> **A wrong id does not error** — ATP serves a generic silhouette at the same 300x300 with HTTP 200,
> so the app's fallback never fires. And you cannot check from a script: atptour.com returns 403 to
> any server-side fetch but 200 to a browser image tag. A human has to look at it.

> **SILENT — protected rankings.** A player entering on a PR is in the draw *because* his real rank
> fell. Using the PR prices him as a top-100 player and shrinks his upset multiplier. Use the real
> rank. `fieldTooling.test.ts` enforces that manual entrants rank > 300.

### 1.2 Refresh 2026 form

    node scripts/build-2026-stats.mjs --dry

Check `events found: N/N` before running it for real without `--dry`.

> **SILENT — `atp300.raw.json` is a STALE snapshot.** It disagreed with `atp300.json` on 120 of 300
> ranks. Never rank from the raw file. The arbiter is the seed list — see 1.3.

> **SILENT — the name alias map runs pool to draw, not draw to pool.** `matchKey()` reduces names to
> bare letters, so the pool's "Aleksandr Shevchenko" never meets the draw's "Alexander Shevchenko".
> `NAME_ALIAS` is consulted on the **pool** name at lookup time while stats are **stored** under the
> **draw** spelling. Write it backwards and it does nothing — the player simply shows no matches. It
> cost a rank-97 player his entire season (16-19 across 10 tournaments) until it was caught.

### 1.3 The staleness test

Seeds are assigned by ranking, so **seed order must track rank order monotonically**. Gaps in the
rank sequence are fine — those are the withdrawals. Values going *backwards* mean stale ranks.

    node -e "const f=require('./src/data/NEWField.json');const s=f.filter(p=>p.seed).sort((a,b)=>a.seed-b.seed);let prev=0,bad=0;for(const p of s){if(p.ranking<prev)bad++;prev=p.ranking}console.log(bad?bad+' OUT-OF-ORDER SEEDS — RANKS ARE STALE':'seed order tracks rank order — ranks are current')"

### 1.4 Generate and apply the seed

    node scripts/gen-seed.mjs NEW

NEW must carry `status: 'upcoming'` in `scripts/lib/events.mjs` at this point — the generator refuses
to run without a status, and only an upcoming event gets price and tier written on re-run. It flips
to `'live'` in 2.2, the moment managers can draft; from then on the generator never re-applies either.

Paste into the Supabase SQL editor. **Check the first line matches the file before you Run** — a
failed copy leaves the old clipboard in place and reports success having done nothing.

    select tournament_id, count(*) as players,
           count(*) filter (where price is null or tier is null) as incomplete_rows
    from public.player_stats group by tournament_id order by tournament_id;

`incomplete_rows` must be 0. A row missing price or tier makes a legal 2/3/5 squad read as illegal,
so it can never be locked.

### 1.5 Load the shelf

> **SILENT — the shelf and the field file use DIFFERENT key styles.** `src/data/<event>Field.json` is
> camelCase and nested (`atpId`, `ranking`, `surface.hard`, `ytd.wins`, `yearResults`).
> `public.tournament_fields.field` is snake_case and flat (`atp_id`, `atp_rank`, `hard_pct`,
> `ytd_wins`, `year_results`). Pasting the field file straight in leaves every rank, price and photo
> undefined while still looking like a valid array of the right length. Transform, then verify a
> sample row's keys before trusting it.

### 1.6 Teach the results feed

Add NEW to the `TOURNAMENTS` registry in `supabase/functions/ingest-draw/index.ts`. **A Grand Slam
has no byes** — its rounds are R128, R64, R32, R16, QF, SF, F — not the Masters list.

    npx supabase functions deploy ingest-draw --project-ref mrdmlfumdsxufifjulbt

Deploy **now**, not after the switch: the feed refuses a tournament it does not carry, so deployed
late every ingest 400s and the leaderboard never starts. Deployed now it changes nothing — the crons
are still asking for OLD.

---

## Part 2 — The switch (one sitting, after OLD's final)

### 2.1 Prove OLD is finished and settled

    select round, count(*) as matches, count(winner_id) as decided
    from public.matches where tournament_id = 'OLD' group by round order by min(slot);

`F` must show 1 of 1. Then take the standings **twice, five minutes apart** — identical both times.
If any number moved, scoring is still catching up. Wait.

### 2.2 Repoint the server

    update public.app_config set value = 'NEW', updated_at = now() where key = 'active_tournament_id';
    select public.active_tournament_id();

Must return NEW. NULL means the row is missing — stop.

Then, in `scripts/lib/events.mjs`, set NEW to `status: 'live'` and OLD to `'completed'`. From this
moment `gen-seed.mjs` never re-applies NEW's prices or tiers (rule 2); a later run only refreshes
rankings and adds rows for late entrants.

### 2.3 Watch one full cycle before touching the client

Wait five minutes:

    select 'ingest' as feed, last_run_at::text, ok::text, coalesce(error,'none') as err
    from public.ingest_health where tournament_id = public.active_tournament_id()
    union all
    select 'scoring', last_run_at::text, ok::text, coalesce(error,'none')
    from public.scoring_health where tournament_id = public.active_tournament_id();

Both `ok = true`, both recent. **This is the checkpoint** — only one config row has changed, so
rolling back is putting it back.

### 2.4 Ship the client — Lovable era

The client is the Lovable project now, not this repo. Code changes go through the Lovable agent:
there is no write-file tool, `send_message` is the only path, and it costs credits. Budget for that
before a cutover — running out mid-changeover blocks every app-side fix.

> **SILENT — `DEFAULT_TOURNAMENT_ID` in `src/lib/game/data.ts` is a MANUAL step, and it was missed.**
> `activeTournamentQuery` returns it as a *successful* result whenever `get_active_tournament()`
> errors, so React Query caches it as fresh for five minutes and never retries. One transient blip
> and a brand-new manager is silently shown a **completed** tournament — no market, champion already
> crowned, nothing that looks wrong. **Update it to NEW as part of every changeover.**

Also confirm the scoring curve. `LEGACY_TOURNAMENTS` in `engine.ts` pins already-played events to the
curve their managers actually lived. A finished event must never be re-scored on a new curve.

---

## Part 3 — After the draw completes (slams only)

A slam draw publishes **before qualifying finishes**. Until the last qualifier is placed, the bracket
has unfilled slots and some real main-draw players have **no match row at all**.

> **SILENT and destructive — `outOfDraw()` reads "no match row after lock" as "knocked out in the
> opening round".** At lock, every such player is refunded in full and their owner gets a free
> transfer. With 18 slots unfilled that was 16 real players. **The re-ingest is a correctness
> requirement, not tidiness, and it has a hard deadline: first ball.**

Re-run 1.1, 1.2, 1.3 and 1.5 — the field, the form, the staleness test and the shelf — then
**REDEPLOY `ingest-draw`, then** re-ingest. **Not 1.4 as it was written**: rule 2. Once managers can
draft, the seed is never re-applied over their prices. What the late entrants need is a ROW EACH, and
`node scripts/gen-seed.mjs NEW` gives exactly that once `status: 'live'` is set in
`scripts/lib/events.mjs`: its upsert inserts full rows for players who have none (the lucky losers,
the late-placed qualifiers) and touches RANKING ONLY on rows that exist. If nobody can draft yet —
the event is still `upcoming` — the full seed applies as in 1.4.

> **SILENT — the field is COMPILED INTO the edge function.** `ingest-draw` imports the field JSON
> at build time, so the deployed copy still holds the roster from whenever you last deployed it.
> Rebuild the field and the running function cannot resolve the new names: it writes 64 match rows
> that look perfectly healthy, `ingest_health.ok` stays true, and the new players simply have **no
> match row** — which at lock means every one of them is refunded. Seen for real on 2026-08-29:
> ingest reported ok with all 64 R128 rows written, and all 18 qualifiers missing.
> **Run `npx supabase functions deploy ingest-draw` after every field rebuild, before re-ingesting.**

Then:

> **Re-stamp the schedule.** `buildMatchRows` writes seven columns and `started_at` is not one of
> them. Existing rows keep their stamp — the upsert only SETs payload columns, verified empirically —
> but the **new** rows arrive with `started_at` NULL. The lock still fires because it only needs one
> stamped row, so this is completeness rather than correctness; still, re-run
> `supabase/job20_round_schedule.sql` so all of them carry it.

    select round, count(*) as rows, count(started_at) as stamped,
           min(started_at at time zone 'America/New_York')::text as first_ball_local
    from public.matches where tournament_id='NEW' group by round order by min(slot);

Check `first_ball_local` against the tournament's published order of play. The database stores UTC;
a US Open day session starting 11:00 in New York is 15:00 UTC and 17:00 in central Europe. Getting
the timezone wrong by a session shuts the market early or leaves it open through the first round.

---

## The trap index — everything that fails silently

| Trap | Symptom | Where |
|---|---|---|
| `DEFAULT_TOURNAMENT_ID` not updated | new manager sees a finished event | Lovable `data.ts` |
| Shelf loaded with camelCase keys | ranks, prices, photos all undefined | `tournament_fields` |
| Ranked from `atp300.raw.json` | wrong prices and tiers throughout | pool files |
| `NAME_ALIAS` written draw to pool | a player shows zero matches all season | `build-2026-stats.mjs` |
| Wrong `atpId` | silhouette, not an error | field JSON |
| Missing form written as 0-0 or 50 | app states a real player never played | `expandManual`, `build-field`, `surfacePct` |
| Re-ingest without re-stamping | new rows unstamped | `job20_round_schedule.sql` |
| `gen-seed` run after launch with NEW still `upcoming` in `events.mjs` | reprices locked squads | rule 2; set `status: 'live'` at the flip |
| Stale field in the edge function | ingest reports ok, new players get no match row | redeploy `ingest-draw` |
| Public league deleted | **every save fails** — `save_entry` requires it | `leagues.is_public` |

---

## After it lands

- OLD's scores are frozen. Nothing recomputes a tournament that is not active.
- Archive it under `docs/archive/OLD/`, capturing `player_stats` **scoped to OLD**, not the whole
  table. The Montréal archive dumped the live table, which by then held the next event's rankings.
- Check the grants. After any schema work, confirm no view is writable by `anon` and no table grants
  it TRUNCATE — **RLS does not govern TRUNCATE**, the privilege alone does.

    select c.relname, has_table_privilege('anon','public.'||c.relname,'TRUNCATE') as anon_truncate
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','v') order by 2 desc, 1;
