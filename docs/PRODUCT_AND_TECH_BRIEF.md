# Grand Slam GM — Product & Technical Brief

A complete description of the app as built, for evaluation or a rebuild attempt.
Everything here is drawn from the live codebase (Aug 2026), not from memory.

---

## 1. What it is

A **fantasy tennis** web app. You are the GM of a squad of real ATP players. You draft
a squad under a salary cap before a real tournament starts, name a captain each round,
and score points as your players win real matches. Friends compete on live leaderboards
and in private invite-only leagues.

It runs **live against a real tournament** — results arrive automatically from the public
draw as matches finish. It is free, mobile-first, and account-based (squads sync across
devices).

Currently live for the **Cincinnati Open 2026** (96-player draw). Previously ran the
National Bank Open (Montréal). Architecture is multi-tournament: adding an event is a
config entry + a field file.

---

## 2. Game rules (the full specification)

A rebuild must reproduce all of this to be equivalent.

### Squad
- **10 players**, **$150M** budget.
- **Exact** tier quota: **2 Platinum · 3 Gold · 5 Silver**. Not minimums — exact.
  Because 2+3+5 = 10, you cannot stack stars or fill up with cheap players.
- Tiers derive from ATP ranking: **top 10 = Platinum**, **11–25 = Gold**, **26+ = Silver**.
- Player prices are modelled from rank, recent form, and surface performance.

### Scoring
Points are earned **only for winning a match**. Losing earns nothing.

| Round | Points |
|---|---|
| R128 (Slam only) | 1 |
| R64 | 1 |
| R32 | 2 |
| R16 | 5 |
| Quarter-final | 10 |
| Semi-final | 20 |
| Final | 40 |

- **Captain ×2**, **Vice-captain ×1.5**, applied to that player's round points.
  Chosen before each round; they **lock** the moment the round's first match starts.
  A captain stays in force in later rounds until changed (carry-forward).
- **Upset multiplier**: a lower-ranked player beating a higher-ranked one multiplies the
  win. Formula: `1 + gap/(gap + 30)`, where gap = winner's rank − loser's rank.
  Range ×1.0 → ×2.0, smooth and saturating. A favourite winning gets the **full** base
  (never a discount). Unknown opponent rank = no upset.
- Vice's ×1.5 is **not** rounded, so half-points exist (1 → 1.5).

### The opening round (important, non-obvious)
A 96-player Masters draw is not a power of two, so the **32 seeds get a bye** and enter at
the Round of 64. The other 64 players play an opening round first.

**That opening round is read but never scored** — a win in it is worth exactly 0. The app
reads it only so it knows who is already eliminated (so the market can't sell a dead player).
Consequence: an unseeded player must win a pointless match before they can score anything.

To keep that fair:
- An opening-round loss refunds **100%** of the player's price.
- Replacing an opening-round casualty **does not consume a transfer**.

A Grand Slam (128, no byes) scores all seven rounds instead, and has no unscored round.

### Transfers / market
- **3 transfers per tournament** (opening-round repairs excluded, as above).
- You may only **sell an eliminated** player and only **buy a still-alive** one.
- The market is a **between-rounds desk**: it shuts the instant a round goes live and
  reopens at the break.
- Refund on elimination scales by how far the player got — earlier exit refunds *more*
  (a deep run has already paid you in points): R128 .75 · R64 .70 · R32 .55 · R16 .40 ·
  QF .25 · SF and Final 0.
- A signing first scores in the round **after** the one it was logged against — never
  retroactively.

### Leagues
- One global public leaderboard, plus unlimited **private leagues** joined by invite code
  or deep link (`?join=CODE`).

---

## 3. Screens

| Screen | Purpose |
|---|---|
| **Auth** | Email sign-up / sign-in. An account is required to play. |
| **Join gate** | One-time onboarding per tournament: team name, handle, welcome moment. |
| **Home** | Score / budget / squad stat cards, a phase-aware "your next move" coach card, the squad court, and a league leaderboard. |
| **Market (Draft)** | The largest screen. Draft your squad, filter/sort the field, buy and sell mid-tournament, tier quota and budget enforcement, confirmation modals. |
| **League** | Full standings, private-league management (create, join, invite, remove members), per-team stats: eliminated count, buys, correct captain picks, money left. |
| **Team** | Any manager's squad on the court, points-by-round table per player, full transfer history. Public once locked. |
| **Bracket** | The live draw, with your players highlighted and traceable to the final. |
| **Player** | Per-player profile: form, season results by surface, price, rank, video. |
| **Admin** | Operator console: enter/correct results, feed status, server ingest health. |

### Signature UI elements
- **SquadCourt** (475 lines) — a stadium-style tennis court graphic with the captain and
  vice on court and the rest on the bench. Per-surface palettes (grass/hard/clay), stands,
  crowd speckle, net, painted lines. This is the visual centrepiece.
- **BracketTree** — the live draw as a navigable bracket.
- **PlayerAvatar** — the real official ATP headshot per player, hotlinked, inside a
  tier-coloured ring, with a graceful fallback chain (see §9).
- Confetti, toasts, countdown timers, first-run tour.

---

## 4. Design system

**Fonts**
- Body: **Plus Jakarta Sans** (variable)
- Display/headings: **Urbanist** (700/800)
- Numerals: **DM Mono** — all scores, prices and stats are monospaced so columns align.

**Palette** (CSS custom properties)

```
--bg          #EEF1F5   page background
--surface     #FFFFFF   cards
--raised      #F5F7FA   subtle raised fills
--ink         #0a1f44   brand navy (header, primary text)
--ink-2       #5B6B84   secondary text
--ink-3       #6B7C96   captions (darkened to hit WCAG AA 4.5:1)
--navy-2      #123163   navy gradient partner
--blue        #0e6fc4   brand accent
--blue-light  #4aa8ea
--green       #12A150 / --green-bright #37D67A
--ember       #E5472B   alerts, eliminations
--gold        #D99A00 / --gold-bright #F0C24B   captain, trophies
--on-navy     #AFBFDA / --on-navy-2 #8FA1BE     text on navy
--line        rgba(10,27,51,0.10)
```

Tier colours: Platinum `#7DE2FC`, Gold `#FBBF3B`, Silver `#AEB8C4`.

**Visual language**
- Rounded cards (`rounded-2xl`), 1px hairline borders, generous whitespace.
- Navy gradient headers; white content cards on a cool grey page.
- Mobile-first, single column, bottom tab navigation (Home / League / Market / Bracket).
- Accessibility: contrast tuned to WCAG AA, keyboard-operable rows, Escape-to-close modals
  with a stacking order, and body-scroll locking behind sheets.

---

## 5. Tech stack

**Frontend** — React 19 · TypeScript · Vite 8 · Tailwind 3.4 · Zustand 5 (state)
· PostHog (analytics). Hosted on **Cloudflare Pages**.

**Backend** — **Supabase** (Postgres + Row Level Security + Auth + Edge Functions),
plus one Cloudflare Pages Function for an edge-cached public leaderboard.

**Tables**: `profiles · leagues · league_members · entries · matches · player_stats ·
app_config · app_admins · match_overrides · ingest_health · scoring_health · watchdog_state`

**Postgres functions**: `save_entry · apply_entry_scores · create_league · join_league ·
leave_league · delete_league · remove_member · my_league_ids · is_admin ·
set_match_override · clear_match_override · active_tournament_id · pipeline_watchdog`

**Edge functions**: `ingest-draw` (reads the published draw, writes results) and
`recompute-score` (scores every entry from those results).

---

## 6. Architecture — the live data pipeline

```
Wikipedia draw page
      │  (cron, every few minutes)
      ▼
  ingest-draw ──────────► public.matches        (the only trusted results)
      │                        │
      │                        ▼  (cron, every minute)
      │                  recompute-score ─────► entries.score
      │                                              │
      ▼                                              ▼
 browser live feed  ───────────────────────►  leaderboard + app
```

Key design decisions:
- **The client can never write its own score.** `entries.score` is writable only by the
  service-role scorer. RLS enforces it. The leaderboard cannot be faked.
- **Scoring is implemented three times and pinned in lock-step** — the client engine, a
  portable pure engine, and the Deno edge function. Tests assert they produce identical
  results, and that the round-points curve and player ranks match across all copies.
- **Anti-cheat rules**: an entry scores only off its *frozen* draft snapshot (so you can't
  edit your squad after seeing results); a round's captain is locked at its first result;
  late locks and retroactive transfers are rejected server-side.
- **Draw parsing** is shared source between browser and server, with a drift test that
  fails if the two copies diverge by even a character.
- **Operational safety**: optimistic concurrency on saves (rev field), runaway-save circuit
  breakers, paginated scoring (won't silently score only the first 1000 entries), a
  pipeline watchdog, ingest health tracking, service key in Vault, deploy scripts that
  verify the live bundle hash after upload.

---

## 7. Scale

| Area | Lines |
|---|---|
| Pages (7) | 2,390 |
| Components (32) | 3,138 |
| Data / game logic | 2,870 |
| State stores | 895 |
| Portable scoring engine | 100 |
| **App total** | **~13,400** |
| Tests (35 files) | 3,358 |
| SQL migrations (32) | 2,013 |
| Edge functions | 570 |
| Build/data tooling | 2,251 |

**391 automated tests**, including a 150-game fuzz of the full play loop, client↔server
scoring parity, parser validation against real historical draws, and regression tests for
every live bug found so far.

---

## 8. Where the difficulty actually lives

Useful context for judging any rebuild. The UI is the easy part — it's a handful of
screens and could be reproduced quickly and probably made prettier. The hard parts are:

1. **The live results pipeline.** Reading a real, messy, incrementally-published draw and
   turning it into trustworthy results. Half-published pairings, TBD opponents, byes,
   name-matching drift, retractions, and 96-vs-128 draw shapes.
2. **Scoring integrity.** Three engines that must agree exactly, and an anti-cheat model
   where the server is authoritative and the client is never trusted.
3. **Time and locking semantics.** What counts as "the round has started", when captains
   freeze, when the market opens, what a transfer scores from. Most of the subtle bugs in
   this app's history were here.
4. **The accumulated edge cases.** The 391 tests encode real failures found during two live
   tournaments — squads truncating on restore, captains silently not counting, phantom wins
   from half-published draws, scores diverging between screens. A fresh rebuild starts with
   none of that knowledge and would rediscover it in front of users.

A rebuild that ignores 1–4 will demo beautifully and then quietly pay people the wrong
number of points, which is the one bug a fantasy game cannot survive.

---

## 9. Real data (shipped alongside this brief)

`lovable-cincinnati-field.json` — the **complete, real Cincinnati 2026 field**, exported
straight from the running app so prices and tiers are exactly what players see.

96 players. Each record:

```json
{
  "id": "zverev",
  "name": "Alexander Zverev",
  "country": "Germany",
  "flag": "🇩🇪",
  "ranking": 3,
  "seed": 1,
  "tier": "Platinum",
  "price": 50,
  "age": 29,
  "hand": "R",
  "photoUrl": "https://www.atptour.com/-/media/alias/player-headshot/Z355",
  "surface": { "hard": 76, "clay": 88, "grass": 86 },
  "ytd": { "wins": 33, "losses": 7, "titles": 1 },
  "yearResults": [ { "tournament": "Australian Open", "surface": "hard",
                     "short": "AO", "result": "SF" } ]
}
```

- **32 seeded** (seed 1–32, bye into the R64), 64 unseeded.
- Prices span **$4M–$50M**, tuned so a legal 10-player squad fits $150M but forces choices.
- `tier` is derived from `ranking` (≤10 Platinum, 11–25 Gold, 26+ Silver) and drives the
  2/3/5 quota.
- `surface` = win percentages; `ytd` and `yearResults` power the player-profile form strip.

### Player images — read this before rebuilding them

There are **no image files to copy**. Avatars **hotlink the official ATP headshot** at the
`photoUrl` in each record. This is deliberate: downloading those URLs server-side returns a
*different, inconsistent* image than the browser gets, so the app must hotlink from the client.

- 93 of 96 have a headshot. The 3 without (Monfils, Kokkinakis, Wolf — all outside the
  top 300 pool) fall back automatically.
- Fallback chain: ATP headshot → initials monogram → illustrated icon.
- Each avatar carries a **tier-coloured ring** (Platinum `#7DE2FC`, Gold `#FBBF3B`,
  Silver `#AEB8C4`) — 2px ring plus a 4px white halo.

So the instruction for a rebuild is: use `photoUrl` directly in an `<img src>`, keep the
error fallback, and do not try to self-host the images.

### Other data in the repo (not exported here)
- `atp300.json` (183 KB) — the 300-player stats pool: rankings, form, surface splits,
  season results, and every `photoUrl`. Source for pricing and for any future field.
- `montreal2026Field.json`, `wimbledon2026Field.json` — previous events.
- Live results are **not** a data file: they are read from the published draw at runtime.
