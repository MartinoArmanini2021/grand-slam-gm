# Grand Slam GM — Go‑Live Guide

A step‑by‑step plan to take the app from a local, single‑device prototype to a
live, multi‑user product where friends log in, build squads, and see each other's
teams and scores on a shared leaderboard.

Everything here is grounded in the code as it stands today. Pricing was verified
against provider pages in mid‑2026 (sources at the bottom) — always re‑check the
live pricing pages before committing.

---

## 0. TL;DR — the decision

**Recommended stack (the easiest path, because half of it is already wired):**

| Concern | Provider | Why | Cost to start |
|---|---|---|---|
| Auth + Database + Realtime | **Supabase** | `@supabase/supabase-js` is already installed and `AuthProvider.tsx` already does signup/verify/login/reset/guest. Postgres + Row‑Level Security is exactly what "each user owns their squad, everyone in the league can read it" needs. | Free → **$25/mo** once truly live |
| Static hosting | **Cloudflare Pages** | The app is a static Vite SPA. Cloudflare's free tier allows **commercial use** and **unlimited bandwidth**. (Vercel has nicer DX but its free Hobby tier forbids commercial use — you'd pay $20/mo.) | **Free** |
| Transactional email (verify / reset) | **Resend** | Drop‑in SMTP that plugs straight into Supabase Auth; far better deliverability and rate limits than Supabase's built‑in demo mailer. | **Free** (3k/mo) |
| Domain | **Cloudflare Registrar** | At‑cost pricing (no markup), and you're already on Cloudflare. | ~**$10–12/yr** |
| Error monitoring (optional) | **Sentry** | Free tier catches white‑screen crashes in the wild. | Free |
| Analytics (optional) | **Cloudflare Web Analytics** | Cookieless → no cookie banner needed. | Free |

**Total cost:** **$0/mo + ~$1/mo domain** to launch with friends; **~$25/mo** once
you flip Supabase to Pro for a public, always‑on app. See §7 for the full budget.

**The single most important design decision** is scoring integrity — see §3.3.
Do not let the client write its own score to the database, or the leaderboard can
be cheated. The fix is cheap because your results are static data.

---

## 1. Where you are today (verified in code)

- **Frontend:** Vite + React + TypeScript + Zustand + Tailwind. Pure static SPA.
- **Auth:** already built. `src/auth/AuthProvider.tsx` implements `signUp`
  (with email verification), `signIn`, `signOut`, `resend`, `updatePassword`, and
  a guest mode. `src/auth/supabaseClient.ts` is env‑gated on
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` and falls back to guest‑only when
  unset. **This means the authenticator is ~90% done.**
- **State that must move to the cloud:**
  - Game state (`src/store/gameStore.ts`, persisted key `grand-slam-gm-v1`):
    `phase, myTeam, captain, captainHistory, budget, budgetReturns,
    currentRoundIndex, myScore, roundScores`.
  - Profile (`src/store/profileStore.ts`, key `gsgm-profile`):
    `firstName, lastName, username, phone, country, teamName, teamEmblem`.
- **Rivals are AI, not people.** `src/data/rivals.ts` simulates 5 managers; the
  league board mixes you with them. Going live means replacing (or supplementing)
  those with real users' teams read from the database.
- **Everything is `localStorage`.** Nothing is shared between devices or people yet.

So the remaining work is: **a database, a sync layer, server‑authoritative scoring,
hosting, production email, and the legal basics.** Auth itself barely needs touching.

---

## 2. Architecture at a glance

```
┌────────────────────┐        ┌─────────────────────────────────────────┐
│  Cloudflare Pages  │        │                Supabase                 │
│  (static SPA)      │        │                                         │
│                    │  HTTPS │  Auth (email/password, JWT)             │
│  React + Zustand   │◄──────►│  Postgres + Row‑Level Security          │
│  supabase-js       │        │    profiles / entries / leagues / …     │
│                    │        │  Edge Function: recompute_score()       │
└────────────────────┘        │  (custom SMTP → Resend for emails)      │
                              └─────────────────────────────────────────┘
```

- The browser talks directly to Supabase using the **anon key** (safe to ship —
  RLS is what actually protects rows).
- **Scores are never written by the client.** The client stores *inputs* (squad +
  captain per round). An Edge Function recomputes the authoritative score from the
  fixed bracket. The leaderboard reads the server score.

### 2.1 Guest vs account
Keep guest mode. Guests stay 100% local (today's behaviour). Only signed‑in users
sync to the cloud and appear on shared leaderboards. This lets people try the game
with zero friction and upgrade to an account to play with friends.

---

## 3. The three things you asked about

### 3.1 Cloud storage of every person's team

**Postgres tables (Supabase).** One row per user's tournament entry. Because
players advance through a *fixed* real bracket, an entry only needs to store what
the user *chose* — the squad and the per‑round captain — plus lightweight progress.

Run this in the Supabase SQL editor (schema + security in one go):

```sql
-- 1. Profiles: identity + team branding, one per auth user.
create table public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  username    text unique,
  first_name  text,
  last_name   text,
  country     text,
  team_name   text default 'My Team',
  team_emblem text default '🎾',
  created_at  timestamptz default now()
);

-- 2. Entries: a user's squad for the tournament (+ progress).
--    squad/captain_history are the ONLY scoring inputs the client may write.
create table public.entries (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users on delete cascade,
  league_id           uuid references public.leagues on delete set null,
  squad               text[] not null default '{}',            -- player ids
  captain_history     jsonb  not null default '[]',            -- [{round, playerId}]
  phase               text   not null default 'draft',
  current_round_index int    not null default 0,
  score               int    not null default 0,               -- SERVER-written only
  budget              numeric not null default 100,            -- derived, for display
  updated_at          timestamptz default now(),
  unique (user_id, league_id)
);

-- 3. Leagues: public global league + private invite-code leagues.
create table public.leagues (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  code       text unique,                     -- null for the public league
  is_public  boolean default false,
  owner_id   uuid references auth.users on delete set null,
  created_at timestamptz default now()
);
```

> **Why `text[]`/`jsonb` and not a `bracket_results` join?** The bracket is static
> reference data that ships with the app. Keeping the *choices* in the row and the
> *results* in code (or one seeded table) keeps writes tiny and reads a single query.

### 3.2 Point / budget storage of each team

- **Budget** is deterministic (`100 − squad cost + refunds`), so it's fine to store
  as a convenience column for display, but treat it as derived, not authoritative.
- **Score is the sensitive number.** Store it in `entries.score`, but make it
  **writable only by the server** (see §3.3). The client shows its own optimistic
  score for snappy UX; the leaderboard trusts only `entries.score`.

### 3.3 ⚠️ Scoring integrity (the decision that makes or breaks fairness)

Right now the browser computes the score (`playNextRound` in `gameStore.ts`). If
the browser is also allowed to *write* that score to the shared leaderboard, anyone
can open dev‑tools and set `score = 999999`. For a "best of the best" product this
must be closed.

**Recommended: server‑authoritative scoring via a Supabase Edge Function**, reusing
your existing scoring code so the logic isn't duplicated:

1. The client only ever writes `squad` and `captain_history` (RLS forbids writing
   `score` — see §4).
2. An Edge Function `recompute-score` imports the *same* `winPoints` / round logic
   from `src/data/tournament.ts` (share the file, or copy the pure functions), reads
   the entry's `squad` + `captain_history`, recomputes the score from the fixed
   bracket, and writes `entries.score` using the **service‑role key** (server‑only).
3. Call it after each round is played, or run it on a schedule (Supabase cron) when
   real results roll in.

```ts
// supabase/functions/recompute-score/index.ts  (Deno)
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { scoreEntry } from './scoring.ts'; // pure fn copied from src/data/tournament.ts

Deno.serve(async (req) => {
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, // NEVER ships to the browser
  );
  const { entryId } = await req.json();
  const { data: e } = await admin.from('entries').select('*').eq('id', entryId).single();
  const score = scoreEntry(e.squad, e.captain_history, e.current_round_index);
  await admin.from('entries').update({ score }).eq('id', entryId);
  return new Response(JSON.stringify({ score }), { headers: { 'content-type': 'application/json' } });
});
```

**Simpler alternative (fine for a private friends‑only league):** trust the client
and let it write `score`. Zero extra work, but only safe among people who won't
cheat. Ship this for Phase 0, add the Edge Function before any public/competitive
launch. Both paths use the same tables.

---

## 4. Row‑Level Security (copy‑paste)

RLS is the whole security model — with it on, the public anon key is safe to ship.

```sql
alter table public.profiles enable row level security;
alter table public.entries  enable row level security;
alter table public.leagues  enable row level security;

-- Profiles: anyone signed in can READ (to show names on the board); write only yourself.
create policy "profiles readable" on public.profiles
  for select to authenticated using (true);
create policy "own profile upsert" on public.profiles
  for insert to authenticated with check (auth.uid() = id);
create policy "own profile update" on public.profiles
  for update to authenticated using (auth.uid() = id);

-- Entries: read any entry that shares one of your leagues (so you see rivals'
-- squads); write ONLY your own row, and NEVER the score column.
create policy "league entries readable" on public.entries
  for select to authenticated using (
    league_id is null
    or league_id in (select league_id from public.entries where user_id = auth.uid())
  );
create policy "own entry insert" on public.entries
  for insert to authenticated with check (auth.uid() = user_id);
create policy "own entry update" on public.entries
  for update to authenticated using (auth.uid() = user_id);

-- Block client writes to score: revoke the column, server uses service-role which
-- bypasses RLS.
revoke update (score) on public.entries from authenticated;

-- Leagues: public leagues readable by all; private readable if you're a member;
-- anyone can create; joining is done by looking up the code (see §6).
create policy "leagues readable" on public.leagues
  for select to authenticated using (
    is_public
    or id in (select league_id from public.entries where user_id = auth.uid())
  );
create policy "create league" on public.leagues
  for insert to authenticated with check (auth.uid() = owner_id);
```

Auto‑create a profile row when someone signs up:

```sql
create function public.handle_new_user() returns trigger
language plpgsql security definer as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

---

## 5. The sync layer (client changes)

Keep Zustand + `localStorage` as an offline cache, and add a thin Supabase sync.
Minimal set of changes:

1. **On login / app load (signed‑in user):**
   - `select` the user's `profiles` row → hydrate `profileStore`.
   - `select` the user's `entries` row → hydrate `gameStore` (or start a new entry).
2. **On profile save:** `upsert` into `profiles`.
3. **On squad lock (`finalizeDraft`) and each round played:** `upsert` the entry
   (`squad`, `captain_history`, `phase`, `current_round_index`), then invoke
   `recompute-score`.
4. **League board:** replace/augment `getRivalTeams` with a query:
   `select entries.*, profiles.team_name, profiles.team_emblem … where league_id = …
   order by score desc`. Join `profiles` for names/emblems. (Keep the AI rivals as
   optional "bots" to pad small leagues if you like.)
5. **Realtime (optional, delightful):** subscribe to `entries` changes for your
   league so the board updates live as friends make moves —
   `supabase.channel('league:'+id).on('postgres_changes', …)`.

Guests skip all of the above and stay local (today's behaviour).

> Effort: this is the bulk of the work — roughly 1–2 focused days. The schema and
> auth are the easy parts; the sync wiring and the leaderboard query are where the
> time goes.

---

## 6. Private leagues (join by code)

- **Create:** insert a `leagues` row with a random short `code` (e.g. 6 chars) and
  `owner_id = auth.uid()`; move/copy the creator's entry into it.
- **Join:** the user types a code → `select id from leagues where code = ?` → set
  their entry's `league_id`. Because "league entries readable" keys off shared
  `league_id`, they immediately see everyone in that league and vice‑versa.
- Wire this into the existing **Private Leagues** panel in `LeaguePage.tsx`, which
  already has "Create a league" / "Join with a code" buttons stubbed out.

---

## 7. Providers & budget (clear numbers)

### Provider‑by‑provider

**Backend — Supabase (recommended, because auth is already on it).**
- Free: 500 MB DB, 50k monthly active users, 1 GB storage, 5 GB egress. **Catch:
  projects pause after 7 days of inactivity** — fine for testing, risky for a live
  app with sparse early traffic.
- Pro: **$25/mo** — no pausing, daily backups (7‑day), 8 GB DB, 100k MAU, 250 GB
  egress, $10 compute credit included. Real‑world small apps land **$35–75/mo** once
  usage is added, but you won't approach that for a long time at fantasy‑game scale.
- *Alternatives considered:* Firebase (would throw away the working Supabase auth
  and Postgres/RLS fit worse for relational league data); a custom Node + Postgres
  backend (far more ops for zero benefit here). **Supabase is the clear, easiest
  choice.**

**Hosting — Cloudflare Pages (recommended).**
- Free tier permits **commercial use**, **unlimited bandwidth**, 500 builds/mo.
- Pro is only $5/mo and you likely never need it for a static SPA.
- *Alternative:* **Vercel** — best‑in‑class DX (preview deploys, analytics), but the
  free Hobby tier **prohibits commercial use**, so a real product needs Pro
  **$20/mo/seat**. Pick Vercel only if you value the DX over the cost.

**Transactional email — Resend (recommended).**
- Free: **3,000 emails/mo, 100/day**, SMTP relay + DKIM/SPF/DMARC on every tier.
- Plugs into Supabase Auth → Settings → SMTP. Requires verifying a sending domain
  (a few DNS records).
- Pro from **$20/mo** when you outgrow the free tier.
- *Why not Supabase's built‑in mailer?* It's rate‑limited to a handful of emails/hour
  and meant for demos — verification emails will silently fail at launch.

**Domain — Cloudflare Registrar (~$10–12/yr for `.com`).** At‑cost, no renewal
markup, and it's where your DNS already lives. Namecheap/Porkbun are fine too.

**Optional:** Sentry (free error monitoring — worth it, catches white‑screens),
Cloudflare Web Analytics (free, cookieless → no cookie banner).

### Budget by phase

| Phase | Who's using it | Supabase | Hosting | Email | Domain | **Monthly** |
|---|---|---|---|---|---|---|
| **0 — MVP with friends** | you + a few friends | Free | CF Pages Free | Resend Free | ~$1 (amortized) | **~$1** |
| **1 — Public launch** | up to a few thousand | **Pro $25** | CF Pages Free | Resend Free | ~$1 | **~$26** |
| **2 — Scaling** | tens of thousands | Pro + usage $35–75 | CF Pages Free | Resend Pro $20 | ~$1 | **~$56–96** |

The only step change is flipping Supabase to Pro (§8, Phase 1) so the project never
pauses and you get backups. Everything else scales on free tiers for a long time.

---

## 8. Step‑by‑step (do these in order)

### Phase A — Supabase project (30 min)
1. Create a project at supabase.com. **Choose an EU region** (e.g. Frankfurt/Ireland)
   — you're in the EU, this keeps user data in‑region for GDPR, and **region can't
   be changed later**.
2. Project Settings → API → copy the **Project URL** and **anon public key**.
3. Auth → Providers → Email: keep **"Confirm email" ON**.
4. Auth → URL Configuration: set **Site URL** to your future domain and add it to the
   redirect allow‑list (needed for verification / reset links to land back on your
   site). Add `http://localhost:5173` too for local dev.

### Phase B — Schema + security (20 min)
5. SQL editor → paste and run the schema (§3.1), RLS (§4), and the new‑user trigger.
6. Seed the public league: `insert into leagues (name, is_public) values
   ('Wimbledon 2026 Open League', true);`.

### Phase C — Wire the sync (1–2 days)
7. Put the URL + anon key in `.env` (already documented in `.env.example`).
8. Implement §5: hydrate stores on login, upsert profile, upsert entry on lock and
   per round, and swap the leaderboard to a real query. Ship this behind the existing
   guest fallback so nothing breaks when env vars are unset.

### Phase D — Lock down scoring (½ day, before any public launch)
9. Add the `recompute-score` Edge Function (§3.3), copy the pure scoring functions,
   `revoke update(score)` (already in §4), invoke it after each round.

### Phase E — Private leagues (½ day)
10. Implement create/join‑by‑code (§6) in the Private Leagues panel.

### Phase F — Production email (30 min)
11. Create a Resend account, verify your domain (add its DNS records).
12. Supabase → Auth → SMTP settings → paste Resend's SMTP host/port/credentials and
    a sender like `no‑reply@yourdomain`. Send yourself a test signup.

### Phase G — Deploy (30 min)
13. Push to GitHub. In Cloudflare Pages: connect the repo, build command
    `npm run build`, output dir `dist`. Add `VITE_SUPABASE_URL` and
    `VITE_SUPABASE_ANON_KEY` as build env vars.
14. Add your custom domain in Cloudflare Pages; update the Supabase Site URL /
    redirect allow‑list to the real domain.

### Phase H — Legal & GDPR (½ day — don't skip, you're in the EU)
15. Add a **Privacy Policy** and **Terms of Service** page, linked from signup.
    You collect email + name + country (+ phone) = personal data.
16. **Minimize PII:** drop the phone field unless you truly need it — less data is
    less liability.
17. Add an **account‑deletion** path (GDPR right to erasure): a button that deletes
    the user's rows and calls `auth.admin.deleteUser` (via an Edge Function).
18. Sign Supabase's DPA (available on their site) and keep the project in the EU
    region (Phase A). Prefer cookieless analytics to avoid a consent banner.

### Phase I — Observability (optional, 30 min)
19. Add Sentry (free) for crash reporting; add Cloudflare Web Analytics (free).

### Phase J — Launch checklist
- [ ] Sign up with a real email end‑to‑end (verification email arrives via Resend).
- [ ] Two accounts in the same private league can see each other's squads + scores.
- [ ] Editing `entries.score` from the browser is **rejected** by RLS.
- [ ] Refresh / new device reloads your squad from the cloud.
- [ ] Supabase is on **Pro** (no pausing) before you tell anyone to sign up.
- [ ] Privacy Policy + Terms linked; account deletion works.
- [ ] Custom domain + HTTPS live; Supabase redirect URLs point to it.

---

## 9. Effort & sequencing summary

| Phase | Effort | Blocking for launch? |
|---|---|---|
| A Supabase project | 30 min | Yes |
| B Schema + RLS | 20 min | Yes |
| C Sync layer | 1–2 days | Yes |
| D Server scoring | ½ day | Yes for public/competitive |
| E Private leagues | ½ day | Optional for v1 |
| F Production email | 30 min | Yes |
| G Deploy + domain | 30 min | Yes |
| H Legal/GDPR | ½ day | Yes (EU) |
| I Monitoring | 30 min | No |

**Realistic total to a solid public v1: ~3–4 focused days**, most of it the sync
layer. Auth, hosting, and email are hours, not days.

---

## Sources (verified mid‑2026 — re‑check before committing)
- Supabase pricing — https://supabase.com/pricing
- Cloudflare Pages vs Vercel — https://www.devpick.io/compare/cloudflare-pages-vs-vercel
- Resend pricing — https://resend.com/pricing

## Server-authoritative scoring (W5) — build & deploy

Scores are computed on the server so the leaderboard number can't be self-reported.

**Pieces**
- `supabase/server_scoring.sql` — `matches` + `player_stats` tables. (`entries.score` is
  already locked to the server by `add_entry_state.sql`'s `revoke (score) from
  authenticated`, and the client's `saveEntry` never writes score — so no trigger needed.)
- `supabase/functions/recompute-score/index.ts` — the Edge Function (service role) that
  recomputes every entry from `public.matches`; the *only* writer of `entries.score`.
- `src/scoring/serverEngine.ts` — the pure scoring math the function mirrors. A parity
  test (`vitest serverScoring`) replays a full game in the client and asserts the engine
  returns the identical score, so client and server can never drift.

**Deploy (one-time)**
1. Apply the migration: paste `supabase/server_scoring.sql` into the Supabase SQL editor.
2. Deploy the function (Supabase CLI, logged into the project):
   ```bash
   supabase functions deploy recompute-score --project-ref mrdmlfumdsxufifjulbt
   ```
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.
3. Fill `public.matches`:
   - **Live:** the results feed / admin console writes rows as rounds finish.
   - **Replay/testing:** seed from the baked draw.
4. Recompute: `supabase functions invoke recompute-score` — or schedule it (pg_cron /
   a webhook) to run after each results update.

**Why it's cheat-proof**
- `revoke (score) from authenticated` blocks client writes to `entries.score` (clients can
  still save their squad `state`).
- The function credits a win **only if the result exists in `public.matches`**, so nobody
  can score a round the tournament hasn't played; `playedRounds` is derived from the DB and
  applied to everyone equally (the live shared-round model).

**Auto-run on live day (least-error option = `pg_cron`).** A time-based scheduler is more
robust than a DB trigger doing HTTP on every write: it's decoupled, fires on a fixed
cadence, and self-heals (a failed run just retries next tick). Paste this once when live
(replace `<SERVICE_ROLE_KEY>`):
```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('recompute-scores', '*/3 * * * *', $$
  select net.http_post(
    url := 'https://mrdmlfumdsxufifjulbt.supabase.co/functions/v1/recompute-score',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <SERVICE_ROLE_KEY>'),
    body := '{}'::jsonb
  );
$$);
```
Every 3 minutes it recomputes all scores from the latest results. (Simpler still, if you'd
rather stay manual: skip cron and just hit "Invoke" on the function after each round.)

**Final flip:** the leaderboard currently reads `entries.score || client-snapshot` (graceful
during the alpha). Once the function runs on a live event, switch `fetchLeaderboard` to use
`entries.score` exclusively — a one-line change.
