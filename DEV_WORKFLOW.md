# Dev workflow — how to work on Grand Slam GM without breaking the live app

The tournament is **live**, so the golden rule is: **develop and test on `dev`, and only promote to
production deliberately.** Nothing you do locally or on the dev preview touches the live URL until you
run the production deploy.

## The three surfaces

| Surface | Command | URL | When |
|---------|---------|-----|------|
| **Local dev** (offline) | `npm run dev` | http://localhost:5173 | day-to-day coding, instant HMR |
| **Dev preview** (shared link) | `npm run deploy:preview` | https://dev.grand-slam-gm.pages.dev | test the real build / share with yourself before going live |
| **Production** (the live app) | `npm run deploy` | https://grand-slam-gm.pages.dev | only when a change is reviewed + tests pass |

Both Cloudflare targets are the **same Pages project**, different branches (`dev` vs `main`) — Cloudflare
serves any non-`main` branch as an isolated preview, so a dev deploy can never overwrite the live bundle.

## Version tracking (git)

- `master` mirrors what's in **production**.
- Do work on a **`dev`** branch (or a short-lived `feature/*` branch), commit as you go.
- Promote by merging into `master`, then `npm run deploy`.

```bash
git checkout dev            # work here
# … edit …
npm test && npm run typecheck   # must be green (see gate below)
git add -A && git commit -m "feat: <what changed>"
npm run deploy:preview     # eyeball it on the dev URL
# happy? promote:
git checkout master && git merge dev
npm run deploy
```

`.env` (Supabase URL + keys) is **gitignored** — never commit it. `.env.example` documents the shape.

## The pre-deploy gate (verifies user interactions are untouched)

Run these before any deploy — they cover the draft, transfers, captain/vice, the scoring engine, and a
150-game fuzz of the full play loop, so a regression in the game dynamics fails here, not in front of users:

```bash
npm test        # 247 unit/integration tests
npm run typecheck
npm run build   # the deploy scripts run this too and abort on failure
```

`npm run deploy` / `deploy:preview` already wipe `dist`, rebuild, and **verify the live bundle hash** after
upload — a skipped or partial deploy fails loudly instead of silently shipping stale code.

## Backend (Supabase) is deployed separately

The client deploy above ships **only the frontend + Cloudflare Functions**. The Supabase pieces are applied
by hand and are **shared by dev and prod** today:

- **SQL** (`supabase/*.sql`) → Supabase **SQL Editor**.
- **Edge Functions** (`supabase/functions/*`) → Supabase **Edge Functions** editor.

Because dev and prod share one Supabase project, **local/dev writes hit live data** (saving a squad, etc.).
For UI work that's fine. For anything that writes game/user data, either guard it or — the clean fix —
create a **second Supabase project for dev** and point a gitignored `.env.development` at it; Vite loads it
automatically under `npm run dev`. (Not required to start; noted so data isolation is a deliberate choice.)

## Quick reference

```
npm run dev              # local dev server (offline)
npm test                 # run the suite
npm run typecheck        # tsc, no emit
npm run build            # production build → dist/
npm run deploy:preview   # → dev.grand-slam-gm.pages.dev  (safe)
npm run deploy           # → grand-slam-gm.pages.dev      (LIVE)
```
