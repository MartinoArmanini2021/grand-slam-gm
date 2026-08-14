# Adding a tournament

Cincinnati took a day, most of it spent rediscovering things. This is that knowledge as a checklist,
so the US Open takes about an hour. Everything data-shaped is now generated and guarded by tests.

## The five steps

**1. Register it** — `src/data/tournamentConfig.ts` (`TOURNAMENTS`): id, name, year, surface,
location, `drawSize`, `rounds`, `schedule`, court colours, `live: false` for now.
Then `scripts/lib/events.mjs` (`EVENTS`): the Wikipedia page, field path, seed path, surface.
A test pins the page to `${year} ${name} – Men's singles`, so the tooling and the live feed can
never read different draws.

**2. Build the field** — once the draw publishes:
```bash
npm run field:build usopen_2026
```
It reports anyone in the draw who isn't in the 300-player stats pool. Add them to
`EVENTS.<id>.manual` with a real rank and re-run; they're only included if actually in the draw,
so a withdrawal drops them by itself.

**3. Prove it matches** — this is the step that matters:
```bash
npm run reconcile:field -- "2026 US Open – Men's singles" src/data/usopen2026Field.json
```
Must print **0 MISSING, 0 PHANTOM**. Anything else and real entrants aren't draftable, or withdrawn
players are.

**4. Generate the seed**
```bash
npm run field:seed usopen_2026
```
Writes `ranking + price + tier` for every entrant and cross-checks that anyone shared with an
existing seed comes out identical, so applying it can't alter a past tournament's scores.

**5. Wire the server** — add the event to the `TOURNAMENTS` registry in
`supabase/functions/ingest-draw/index.ts` (page + rounds + field import), redeploy it, apply the
seed SQL, then flip the switch:
```sql
update public.app_config set value = 'usopen_2026', updated_at = now() where key = 'active_tournament_id';
```
Set `live: true` (and `DEFAULT_TOURNAMENT_ID`) in the config, deploy the client.

## The traps, all of them learned the hard way

**Re-run steps 2–4 immediately before launch.** Qualifying finishing changes the field. At
Cincinnati the draw gained 13 players between the first build and cutover — every one would have
been undraftable.

**A `player_stats` row needs all four columns.** `save_entry` counts the tier quota off `tier` and
sums the budget off `price`. A row with only `ranking` leaves them NULL, and a legal 2/3/5 squad
reads as 2/3/4 — impossible to lock. This nearly shipped at Cincinnati and would have hit anyone
drafting Djokovic, Draper, Tsitsipas or Dimitrov. `gen-seed.mjs` now writes all four.

**Order: seed before client.** Deploying a client that defaults to the new event before its
`player_stats` rows exist breaks drafting for anyone it doesn't know.

**Flip `app_config` last, and only once the previous event's final is scored** — flipping stops the
scorer touching it forever, freezing its standings wherever they stand.

**Changing the default surfaces field-coupled tests.** Five tests were silently pinned to Montréal.
Prefer deriving from `TOURNAMENT.schedule` and picking fixture players present in the active field.

## Slam vs Masters

A 96-draw Masters byes its 32 seeds, so its unseeded players contest an opening round the game
doesn't score — played *while the draft is open*. `OPENING_ROUND` handles that: the client reads the
round so eliminated players leave the market, but never scores it (the base comes from
`TOURNAMENT.rounds`, which excludes it).

**A Grand Slam has no byes and scores from round one, so `OPENING_ROUND` resolves to `undefined` and
all of that switches itself off.** Nothing to configure or unwind for the US Open.
