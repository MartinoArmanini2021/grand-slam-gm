# Road to the US Open 2026 — build & live-testing plan

**Goal:** publish Grand Slam GM for the **US Open 2026** and run it *live* during the
tournament, with a friend group. Get there by rehearsing the whole live machine on
the two hard-court events that happen first — so nothing about the US Open is a
first-time-in-production risk.

**The insight this plan is built on:** the app currently plays a *completed* draw
(Wimbledon 2026, baked in) as a no-spoiler replay. Running it *live* is a different
mode — results don't exist yet; they arrive round by round. The North American
hard-court swing gives us two real, lower-stakes tournaments — on the **same surface
as the US Open** — to shake that mode out before it matters.

---

## The calendar we're planning around (2026, verified)

| Event | Dates | Surface | Role in this plan |
|---|---|---|---|
| *(now)* | late July | — | Build the live-capable engine |
| **National Bank Open** (Canadian Open) | **Aug 1 – 13** | Hard | **Live Alpha** — solo / 1–2 friends |
| **Cincinnati Open** | **Aug 11 – 23** | Hard | **Live Beta** — deployed, multiplayer |
| **US Open — qualifying / fan week** | Aug 24 – 30 | Hard | Freeze, polish, onboard |
| **US Open — main draw** | **Aug 31 – Sep 13** | Hard | **🎯 PUBLISH & RUN LIVE** |

Two hard-court events overlap (Cincinnati starts before Canada ends), which is fine —
the plan uses Canada for the first solo run and Cincinnati for the first *multiplayer*
run.

---

## What "done well and tested to the fullest" requires

Seven work packages. Today the app is hard-coded to Wimbledon/grass and plays a
completed bracket; these are the gaps between that and a live US Open.

| # | Work package | Why it's needed | Status |
|---|---|---|---|
| **W1** | **Tournament-agnostic engine** — parameterize everything now hard-coded to "Wimbledon"/grass/128-draw; handle variable draw sizes & round counts (Masters ≠ Slam) | The lead-up events aren't 128-draws; the engine must run any of them | 🟢 **Core done** — rounds/scoring/exit-staging/transfer-lock all config-driven |
| **W2** | **Surface-aware branding & court** — hard = US-Open blue, clay = orange, grass = green; drive the court SVG, accent, subtitle from the tournament config | The court is a green grass court today; US Open must *look* like the US Open | 🟢 **Done** — flipping the active tournament re-skins branding + court |
| **W3** | **Live results pipeline** — **automated** feed (Wikipedia via `liveData.ts`) that advances rounds as matches finish, **plus an admin edit/override** | Results no longer come from a baked file — they happen live, and a wrong result must be fixable | 🟡 **Core built, not live-ready** — store/admin/feed/parser done & tested; multi-section 96-draw assembly + live reactivity remain (see review) |
| **W4** | **Per-tournament data** — the **full participant list** per event (rank → price, stats, seeds) + the draw structure | Every tournament needs its complete field & bracket | 🟡 **Pool built** — 300-player master pool + real photos shipped; per-tournament *field wiring* (draftable subset, name→id vs pool, mode-aware bracket) remains |
| **W5** | **Backend + multiplayer** (Supabase) — real accounts, cloud-stored squads, a shared league | Friends must see each other's squads & scores | 🟡 **Core live** — accounts, profile+squad cloud sync, shared leaderboard working on a real project; **server-authoritative scoring + private leagues remain**; security hardened (run `harden_rls.sql`) |
| **W6** | **Deploy** — Cloudflare Pages + custom domain + env/redirect config | A shareable link; needed even to hand the trial to a remote friend | 🔴 **Not started** |
| **W7** | **Prod-readiness** — Resend SMTP for emails, forgot-password, privacy/terms, account deletion (GDPR, you're in the EU) | Required before real people sign up | 🔴 **Not started** |

---

## Phased schedule (work mapped to tournaments)

### Phase 0 — now → Jul 31 · *Make it live-capable*
Build the engine that can run **a** live hard-court tournament, solo, with manual
result entry.
- **W1** tournament abstraction (config-drive name/surface/dates/draw-size; kill the
  hard-coded "Wimbledon"/grass strings across the ~18 files that carry them).
- **W2** hard-court skin (blue court + "Hard" surface emphasis).
- **W3 (MVP)** manual result entry: an admin screen to mark each match's winner and
  advance the round. Reuse the existing round/scoring engine and reveal-gating — the
  gating stops being cosmetic and becomes *real* (future results genuinely don't exist).
- **W4** Canadian Open field + draw shell.
- ✅ **Exit test:** you can draft, then play the Canadian Open round-by-round by
  entering real results, with correct hard-court branding — all locally.

### Phase 1 — Aug 1 – 13 · National Bank Open · **LIVE ALPHA (solo / 1–2 friends)**
Run the app *against the real tournament as it happens*.
- Draft before/at the start; each day, enter the real results as rounds complete.
- **This is the first true integration test** of: the live pipeline, scoring as
  results arrive, hard-court branding, and reveal-gating with genuinely-unknown
  outcomes. Expect to find timing/UX/data bugs a replay never surfaces — that's the
  point of doing it now, not at the US Open.
- **In parallel:** build **W5 backend** + **W6 deploy** (they don't need the live run).
- Fix everything the live run surfaces before Cincinnati.

### Phase 2 — Aug 11 – 23 · Cincinnati · **LIVE BETA (deployed, multiplayer)**
The full dress rehearsal, now with real friends.
- Deployed on Cloudflare; friends join by link with real accounts and a private league.
- Run Cincinnati end-to-end with several people → tests **multiplayer, cloud sync,
  server-side scoring, and concurrency** under real conditions.
- Finish **W7 prod-readiness** (emails, legal, deletion).
- ✅ **Exit test:** multiple friends drafted, the league updated live as results came
  in, and the leaderboard was correct and cheat-resistant — on a real event.

### Phase 3 — Aug 24 – 30 · US Open qualifying week · **FREEZE & PREP**
- **Feature freeze** — bug fixes only. No new features this close to launch.
- Prepare the **US Open field data** (128-draw or a curated top-N — decide in Phase 0).
- Onboard the friend group, seed the private league, send invites, load-test.

### Phase 4 — Aug 31 – Sep 13 · US Open main draw · **🎯 PUBLISH & RUN LIVE**
- Draft closes before Round 1; run the whole tournament live with your friends.
- Everything below has now run **twice on real hard-court events** before this moment:
  live pipeline, hard-court branding, multiplayer, cloud scoring. That's what buys the
  confidence to publish.

---

## Testing strategy ("to the fullest")

Two layers, both running the whole time:

1. **Automated (keep it green every commit):** the existing unit suite + the 150-game
   fuzz harness. Add, per tournament, a **data-integrity test** (every field player
   maps into the draw; draw structure is well-formed; round counts add up) — the same
   class of test that caught the Tsitsipas exit bug. This makes onboarding a new
   tournament's data safe.
2. **Live-fire (the real value):** each lead-up event is a real integration test of
   the live pipeline under real timing, real results, and (for Cincinnati) real users.
   Nothing simulated can replace watching a round resolve live and seeing scores land.

**De-risking sequence:** Canada proves the *engine*; Cincinnati proves the *platform*;
the US Open is then execution, not discovery.

---

## Decisions (locked)

1. **Live results → AUTOMATED (API/scraping), with an admin edit/override.** The feed
   pulls results via the `liveData.ts` seam; an override lets us correct a bad scrape.
   No manual entry as the primary path. Raises W3 to 2–3 days and adds a data-source
   dependency to de-risk hard during Phase 1.
2. **Field size → the FULL participant list per tournament** (128 for a Slam; the
   Masters draws for the lead-ups). Every player's rank/price/surface stats, not a
   curated subset — a bigger data task per event (W4 ≈ 1 day each).
3. **Draw-size variation.** Masters events (Canada/Cincinnati) aren't 128-draws with
   7 rounds. **W1 must make round count / draw size configurable** — the single most
   important abstraction; testing on the Masters events forces us to get it right
   before the Slam.
4. **Scoring integrity → SERVER-AUTHORITATIVE.** Scores are computed/stored on the
   server; the client can't self-report. Built into **W5** — see `GO_LIVE.md` §3.3.

## Progress
- ✅ **W1/W2 foundation shipped** — `tournamentConfig.ts` drives the app's identity and
  a per-surface theme. Flipping the active tournament re-skins the branding and the
  signature court graphic (grass → hard = US-Open blue) with no component edits.
- ✅ **W1 core: round structure is config-driven** — a tournament declares only *which*
  rounds it plays (`TOURNAMENT.rounds`); the engine derives `ROUNDS`, exit staging,
  the transfer lock, and the bracket's labels/indices/draw-size from it. Points use
  **one shared curve by round name** (a Masters final = a Slam final). Onboarding a
  Masters draw (a different round count) now needs no engine edits. Kept the clean
  binary bracket — the US Open's 128-draw uses it perfectly; non-128 Masters draws
  get a simpler view later. 73/73 tests, incl. 4 config-derivation guards.
- ✅ **Live mode built (W3 core) — the engine can now run a live tournament.** Four
  reviewable increments, all tested (91/91):
  1. **Registry + `replay`/`live` flag** — Wimbledon (replay) and the National Bank
     Open 2026 (Montréal, hard, 96-draw → 6-round R64→F, live) coexist.
  2. **Live results store + mode-aware engine** — the scoring engine reads a mode
     branch: baked draw in replay, a store of results-as-they-arrive in live (same
     tested code path). Elimination is derived from recorded losses; a round refuses
     to score until the real world finishes it; **admin overrides beat the feed**.
  3. **Admin match console** — an operator screen (admin-gated) to enter/correct each
     winner; overrides badged. Verified live in the browser.
  4. **Wikipedia auto-feed** — poll → parse → merge, overrides preserved. Validated
     against the **real 2025 draw page**, which caught three issues before the event:
     CORS (must use `api.php?…&origin=*`, not `index.php?action=raw`), the winner is
     marked by `'''bold'''`, and identity must use the wikilink target (later-round
     labels get abbreviated). All handled.
- ✅ **Backend + multiplayer core (W5) live on a real Supabase project.** Accounts
  (email verify), profile + squad **cloud sync** (cross-device restore proven),
  RLS-secured, and a **shared leaderboard** merging real players with AI bots. Schema
  in [`schema.sql`](../supabase/schema.sql). An RLS infinite-recursion bug was caught
  the moment a real user authenticated and fixed via a `SECURITY DEFINER` helper.
- ✅ **300-player master pool + real photos (W4 foundation).** `atp300.json` (ATP
  top-300, generated by `scripts/gen-atp300.mjs`, all 52 roster ids preserved); real
  ATP headshots **hotlinked** (a self-host attempt was reverted — `curl` and the
  browser get *different* images from the same URL, which broke consistency). Plus
  per-player **flag + nickname**.
- ✅ **End-of-day hardening (Day 2).** A three-agent review (game engine / backend /
  live mode) plus a 150-game fuzz pass. Fixed a **critical cross-account data leak**
  (sign-out now wipes local stores), a **stale-id white-screen** vector (sanitize on
  every rehydrate), budget float drift, PII exposure + duplicate-entry risks in RLS
  (`harden_rls.sql`), a username-collision that broke profile sync, and several engine
  guards. 95/95 tests.

### Remaining before a live Montréal run (~Aug 1)
- **W4 field** — the Montréal entry list as the draftable field (deferred: volatile —
  Sinner/Djokovic/Alcaraz already out; draw not published till ~Aug 1). Also wire
  `PLAYERS` + the live name→id map to the **active tournament's field / the 300-pool**
  (today both are hard-bound to the 52 Wimbledon players).
- **W3 live-readiness** (from the review, all dormant until Canada is activated):
  - **Feed assembly** — `parseBracket` currently merges all sections into one map; a
    96-draw is 8×`{{16TeamBracket-…-Byes}}` + one `{{8TeamBracket}}` finals — split &
    stitch into R64→F, and confirm the 2026 page title.
  - **Mode-aware bracket** — `BracketTree` is hard-coded to the Wimbledon draw; source
    it from `activeMatches()`/the live draw and derive columns from `TOURNAMENT.rounds`.
  - **Live reactivity** — components read the live store via `getState()` (non-reactive);
    subscribe so feed/admin updates refresh views, and re-score corrected rounds.
  - **Per-tournament game-store key** — `gameStore` persists under one key; namespace
    it by tournament (like `liveStore`) so switching events doesn't strand a squad.
- **Server-authoritative scoring (W5)** — the `recompute-score` Edge Function (client
  can't be trusted for the leaderboard number). Until then the board uses the client
  score for the friends alpha.
- **Private leagues (W5)** — join-by-code + a real membership table (today a client
  could self-assign any `league_id`; safe now because only the public league exists).
- ⚠️ **Action for you:** run [`harden_rls.sql`](../supabase/harden_rls.sql) in the
  Supabase SQL editor (PII lockdown + duplicate-entry fix). The leaderboard shows
  other players' names only after it's applied.

---

## One-line summary
**Phase 0 makes it live-capable → Canada is the engine rehearsal → Cincinnati is the
platform rehearsal → the US Open is the show.** Plan the build so W1–W4 land before
Aug 1 and W5–W7 land before Aug 24.

### Sources (verified mid-2026)
- US Open 2026 dates — https://www.lta.org.uk/fan-zone/us-open/news/what-is-the-schedule-for-2026/
- National Bank Open 2026 — https://en.wikipedia.org/wiki/2026_National_Bank_Open
- Cincinnati Open 2026 — schedule per WTA/tournament listings
