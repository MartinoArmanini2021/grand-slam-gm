# How to undo a bad release (rollback runbook)

**First, breathe.** A broken release almost never *ships* — `npm run deploy` refuses to publish unless all 300 tests pass **and** it confirms the live site is serving the new bundle. This page is for the rare case where something bad still gets through (a bug tests didn't catch, a wrong date/config, a bad SQL or edge-function change).

> ⚠️ **The one thing to understand:** the game is **three separate machines** that deploy independently. Undoing one does **not** undo the others:
> | Machine | What it is | How to undo |
> |---|---|---|
> | **The app** | what players see (Cloudflare Pages) | ✅ instant (below) |
> | **The database rules** | the SQL you run in Supabase (`supabase/*.sql`) | ⚠️ manual — sometimes can't be cleanly undone |
> | **The scorers** | background edge functions (`supabase/functions/*`) | re-deploy the previous version |
>
> **Before you undo, ask: did this release also change SQL or an edge function?** (Check the commit — did it touch `supabase/`?) If yes, an app-only rollback is **not enough** — see step 3.

---

## 1. Fast undo — the app only (≈30 seconds)
Cloudflare keeps **every** past deployment. To point the live site back to a previous one:
1. Cloudflare dashboard → **Workers & Pages** → **grand-slam-gm**.
2. **Deployments** tab → find the last known-good deployment (match it to a `release-…` git tag — the tag message shows its bundle name).
3. Click its **⋯** menu → **Rollback to this deployment** → confirm.

The live site flips back in seconds. Nothing is lost — the bad deployment still exists; you can roll forward again once fixed.

> This changes *only the app*. If the bad release also changed the database or scorers, do step 3 too.

## 2. Verified undo — rebuild a known-good version (≈2–3 min)
When you'd rather redeploy a specific good version through the full safety gate (tests + build + verify):
```bash
git tag --list "release-*"          # list restore points (newest last)
git checkout release-<stamp>        # e.g. release-20260810-113000Z
npm run deploy                      # rebuilds THAT version, re-runs 300 tests, re-verifies live
git checkout master                 # return to the latest branch when done
```
Every production deploy auto-creates + pushes a `release-<UTC-stamp>` tag whose message names the exact live bundle and commit — that's your list of restore points.

## 3. If the release also changed the DATABASE or the SCORERS
An app rollback (steps 1–2) does **not** touch these. If the bad commit changed files under `supabase/`:

- **A `supabase/*.sql` change (database rules):** SQL isn't versioned like the app. To undo, re-run the **previous** version of that file (find it with `git show release-<good>:supabase/<file>.sql`). ⚠️ Some changes (dropping/renaming data) can't be cleanly reversed — if unsure, stop and check before running anything.
- **An edge-function change (`supabase/functions/ingest-draw` or `recompute-score`):** redeploy the previous version:
  ```bash
  git checkout release-<good> -- supabase/functions/<name>
  npx supabase functions deploy <name> --project-ref mrdmlfumdsxufifjulbt
  git checkout master -- supabase/functions/<name>
  ```
  Then trigger one run so scores/results recompute against the restored code (or wait for the 3-/5-min cron).

## 4. After any rollback
- Confirm the live site works (open it; check the leaderboard shows scores).
- Fix the bug on `master`, commit, and roll **forward** with a normal `npm run deploy` (which re-tags a fresh restore point).

---

## Prevention (why you rarely need this page)
- **Test gate:** no deploy ships unless the full suite is green.
- **Bundle verify:** the deploy polls the live URL until it serves the exact new bundle — a skipped/failed publish can't pass silently.
- **Clean-tree guard:** a production deploy refuses an uncommitted working tree, so *what's live always maps to a git commit + release tag*.
- **Release discipline:** keep risky **database / scorer** changes as their *own* release, separate from app changes — so each can be undone cleanly. (This is the real long-term safeguard; the rollback steps above are the safety net.)
