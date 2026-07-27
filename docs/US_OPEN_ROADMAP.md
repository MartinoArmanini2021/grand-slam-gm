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

| # | Work package | Why it's needed | Rough size |
|---|---|---|---|
| **W1** | **Tournament-agnostic engine** — parameterize everything now hard-coded to "Wimbledon"/grass/128-draw; handle variable draw sizes & round counts (Masters ≠ Slam) | The lead-up events aren't 128-draws; the engine must run any of them | 2–3 days |
| **W2** | **Surface-aware branding & court** — hard = US-Open blue, clay = orange, grass = green; drive the court SVG, accent, subtitle, and surface emphasis from the tournament config | The court is a green grass court today; US Open must *look* like the US Open | 1 day |
| **W3** | **Live results pipeline** — **automated** feed (API/scraping via the `liveData.ts` seam) that advances rounds as matches finish, **plus an admin edit/override** to correct any bad scrape | Results no longer come from a baked file — they happen live, and a wrong result must be fixable | 2–3 days |
| **W4** | **Per-tournament data** — the **full participant list** for each event (every player, ATP rank → price, surface %, seeds) + the draw structure | Every tournament needs its complete field & bracket | ~1 day per event |
| **W5** | **Backend + multiplayer** (Supabase) — real accounts, cloud-stored squads, a shared league. Full plan already in [`GO_LIVE.md`](GO_LIVE.md) | Friends must see each other's squads & scores | 3–4 days |
| **W6** | **Deploy** — Cloudflare Pages + custom domain + env/redirect config | A shareable link; needed even to hand the trial to a remote friend | ½ day |
| **W7** | **Prod-readiness** — Resend SMTP for emails, forgot-password, privacy/terms, account deletion (GDPR, you're in the EU) | Required before real people sign up | 1 day |

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
  *Next in W1:* wire a real non-128 tournament's field + draw (W4) to exercise the
  variable round count end-to-end, then the automated results feed (W3).

---

## One-line summary
**Phase 0 makes it live-capable → Canada is the engine rehearsal → Cincinnati is the
platform rehearsal → the US Open is the show.** Plan the build so W1–W4 land before
Aug 1 and W5–W7 land before Aug 24.

### Sources (verified mid-2026)
- US Open 2026 dates — https://www.lta.org.uk/fan-zone/us-open/news/what-is-the-schedule-for-2026/
- National Bank Open 2026 — https://en.wikipedia.org/wiki/2026_National_Bank_Open
- Cincinnati Open 2026 — schedule per WTA/tournament listings
