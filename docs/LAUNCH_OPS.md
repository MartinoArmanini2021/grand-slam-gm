# Launch Ops Checklist — Grand Slam GM

Everything here is a **dashboard/config action you must do** (I can't do these from code). Ordered
by urgency. The first three are the difference between a working launch and a broken one.

---

## 🔴 Before you share the link with anyone

### 1. Custom SMTP for auth emails  — *the #1 blocker*
Supabase's built-in email sender is rate-limited to a few messages **per hour** and is explicitly
"not for production." Without this, most new signups never receive their confirmation email and
**cannot log in.**
- Supabase → **Authentication → Emails → SMTP Settings** → enable custom SMTP.
- Use a real provider: **Resend** (easiest), AWS SES, or Postmark. Add the sender domain + DNS records they give you.
- Test: sign up with a fresh address from your phone and confirm the email arrives in < 1 min.

### 2. Turnstile CAPTCHA on signup  — *stops bot abuse*
No bot protection today → scripts can mass-create accounts, burn your email quota, and inflate your bill.
- Cloudflare dashboard → **Turnstile** → create a widget → copy the secret key.
- Supabase → **Authentication → Settings → Bot and Abuse Protection** → enable CAPTCHA → paste the key.
- (The app's auth screen may need the Turnstile client widget added — tell me and I'll wire it in.)

### 3. Upgrade Supabase to Pro + set row caps  — *free tier will collapse / data is scrapable*
Free tier (~50k MAU, ~60 connections, auto-pauses) cannot survive a public launch, and the anon
leaderboard grant lets anyone dump the tables unbounded.
- Supabase → **Billing** → upgrade to **Pro**.
- **Settings → Database → Connection pooling** → use the **Transaction** pooler (Supavisor).
- **Settings → API → Max rows** → set to **1000** (caps any single REST response — blunts scraping and protects egress).

### 4. Apply the anon-read grant (if not already)
Needed for the cached public leaderboard endpoint to serve real data.
- Supabase → SQL Editor → run [`supabase/public_leaderboard.sql`](../supabase/public_leaderboard.sql).

### 5. Turn on server scoring (cron)  — ✅ *you've done this*
- `supabase/setup_scoring_cron.sql` — recomputes everyone's score from `matches` every 3 min.

### 5b. Turn on the results feed (the bridge — now built)  — *do this when the draw publishes (~31 Jul)*
This is what actually fills the `matches` table, so scores move for everyone. Two steps:
1. **Deploy the function:**
   ```
   supabase functions deploy ingest-draw
   ```
2. **Schedule it:** SQL Editor → run [`supabase/setup_ingest_cron.sql`](../supabase/setup_ingest_cron.sql)
   (replace `<SERVICE_ROLE_KEY>`, same as the scoring cron). Runs every 5 min.
- **Smoke test after deploy:** `supabase functions invoke ingest-draw` → the JSON shows
  `pairings`, `resultsKnown`, `matchesWritten`, and `draftedMissing` (names that didn't match
  the roster — should be empty once the draw is up). Pre-draw it returns 0s, which is correct.
- **Manual override** if the feed ever gets a match wrong: invoke with a body, e.g.
  `{"overrides":[{"round":"QF","slot":0,"winnerId":"shelton"}]}` — a human always wins.

---

## 🟡 Nice to have before launch

### 6. Custom domain
`grand-slam-gm.pages.dev` reads as a throwaway link when shared. A real domain (e.g. `grandslamgm.com`)
materially increases trust and click-through.
- Cloudflare Pages → your project → **Custom domains** → add your domain.

### 7. Git + CI/CD (from our earlier chat)
Push the repo to GitHub and connect Cloudflare Pages for auto-deploy + one-click rollback. See the
steps I gave you; move the `VITE_*` env vars into Cloudflare build settings.

---

## 🟢 During the tournament (operational)

- **Watch the scoring cron** ran (Supabase → Database → cron jobs / logs). If it stops, scores freeze.
- **Watch for unmatched players** — if a feed player name doesn't match the roster, that drafted player
  silently never scores. (I'm adding a health indicator + manual override for this.)
- **Keep the service-role key secret** — it bypasses RLS. Never put it in the client or the repo.

---

## ⚙️ Code-side items already handled
- ✅ **The live-results bridge is built** — `ingest-draw` (Wikipedia → `matches`), sharing the exact
  parser 90+ unit tests validate. Deploy it per step 5b when the draw publishes.
- ✅ Full 96-draw parser + roster name reconciliation (all 74 players, tested against the real 2025 draw).
- ✅ Leaderboard polling pauses on hidden tabs + jitters (protects the backend at scale).
- ✅ The scorer paginates entries (won't silently score only the first 1000 at scale).
- ✅ Score column is server-authoritative (clients can't write it).
- ✅ Public board is edge-cached.

## 🚧 Nice-to-have follow-ups
- An in-app admin health banner ("last updated / N unmatched players") — the data for it is already
  in the `ingest-draw` response (`draftedMissing`); just needs surfacing in the UI.
