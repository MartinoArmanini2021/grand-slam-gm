# Grand Slam GM — Deep Action Plan (2026‑08)

**Supersedes the status/roadmap sections of `docs/PROJECT_STATUS_AND_ROADMAP.md` (Aug 4).** Built from a full, code‑verified audit of four clusters: security & new‑user readiness, the tournament data pipeline, infrastructure/CI/scale, and product/UX/a11y. Every claim below was checked against the actual code/SQL/config, not the stale doc.

Legend: **[CODE]** = I implement in the repo · **[USER]** = a dashboard / billing / DNS / SQL‑run / edge‑deploy step only you can do · Effort **S** (<½ day) / **M** (½–1 day) / **L** (1–2 days).

---

## 0. Corrected status — what the old roadmap got wrong

The app is **substantially further along** than the Aug‑4 doc says. Verified corrections:

| Old roadmap said | Reality (verified) |
|---|---|
| 🟡 **C4 "No CI"** | ✅ **Done.** `.github/workflows/ci.yml` on `origin/master`: build+typecheck+full‑suite on push & PR, plus a live RPC‑drift/boundary job on push. |
| 🟡 **#11 "No off‑machine backup / git remote"** | ✅ **Done.** Repo is on GitHub (`MartinoArmanini2021/grand-slam-gm`). |
| "247 tests" (everywhere) | ✅ **300 passed / 10 skipped** now. |
| 🔴 Score spoofable / client‑sourced | ✅ **Server‑authoritative.** Board reads `entries.score`; `save_entry` never writes score; only service‑role `apply_entry_scores` can. |
| RLS "open items" (B2/B3/B8) | ✅ **Closed.** Direct `entries` writes revoked, rogue‑league injection blocked, in‑draft squads hidden via a redacting `board_entries` view. |
| 🟡 D1 onboarding, D5 player insight | ✅ **Largely done** (first‑run tour + phase‑aware coach + rich PlayerPage, reachable from the market). |
| Live feed not mounted | ✅ **Mounted** (`<LiveFeed/>` in `App.tsx`) + server cron ingest. |

**So the genuinely open work falls into three buckets:** (A) **operational launch‑readiness** for a wider audience, (B) **the Cincinnati / US Open ports** (blocked mostly on published entry lists), and (C) **product polish & retention**. Details below.

---

## 1. Priority matrix

| # | Item | Bucket | Priority | Owner | Effort | Blocker |
|---|---|---|---|---|---|---|
| 1 | Custom SMTP (email delivery) | Ops | **P0** | USER (+I verify) | S | Domain + Resend acct |
| 2 | Turnstile CAPTCHA on auth | Ops | **P0** | Both | S–M | CF keys |
| 3 | Server‑side rate limit (`save_entry` + WAF) | Ops | **P1** | Both | M | — |
| 4 | Cincinnati field + schedule + seed | Port | **P1** | Both | L | Entry list publishes |
| 5 | Real‑time cron alerting | Ops | **P1** | Both | M | Alert sink |
| 6 | Single‑source active‑tournament config (cron footgun) | Ops | **P1** | Both | M | — |
| 7 | Supabase Pro + pooler + row cap | Ops | **P1** | USER | M | Billing |
| 8 | `HowToPlay` stale scoring copy | Product | **P0‑quick** | CODE | S | — |
| 9 | Focus‑trap + 2 missing dialog roles (a11y) | Product | **P2** | CODE | M | — |
| 10 | Admin ingest‑health banner | Product | **P2** | Both | M | RLS decision |
| 11 | Round reminders (email/push) | Product | **P2** | Both | L | SMTP (#1) |
| 12 | Deploy rollback + tagging | Ops | **P2** | CODE | S–M | — |
| 13 | Migrations convention + applied‑ledger | Ops | **P2** | CODE | M–L | Baseline audit |
| 14 | Dev/prod DB isolation | Ops | **P2** | Both | M | #13 |
| 15 | Share‑my‑standing virality loop | Product | **P2** | CODE | S | — |
| 16 | US Open port (128‑draw) | Port | **P3** | Both | L | Entry list (late Aug) |
| 17 | Doc corrections + CI polish | Ops | **P3‑quick** | CODE | S | — |

**Recommended sequence:** knock out the P0‑quick code fixes (#8, #17) immediately → do the P0 ops enablers (#1, #2) which unlock a wider audience → then #3/#5/#6 (abuse + reliability) in parallel with **#4 the moment Cincinnati's entry list publishes** → polish (#9–#15) → US Open port.

---

## 2. Bucket A — Operational launch‑readiness

### 1. Custom SMTP / email delivery  (roadmap C1) — **P0, the top new‑user blocker**
- **Verified state:** No SMTP in the repo (correct — it's a Supabase dashboard setting). Signup code is confirmation‑aware (`AuthProvider.signUp` returns `needsVerification:!data.session`; `AuthScreen` routes to a verify/resend screen). Password reset (`resetPasswordForEmail`) also depends on email. **The docs contradict each other on whether "Confirm email" is ON or OFF** (`.env.example`/`GO_LIVE.md` say ON; `LAUNCH_OPS.md` says autoconfirm ON) — must be read from the dashboard.
- **Gap:** With Supabase's built‑in sender, confirmation/reset emails are throttled and silently fail at volume → new users can't log in. Blocker for a public audience.
- **Plan:** 1) **[USER]** read the real "Confirm email" state in Supabase. 2) **[USER]** create Resend, verify a sending domain (SPF/DKIM/DMARC DNS). 3) **[USER]** Supabase → Auth → SMTP: paste Resend creds. 4) **[USER]** add the deployed origin(s) to the Auth redirect allow‑list (makes reset `redirectTo` resolve). 5) Set Confirm‑email **ON** (bot defense) now that delivery works. **[CODE]** none required — the verify/resend UI already exists.
- **Effort:** S. **Deps:** domain, Resend acct. **Risk:** unverified domain → spam/bounce; confirm‑toggle/SMTP mismatch keeps the blocker silent — test end‑to‑end. **Done when:** a fresh phone signup receives confirmation + reset in <1 min and logs in.

### 2. Turnstile CAPTCHA  (roadmap C2) — **P0**
- **Verified state:** **Zero** bot protection. No captcha widget anywhere; `signUp`/`signInWithPassword` called without a `captchaToken`.
- **Plan:** 1) **[USER]** create a Cloudflare Turnstile widget → site + secret key. 2) **[USER]** Supabase → Auth → Bot & Abuse → enable CAPTCHA, paste secret. 3) **[CODE]** render the widget in `AuthScreen.tsx`, thread the token through `AuthProvider.signUp/signIn` `options.captchaToken`, add `VITE_TURNSTILE_SITE_KEY`; handle token single‑use/expiry re‑render. *(The `turnstile-spin` skill automates most of this.)*
- **Effort:** S–M. **Risk (ordering):** enabling the Supabase toggle **before** shipping the client widget 400s every signup — **deploy client first, then toggle.** **Done when:** a tokenless scripted `signUp` is rejected; real users pass invisibly/one‑click.

### 3. Server‑side rate limiting  (roadmap C2; the save‑storm follow‑up) — **P1**
- **Verified state:** Client throttle + 4‑conflict breaker exist (`CloudSync.tsx`, `MIN_SAVE_MS=1500`) — but they're **client‑only and bypassable**. `save_entry` and the leaderboard Function have **no server/edge throttle**; no `wrangler.toml`/`_middleware.ts`/WAF config in the repo.
- **Plan:** 1) **[CODE]** add a per‑user throttle inside `save_entry` (a small `rate_limit(uid,key,window)` raising over N writes / M sec — the true backstop the client can't provide; ships as SQL you run). 2) **[USER]** Cloudflare WAF rate‑limit rules on `/functions/v1/*`, `/rest/v1/*`, `/api/*` (scope by path so the crons aren't caught). 3) **[USER]** Supabase → API → **Max rows = 1000** (caps scraping of the anon board). 4) **[CODE]** optional `functions/_middleware.ts` per‑IP guard for `/api/*`.
- **Effort:** M. **Risk:** too‑tight window rejects legit rapid saves — set above the client's 1s debounce. **Done when:** a scripted `save_entry` loop from one user/IP is throttled server‑side without a client in the loop.

### 5. Real‑time cron alerting  (roadmap C5/A3) — **P1**
- **Verified state:** Health is **queryable but not alerted.** `ingest_health` upserts per run; `verify-app.mjs` treats >20‑min staleness as failure; the **nightly** Claude routine runs `npm test` + `verify:app` — i.e. up to ~24h detection latency. **No `scoring_health` row at all** — a stalled scorer with a healthy ingest goes unnoticed.
- **Plan:** 1) **[CODE]** add a `scoring_health` upsert inside `recompute-score`. 2) **[CODE]** a watchdog cron (`*/10`) reading both health rows → POST an alert if `ok=false` or stale. 3) **[USER]** point that at a Slack/Discord webhook (or email). 4) **[USER]** optional external uptime ping so a full Supabase outage (which kills the internal watchdog) is still caught. 5) keep nightly `verify:app` as the deep daily audit.
- **Effort:** M. **Risk:** internal watchdog can't see a total outage (hence the external ping); tune thresholds to the 3/5‑min cron cadence. **Done when:** a stalled ingest **or** scoring cron alerts off‑machine within ~10 min.

### 6. Single‑source active‑tournament config  (new hazard — not in the roadmap) — **P1**
- **Verified state:** `tournamentId` is **hardcoded `montreal_2026` in FOUR places**: both cron bodies (`setup_ingest_cron.sql`, `setup_scoring_cron.sql`) **and** both edge‑function defaults (`ingest-draw`, `recompute-score`). The client auto‑follows the active tournament (`liveData.ts`), but the server does not. A tournament switch = a four‑file manual edit → **the single most likely Cincinnati/US‑Open launch‑day footgun.** Also the service‑role key is pasted plaintext into `cron.job`.
- **Plan:** 1) **[CODE]** add an `app_config(active_tournament_id)` table; both crons read it (`jsonb_build_object('tournamentId',(select …))`) → a switch is **one UPDATE**. 2) **[CODE]** both edge functions default to that same value so body/default can't drift. 3) **[USER]** move the service key to Supabase **Vault**, reference via `vault.decrypted_secrets`.
- **Effort:** M. **Done when:** switching tournaments is one config change and the key isn't in `cron.job` plaintext.

### 7. Supabase Pro + pooler + row cap  (roadmap C3) — **P1, USER**
- **Verified state:** Scale SQL is written (`scale_leaderboard.sql`, `harden_and_scale_2.sql`: hot indexes `entries(tournament_id,score desc)` + `league_members(user_id)`, set‑based `apply_entry_scores`, collision‑retry `create_league`) and *appears* applied — but there's **no applied‑ledger to prove it** (see #13).
- **Plan:** 1) **[USER]** verify both hot indexes exist live (`select indexname from pg_indexes …`). 2) **[USER]** upgrade to **Pro** (removes auto‑pause, raises connection ceiling). 3) **[USER]** enable the **transaction pooler** (Supavisor) + point app/edge at the pooled string. 4) **[USER]** set PostgREST `db-max-rows`. 5) **[CODE]** confirm `recompute-score` chunks into `apply_entry_scores` ≤5000 rows to finish inside the 3‑min window at scale.
- **Effort:** M. **Risk:** pooler changes connection semantics — test edge fns first; upgrade in a lull. **Done when:** indexes confirmed, Pro + pooler + row cap on, scorer verified within the cron window.

### 12. Deploy rollback + tagging  (go‑live checklist gap) — **P2**
- **Verified state:** `deploy.mjs` is a strong safe‑deploy (wipe dist → test gate → build → deploy → poll live for the exact bundle hash). But **no rollback story** and it ships with `--commit-dirty=true` (an uncommitted tree can go out). Recovery today = `git revert` + full redeploy.
- **Plan:** 1) **[CODE]** tag each prod deploy (`deploy-<utc>`). 2) **[CODE]** `npm run rollback` re‑pointing the CF alias to the prior deployment (or checkout last tag + redeploy). 3) **[CODE]** warn/block on a dirty tree for **prod** deploys. **Risk:** a frontend rollback alone desyncs if a bad deploy shipped with an incompatible SQL/edge change — pair with #13. **Done when:** a documented one‑command/click restores the prior bundle in <2 min.

### 13. Migrations convention + applied‑ledger  (roadmap C6/#8) — **P2**
- **Verified state:** ~26 hand‑run `.sql` files, correct order encoded only in comments (e.g. "B8 Part 1 before Part 2"). **No record of what's applied.** The `supabase` CLI is already a devDependency but unused. Risk: re‑running a superseded file (old `using(true)` entries policy) silently re‑opens a security hole.
- **Plan:** 1) **[CODE]** move to `supabase/migrations/` with an ordered `NNNN_*.sql` scheme; keep dangerous/self‑test files in `supabase/ops/`. 2) **[CODE]** adopt `supabase migration`/`db push`/`list`. 3) **[CODE]** `MIGRATIONS.md` ledger (file → applied‑date per env). 4) **[USER]** one‑time reconcile the ledger against live (the #7/RLS audit queries). **Effort:** M–L. **Done when:** a fresh env rebuilds by replaying `migrations/*` in order.

### 14. Dev/prod DB isolation  (item 10) — **P2**
- **Verified state:** Confirmed — **local, `deploy:preview`, AND the CI boundary job all write to the live Supabase.** Only `tournament_id` gives partial logical isolation; users/entries/leagues/profiles are shared. This is what gave the save‑storm incident its blast radius.
- **Plan:** 1) **[USER]** create a second Supabase project for dev/CI; apply the migration set (#13). 2) **[CODE]** gitignored `.env.development` → dev project; point `deploy:preview` + CI boundary at it. 3) **[CODE]** interim: force all dev/local work onto a non‑live `tournament_id`. 4) **[USER]** rotate the service‑role key if it's been used from local against prod. **Deps:** #13. **Done when:** dev/preview/CI never mutate live‑user data.

### 17. Doc corrections + CI polish  (P3‑quick, [CODE])
- Mark C4/#7/#11 done; fix "247"→"300" everywhere; correct stale guest‑mode wording (`supabaseClient.ts`, `GO_LIVE.md`); fix the "74‑entrant" comment (real Montréal field is **77**). CI: add an `oxlint` step (oxlint is already wired), a `concurrency` guard (stop overlapping runs hammering the shared DB), and run the `boundary` job on PRs too. **[USER]** add a branch‑protection rule requiring green CI before merge.

---

## 3. Bucket B — Cincinnati & US Open ports

**Engine is DONE for both shapes** — the parser is test‑validated on the real 2025 draws (96‑draw NBO *and* 128‑draw US Open, 127/127), `splitBrackets` is wired both sides, `recompute-score` already carries R128 points. No parser/scoring code change is needed for either event.

### ⚠️ Hidden couplings that a stale roadmap misses (read before either port)
1. **`player_stats` is a single GLOBAL table (no `tournament_id`).** Re‑seeding it for a new event **overwrites the live event's ranks.** Only re‑seed at cutover, or add a `tournament_id` column (schema change touching `recompute-score`). — the #1 cross‑tournament hazard.
2. **Montréal‑pinned tests are a hard deploy gate.** `liveIngestParity.test.ts` asserts `ACTIVE_TOURNAMENT_ID==='montreal_2026'`, the round set, the Wikipedia page title, and field‑id count **77**; `serverScoring.test.ts` asserts the seed↔PLAYERS parity. Changing `DEFAULT_TOURNAMENT_ID` flips what these resolve to → they **must** be updated in lockstep or `deploy.mjs` blocks the ship.
3. **Two edge functions + two crons must switch together** (#6 config‑table fixes this permanently).
4. **Exact Wikipedia page title.** Client derives `` `2026 ${TOURNAMENT.name} – Men's singles` `` → "2026 Cincinnati Open – Men's singles" / "2026 US Open – Men's singles". A different Wikipedia title silently 404s the feed. Verify per event (the `body.page` override is the escape hatch).
5. **`reconcile-field.mjs` is the only guard against silent zero‑scores** from unresolved names (family‑name‑first / accented / hyphenated). Run it until it exits 0.
6. **`VITE_ACTIVE_TOURNAMENT` isn't wired into `deploy.mjs`** — a staging build must export it before the build; `deploy.mjs` inherits process env, so `VITE_ACTIVE_TOURNAMENT=cincinnati_2026 npm run deploy:preview` works, but it's undocumented (worth a first‑class `deploy:staging` script).

### Recipe A — Cincinnati (96‑draw, 6 rounds R64→F)
Config is structurally complete **except a schedule**; field is a placeholder. Ordered steps:
1. **[USER]** entry list + Wikipedia draw publish *(blocks everything)*.
2. **[CODE]** build `src/data/cincinnati2026Field.json` (~77 `RawPlayer` incl. authoritative `ranking`/`seed`). **L**
3. **[CODE]** set `FIELDS.cincinnati_2026` to it (replace the Montréal placeholder). **S**
4. **[CODE]** add the full `schedule` (R64=draft close + R32/R16/QF/SF/F from the official order of play, UTC) — *can scaffold now with estimates, finalize when the OoP publishes.* **M**
5. **[USER]** `npm run reconcile:field -- "2026 Cincinnati Open – Men's singles" src/data/cincinnati2026Field.json` → must exit 0. **M**
6. **[CODE]** regenerate the `player_stats` seed to Cincinnati ids/ranks (cutover‑only clobber). **M**
7. **[CODE]** update the Montréal‑pinned test literals to Cincinnati. **M**
8. **[CODE]** point `ingest-draw` at Cincinnati (field import + `WIKI_PAGE` + `TOURNAMENT_ID`; `SCORED_ROUNDS` unchanged). **M**
9. **[USER]** staging dry‑run: build with `VITE_ACTIVE_TOURNAMENT=cincinnati_2026`, deploy to preview, force one ingest+score, verify board. **M**
10. **[CODE]+[USER]** flip `live:true`, set `DEFAULT_TOURNAMENT_ID`, update both cron bodies (or the #6 config row), `npm run deploy`. **M**

### Recipe B — US Open (128‑draw, 7 rounds R128→F)
Same shape, plus: US Open is **absent from the `FIELDS` map** (add it), needs its schedule fleshed out (only an `R128` stub today), and `ingest-draw` `SCORED_ROUNDS` must **include R128**. Blocked on the entry list (~late Aug). Acceptance: all **127** pairings ingest and score on staging.

---

## 4. Bucket C — Product polish & retention

### 8. `HowToPlay` stale scoring copy — **P0‑quick, [CODE]**
The rules modal (the one new‑user scoring doc) still says "you earn **bonus points** (bigger in the later rounds)" — that's the **old additive** model. The live model is one graduated **multiplier** (×1→~×2 by gap, favourites at full base), and `TournamentPage`'s explainer already matches. **Fix:** rewrite that one card to match; ideally extract the scoring blurb to a shared constant so the two can't drift again. **S.**

### 9. A11y: focus‑trap + 2 missing dialog roles — **P2, [CODE]**
Foundation is strong (`:focus-visible`, AA‑tuned `--ink-3`, `prefers-reduced-motion`, most modals have `role="dialog"`). Two gaps: (a) `HowToPlay` and `UserProfile` modals lack `role="dialog"/aria-modal`; (b) **no focus management on ANY modal** — `useEscapeToClose` does Escape + scroll‑lock only, never traps Tab or restores focus. **Fix:** add the two roles; extend the hook (or a sibling `useModalA11y(ref)`) to move focus in on open, cycle Tab within, restore to the opener on close — one hook change covers ~10 modals (mirror the existing `escStack` discipline for nested modals). **M.**

### 10. Admin ingest‑health banner — **P2**
`AdminPage` exists but is **unreachable** (`App.tsx:62` hard‑off, no nav entry) and shows nothing about ingest health. The data that most predicts a silent scoring failure — draw published? last ingest age? `drafted_missing` (unmatched drafted players = someone scoring zero) — is invisible in‑app. **Plan:** **[CODE]** an `IngestHealthBanner` (select on `ingest_health`) on `AdminPage` + a compact "⚠ N unmatched" on Home gated by `isAdmin()`; re‑enable an admin entry point behind `isAdmin()`. **[USER]** decide the `ingest_health` read path / RLS (client select vs edge fn) and who counts as admin (currently a localStorage flag — convenience only, keep the authoritative gate server‑side). **M.**

### 11. Round reminders (email/push) — **P2, biggest retention hole**
In‑app countdowns exist; **no outbound reminders at all** (no push, no service worker, no reminder emails). A manager who closes the tab and forgets to set a captain / replace an eliminated player silently scores zero. **Plan (email MVP):** **[CODE]** a scheduled edge fn that, per upcoming deadline, emails only managers who still need to act (reuse the `NextMove` "done" derivations server‑side) with an unsubscribe flag on `profiles`. **[USER]** the sender/deliverability (= #1 SMTP). Web‑push is a bigger lift (SW + VAPID + iOS caveats) for fewer users. **L. Deps:** #1.

### 15. Share‑my‑standing virality loop — **P2, [CODE]**
The invite loop is solid, but there's **no "I finished R2 on 340 pts, 1st in my league" share** — free virality at the emotional peak (elimination/final standings) is missing. **Fix:** a one‑tap "share my standing" on the finished/round‑live `NextMove` card + `TournamentPage` finished block, composing text+link via the existing `shareInvite`/native‑share pattern; plus a NextMove nudge when a private league has only one member. **S.** (A real league social layer — chat/reactions — is a separate **L** if you want it; start with canned "overtaken / new leader" nudges over free‑text to avoid moderation surface.)

### 5 (product) — Player insight (D5): **already ahead.** PlayerPage is rich (bio, tiers, surface bars, transparent pricing breakdown, 2026 results, H2H) and reachable from the market table. Minor: the "H2H" is a stat comparison, not a real career record — either relabel it or ingest true H2H (a data‑sourcing decision).

---

## 5. Quick wins I can start now (no user action needed)

Pure **[CODE]**, shippable immediately, in rough order of value:
1. **#8** Fix the stale `HowToPlay` scoring copy (correctness, user‑facing). *S*
2. **#17** Doc corrections (247→300, CI/git‑remote done, guest‑mode, 77‑entrant) + CI polish (oxlint, concurrency, boundary‑on‑PR). *S*
3. **#15** Share‑my‑standing card + solo‑league invite nudge. *S*
4. **#9** A11y focus‑trap hook + the two missing dialog roles. *M*
5. **#12** Deploy rollback + tag + dirty‑tree guard. *S–M*
6. **#3** The `save_entry` server‑side rate‑limit SQL (you run it; I write + test it). *M*
7. **#6** The `app_config` single‑source active‑tournament table + cron/edge wiring. *M*
8. **#4 step 4** Scaffold a Cincinnati `schedule` with estimates now (finalize when the OoP publishes). *M*

The **P0 audience‑unlock items (#1 SMTP, #2 CAPTCHA, #7 Pro)** need your dashboard/billing actions; I can pre‑stage the code side of #2 (the Turnstile widget) so flipping it on is a two‑minute toggle.
