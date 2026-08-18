# Grand Slam GM — UX audit

**Written 2026-08-18, against the live Cincinnati build.** Eight auditors walked eight journeys at a
375×812 phone viewport, on the running app (`npm run dev:cincinnati`, port 5175, using the repo's own
`?ux=` harness), and read every file under `src/pages`, `src/components`, `src/store`, `src/data`,
plus the SQL and the edge functions behind them. Numbers in this document were measured off the
running page, not estimated.

You said: *"I'd rather be told something I built is confusing than have it politely left alone."*
So: every journey below starts with what is right, because several things here are better than what
most fantasy apps ship and a redesign that throws them away would be a step backwards. Then it says
plainly what is wrong, where, and what it costs.

---

## 1. The evidence everything else is context for

From `docs/ux_evidence.md`, read out of production on 2026-08-18:

| | |
|---|---|
| Entries at Cincinnati | **8** |
| Locked a squad, and therefore scored | **4** |
| Never locked, scored exactly zero | **4** |

| Manager | Picked | Tiers (P/G/S) | Budget left | Still needs | Cheapest legal finish | What happened |
|---|---|---|---|---|---|---|
| `88f692fa` | **10** | **2/3/5 — legal** | **$0.0M** | nothing | — | **Solved the whole puzzle. Never pressed Lock Squad. 23 saves.** |
| `32828145` | 7 | 1/3/3 | $7.0M | 1P 2S | **$26M** | **Mathematically stuck — $19M short. Nothing told them.** |
| `524e264f` | 6 | 2/3/1 | $31.0M | 4S | $16M | Could have finished with $15M spare. Stopped anyway. |
| `51face7f` | 2 | 2/0/0 | $69.0M | 3G 5S | **$65M** | Four million dollars from the same trap. 10 saves on two players. |

I independently confirmed the arithmetic against the live Cincinnati field. The cheapest legal 2/3/5
squad costs **$106M of the $150M budget** (cheapest Platinum Cobolli $18M, cheapest Gold Vacherot
$14M, cheapest Silver Shang $4M). Minimum 3 Gold + 5 Silver = $65M. Minimum 1 Platinum + 2 Silver =
$26M. Those are exactly the evidence-doc numbers. So "$150M to spend" is really "$44M of discretion",
and the app never says so on any screen at any point.

### One correction to the evidence document

`docs/ux_evidence.md:17-19` says *"Every single manager picked a captain. Every one of them
engaged."* **That inference is not supported.** `pickLeaders` (`src/store/gameStore.ts:23-35`) fills
any empty captain or vice slot with the best-ranked squad member, and `addPlayer` calls it on every
single pick (`gameStore.ts:214`). Captain is set automatically at your second tap. All eight having a
captain is the default, not a decision. The true captain-selection rate is currently unmeasured, and
that sentence should come out of the doc before it shapes any more design work.

### Severity, as used below

- **Blocker** — someone cannot complete the journey, or loses work.
- **Major** — they can finish but will be confused, or it silently costs them points.
- **Minor** — friction and polish.

---

## Journey 1 — Arriving: the link, the wall, the first run

**Taps from a cold link to a locked squad: ~25, plus one trip out to an email inbox. Today, tap 25
does not exist** — the Lock button has been replaced by a grey chip, so the ceiling for a new sign-up
during a live event is 24 taps and zero points.

### What works

- **`AuthScreen` leads with the pitch, not the form** (`src/components/AuthScreen.tsx:80-94`). The
  edition, "Draft a squad of pros, captain your stars, and beat your friends", three chips, a "How
  does it work?" link — then the email box. A cold visitor learns what the game is before being asked
  for anything. Most login walls do the opposite. Keep this exactly as it is.
- **`friendlyError` (`AuthScreen.tsx:16-26`) is better than most production auth.** It turns
  Supabase's raw strings into sentences a person can act on, and routes "email not confirmed" to a
  resend screen (`:66`) rather than a dead end.
- **`HowToPlay` derives its rules from tournament config** (`src/components/HowToPlay.tsx:8, 12-18`),
  so a Masters and a Slam each read correctly and the copy can never drift from the engine. That is
  the right way to write rules copy.
- **The join gate is one tap.** `JoinTournament` pre-fills every field from the account email
  (`src/components/JoinTournament.tsx:25-30`) and only requires the team name (`:36`). Do not add
  fields here.
- **Touch targets are 44–48px throughout the funnel.** Table stakes that plenty of apps still miss.
- **The `awaitingCloud` hold** (`src/App.tsx:141-150`, `src/components/CloudSync.tsx:196-204`)
  prevents flashing the join gate — whose `resetGame()` would wipe a squad — at a returning player
  whose cloud state has not resolved. The reasoning is written into the code. The instinct is right.

### 1.1 — BLOCKER · The whole sign-up funnel sells a draft that cannot be entered

Cincinnati's R64 started 15 Aug. Today is the 18th. A stranger signing up right now is told:

- "Draft a squad of pros" and "🎾 Draft 10 · $150M" (`AuthScreen.tsx:85, :87`)
- "Draft 10 players · $150M budget · captain for ×2" (`JoinTournament.tsx:69`)
- "Draft 10 players with your $150M, name a captain, and climb the leaderboard"
  (`src/components/TournamentWelcome.tsx:63`)

…then `FirstRunTour` actively navigates them to the Market (`src/components/FirstRunTour.tsx:62`),
where the header says **"Draft open"** (`src/pages/DraftPage.tsx:165`), the subtitle says "Build your
squad — $150.0M to spend · 0/10 picked" (`:170`), the deadline countdown renders nothing because the
target has passed (`src/components/Countdown.tsx:14`), and every "+ Buy" button is live because
`addable` (`DraftPage.tsx:377`) never consults `draftClosed`.

They can pick all ten, spend all $150M, satisfy 2/3/5, set a captain — and only then, at the bottom
of the squad panel, find a small grey chip reading "Draft closed — the tournament has started"
(`DraftPage.tsx:669`). There is no Lock button. The squad is worth zero, permanently.

**This is 88f692fa's failure, engineered in as the guaranteed outcome for every new sign-up during
the ~9 days an event is live — which is exactly when the app is most likely to be shared.** Every
screen in the funnel is a promise the next screen breaks, and the correction is delivered in the
smallest, greyest text on the page, after the work is done.

*Same fault, other surfaces: → 2.1 (the Market), → 8.3 (why it happens).*

**Direction:** compute one draft-open truth and let it change the funnel, not one chip. If the draft
is closed, `AuthScreen` should say "Cincinnati is underway — sign up to follow it live and be first
in for the US Open"; the join gate should not promise a draft; `FirstRunTour` must not end on
`setTab('draft')`; and the Market must refuse the *first* "+ Buy" with a full-width explanation.
Better still: let a mid-event sign-up draft a shadow squad explicitly banked for the next event, so
the effort has somewhere to go.

### 1.2 — BLOCKER · The invite code is destroyed by email verification

A `?join=CODE` link stashes the code in **sessionStorage** (`src/App.tsx:87`) and immediately strips
it from the URL (`:88-89`), so it can never be re-read. The code is only applied once `user && joined`
(`:96-97`). But sign-up requires email confirmation (`src/auth/AuthProvider.tsx:51`), and the
confirmation link opens in the mail app's browser or a new tab. **sessionStorage is per-tab: the new
context has no code.** `signUp` also passes no `emailRedirectTo` (`AuthProvider.tsx:48`), so the
confirm link lands on the Supabase Site URL with no `?join` to recover from.

The user arrives signed in, sees no error, and is simply not in their friend's league — after being
shown "A friend invited you to their league — create an account to join them" (`AuthScreen.tsx:98`).

**Sharing a league link is how this game spreads. Every invited friend who signs up fresh — the
entire acquisition path — silently lands outside the league they were invited to.** They show up on
the Public League instead and quietly conclude the app is broken. The inviter has no way to see what
went wrong.

**Direction:** move the pending code to localStorage (survives tabs on the same device) **and** pass
it through Supabase: `signUp(email, password, { emailRedirectTo: origin + '?join=' + code })`. Do not
strip the URL param until a `joinLeague` has actually succeeded. As a backstop, offer "Have an invite
code?" in the app so a lost code can be typed by hand.

### 1.3 — MAJOR · A stranger can see nothing without handing over an email and a password

`if (!user) return <AuthScreen />` — `src/App.tsx:139`. One line, and the entire product is behind
it. No bracket, no leaderboard, no player market, no sight of the league you were invited to.

Requiring an account to *play* is defensible. Requiring one to *look* is not — none of the bracket,
the standings or the player list needs to know who you are. The mismatch is sharpest exactly where
the app grows: a friend taps a WhatsApp link at the highest-intent moment in the funnel and gets a
password field. And the one thing a mid-event visitor could genuinely enjoy — watching their friends'
league play out live — is the thing that is locked, while the thing they cannot do (draft) is the
thing being advertised.

**Direction:** keep the account requirement for drafting and leagues; drop it for reading. Render
Bracket and League read-only for signed-out visitors with an inline "Sign up to enter a squad" on
every action. For an *invited* visitor, show the actual league — its name, its managers, the
standings — before asking for the email. That converts on evidence rather than faith.

### 1.4 — MAJOR · The rules are hidden in session one, then ambushed on session two

`showRules` starts true for a fresh browser (`App.tsx:57`), but the rules modal only mounts inside
`AppShell` (`:315`), which is not rendered during the join gate. `onJoined` then explicitly calls
`setShowRules(false)` (`:177`). The comment above it (`:171-176`) says `markSeen()` is deliberately
not called so the rules "surface on their next visit".

Net effect: **session one** — join, confetti, four-step tour, straight into the Market, zero rules.
**Session two** — `HowToPlay` opens unrequested over whatever they came back to do. `signOut` also
deletes `gsgm-seen-rules` (`AuthProvider.tsx:74`), so it repeats after every sign-out.

The one session in which a manager makes every decision that determines their score is the session in
which the rules are suppressed. That is exactly inverted, and it is written down as intentional. The
rev counts in the evidence (23, 10, 7 saves on unfinished squads) are people hunting for information
the product had and chose not to show them.

**Direction:** show the rules once, in-flow, between the join gate and the Market — as a step of the
welcome, not a dismissible modal. Mark them seen there, and never auto-open again. If a modal feels
too heavy, put the three rules that actually cost points (the 2/3/5 quota, captain ×2, you must
submit) on the Market itself, where the decisions happen.

### 1.5 — MAJOR · The rules never mention that you must submit your squad

`HowToPlay`'s RULES array (`HowToPlay.tsx:20-31`) covers drafting, points, captains, upsets, refunds,
transfers, the transfer deadline, private leagues and the leaderboard. **Nothing says that a squad
which is not locked scores nothing.** The nearest thing is "Transfers close before the final"
(`:28`), which is about a different lock entirely and actively muddies the concept.

This is the only rules surface in the product and the only one a pre-signup visitor can read, and it
does not contain the rule that decided 88f692fa's tournament. Someone could read it cover to cover
and fail the same way.

**Direction:** add the rule, worded as consequence not procedure — *"Your squad only counts once you
submit it. Build it, then hit Enter Squad before the first ball — a saved-but-unsubmitted squad
scores nothing."* And rename the button (→ 3.1).

### 1.6 — MAJOR · Platinum / Gold / Silver is the central puzzle and is never defined

The first rule says "exactly 2 Platinum, 3 Gold and 5 Silver" (`HowToPlay.tsx:21`) and never says
what makes a player Platinum. The tiers come from ATP ranking (`src/data/tiers.ts:5-9` — top 10 /
11–25 / 26+), but no pre-signup screen says so, gives a rank band, or gives a price range.
`AuthScreen`'s chips (`:87`) do not mention tiers at all, so the quota — the single hardest constraint
in the game — first appears as three undefined proper nouns.

This is the rule that trapped `32828145` and has `51face7f` $4M from the same wall. A manager who does
not know that Platinum means "top-ranked and therefore expensive" cannot reason about whether their
remaining budget can finish the squad.

*Same fault, other surfaces: → 2.4 (the draft screen), → 8.6 (five vocabularies for one rule).*

### 1.7 — MAJOR · "Let's play →" on the signed-out rules modal returns you to the login form

A cold visitor taps "How does it work?" (`AuthScreen.tsx:91`), scrolls ~1.4 phone screens of dense
rules, reaches a big blue "Let's play →" (`HowToPlay.tsx:93`), taps it — and gets `onClose()`, i.e.
the same login screen, still in "Log in" mode rather than "Sign up".

That is the highest-intent tap in the whole funnel and the product answers with nothing.

**Direction:** pass a CTA into `HowToPlay`. Signed-out: "Create your account →", which closes the
modal, sets mode to register and focuses the email field. Signed-in: keep "Let's play →".

### 1.8 — MAJOR · "Look around first" does not let you look around

`TournamentWelcome` offers two buttons. "Build my squad →" sets the tab to Market; "Look around
first" (`TournamentWelcome.tsx:70`) just dismisses. Either way `welcome` flips false, which un-pauses
`FirstRunTour` (`FirstRunTour.tsx:36`). The tour immediately drops a full-screen click blocker
(`fixed inset-0 z-[60]`, `:69`) and runs four spotlight steps, ending on `setTab('draft')` (`:62`).

So "Look around first" produces: no looking, four modal steps, and a landing on the Market. Only
"Skip" honours the choice. "Build my squad →" is no better — you are taken to the Market and then
blocked from touching it for four taps. Two buttons that promise different things and deliver the
same thing is a trust problem at the moment a new manager is deciding whether this app respects them.

The tour also spends its four steps explaining tabs — information the nav already conveys — instead
of the two things that cost points.

**Direction:** run the tour only off an explicit "Show me around". Make "Build my squad →" go
straight to the Market with the tour suppressed, and "Look around first" leave the user on Home,
where `NextMove` is already a better coach than the tour. If the tour survives, cut it to two steps:
the quota, and the submit.

### 1.9 — MAJOR · A cloud hiccup silently skips identity setup and puts "My Team" on the leaderboard

`showJoinGate` requires `!entryLoadFailed` (`App.tsx:150`). If the entry fetch throws or hits the 8s
bail (`CloudSync.tsx:148-153, :196-200`), a brand-new account **skips the join gate entirely** and
lands in the app with `teamName: 'My Team'`, no emblem, no country, no handle
(`src/store/profileStore.ts:32`). `joinedTournaments` never gets the id, so the welcome never fires
either — but once they pick a player, `hasProgress` marks them joined (`App.tsx:73-76`) and the gate
is gone for good.

The suppression is correct in intent; the consequence for a genuinely new account is not. On a flaky
mobile network — the normal case — a new manager is dropped into the game with no team name and no
path back, and appears on their friends' leaderboard as "My Team".

**Direction:** separate the two states. "Load failed" should suppress only the destructive
`resetGame()` in `JoinTournament.join` (`JoinTournament.tsx:48`), not the identity form. Or detect a
genuinely new account (no cloud profile row, not just no entry) and always run the gate for it.
Either way, surface a retry rather than degrading silently.

### 1.10 — MAJOR · "Forgot your password" signs you in without ever setting a password

`resetPassword` sends a recovery link to `window.location.origin` (`AuthProvider.tsx:89`). The comment
at `:87-88` says the user "can set a new password (change-password UI)", but **nothing in App.tsx
listens for the `PASSWORD_RECOVERY` event and there is no set-password screen in the auth flow**.
`updatePassword` exists but is only wired into `UserProfile` (`src/components/UserProfile.tsx:44`),
behind the profile icon inside the app.

So clicking the recovery link drops the user into the game, signed in, with their old (forgotten)
password still the only one that works. Next device, locked out again, same loop. The old password
also remains valid, which is the wrong security outcome for a recovery link.

**Direction:** listen for `PASSWORD_RECOVERY` in `AuthProvider` and render a "Set a new password"
screen in `AuthScreen` — it already has a `Mode` union, add `'newPassword'`.

### 1.11 — MAJOR · Invite links have no preview

`index.html:3-8` contains a charset, a favicon, a viewport and `<title>Grand Slam GM</title>`. No
`meta description`, no `og:title` / `og:description` / `og:image`, no `theme-color`, no web app
manifest, no apple-touch-icon.

Every new manager arrives via a `?join=CODE` link pasted into WhatsApp or iMessage. Those clients
render a card from og tags; with none, the friend sees a naked URL. The first impression of a
phone-first fantasy game is a grey rectangle, and the decision to tap is made before any of the good
copy in `AuthScreen` ever loads. **This journey starts one screen earlier than the codebase
acknowledges.**

### 1.12 — MINOR · No routing: the Android back button exits the site

There is no router. The only history interaction is a `replaceState` to strip `?join`
(`App.tsx:88-89`). Tabs live in Zustand (`:305-311`) and modals close on Escape or a backdrop tap
only (`src/hooks.ts:61`). On a phone, a back swipe from the rules modal, the tour, or any tab leaves
the site entirely. Nothing is linkable — no `/rules` to share, no way to send someone to the bracket.

*Also surfaces at → 7.6 (the Team page's only exit).*

### 1.13 — MINOR · The top of the funnel is unmeasured

`track('tab_view')` is gated on `if (user)` (`App.tsx:123`), so nothing fires for a signed-out visit.
There is no landing-view event, and the signed-out "How does it work?" (`AuthScreen.tsx:91`) calls
`setShowHowTo(true)` with no `track()` — unlike the in-app "?" which does fire `howtoplay_opened`
(`App.tsx:275`).

Your live question is "why don't they understand it?", and there is no denominator. "How many bounced
off the login wall" and "does anyone read the rules before signing up" are both unanswerable.

**Direction:** fire `landing_view` (with `invited: hasPendingInvite()`), `auth_mode_switched`, and
`howtoplay_opened { context: 'signed_out' }`. Add `draft_started`, `player_added` and
`captain_set { manual: true|false }` while you are there — the evidence doc already flags those as
missing.

### 1.14 — MINOR · The join gate is a room with one door and no help

`JoinTournament` renders full-screen with exactly one action (`JoinTournament.tsx:56-122`). The header
carrying the "?" rules button and the profile icon lives in `AppShell` (`App.tsx:272-297`), which is
not rendered during the gate. No back, no sign-out, no route to the rules, and no line saying the
team name and handle will be public on a leaderboard.

---

## Journey 2 — The draft: building a legal squad

**23 taps minimum from Home to a locked squad, realistically ~26.** Twenty of those are the picks
themselves (every add is "+ Add" then "Confirm buy"). The last tap is invisible: on `?ux=complete` at
375×812 the lock control's top edge measures **980px down a 2892px page**, `position: static`, in an
812px viewport.

### What works

- **The tier filter chips (`DraftPage.tsx:294-327`) are the best interaction in the app.** One
  control that is simultaneously a filter, a progress meter and a prompt — the tier you still need
  pulses. Filter and status fused into one object is exactly right for a quota game on a phone. It
  needs money added and the clipping fixed; it does not need replacing.
- **Eliminated players are removed from the market entirely, not greyed** (`DraftPage.tsx:140-146`,
  `PlayerPickerModal.tsx:25-34`). At Cincinnati, 32 of 96 entrants were gone before the draft closed,
  concentrated in the Silver band the quota pushes you toward. The comments record why this was
  learned the hard way. Keep the behaviour *and* the comments.
- **`squadRules.ts` is the single home for the rules**, and `entryValidation.ts:1-13` explicitly
  mirrors the server RPC with "KEEP THE SQL IDENTICAL TO THIS". Right architecture: the rules have one
  owner and the server enforces the same ones. Every quota finding below is about how the rules are
  *communicated*, not where they live.
- **`MAX_TRANSFERS = 3` carries its evidence** (`squadRules.ts:13-21` — 20k-tournament simulation
  results, including the numbers that rule out both alternatives). Design decisions with their working
  attached are rare. Keep doing this.
- **Mobile density is a considered trade-off, not a dropped column** (`DraftPage.tsx:419-425`): below
  `md`, the three surface win% columns collapse into a compact "G 80 · H 20 · C 71" line with the
  active surface bolded. The phone user loses nothing.
- **`order-first` on the My Squad sidebar** (`DraftPage.tsx:497`) puts your squad above the 96-row
  table on a phone and beside it on desktop, from one layout. Right call.
- **The store is genuinely defensive.** `addPlayer` (`gameStore.ts:199-215`) cannot produce an
  over-quota, over-budget, duplicate or already-eliminated squad. The rules never leak. The failure is
  that they are only ever expressed as refusal.

### 2.1 — BLOCKER · The draft stays fully interactive after it closes

`draftClosed = tournamentStarted()` is computed at `DraftPage.tsx:57` and used in **exactly one
place** — the button at `:667-670`. Everything else keys off `phase === 'draft'` alone.
`tournamentStarted()` (`src/data/tournament.ts:105-107`) flips the instant the first result lands, and
results poll every 5 minutes, so **this transition happens silently mid-session** with no toast, no
modal, no header change.

Reproduced live at 375px on the Cincinnati staging build: the header read "DRAFT OPEN · Build your
squad — $150.0M to spend", I added Cobolli and Fritz through the normal + Add → Confirm flow, the
budget went $150M → $132M → $109M, the chip ticked to "Platinum 2/2 ✓" — and 900px below, "Draft
closed — the tournament has started."

`addPlayer` guards phase, size, duplicates, budget, eliminated players and tier quota, but **not**
`tournamentStarted()` — even though `finalizeDraft` (`gameStore.ts:296`) does. `SquadCourt`'s
`canEdit` (`SquadCourt.tsx:49`) has the same hole, so Home shows ten "+ Add" bench slots and "PICK
CAPTAIN" after the draft is dead.

**This is a second, un-eliminated explanation for 88f692fa, and the evidence cannot distinguish it
from the one in the doc.** A complete legal 2/3/5 squad, all $150M spent, a captain, 23 saves, zero
points — that is precisely what this bug manufactures. "They never pressed Lock Squad" assumes the
button was pressable.

**Direction:** make `draftClosed` a first-class state, not a footer. Gate `addPlayer` in the store on
`tournamentStarted()` so the invalid path cannot be walked; have the header, the add buttons, the
picker and the court all read the same flag; when it flips mid-session, say so out loud. **Then run
one query against production: how many of the four zero-scorers have a last-save timestamp after the
first Cincinnati result?** That single query separates "didn't press the button" from "couldn't".

### 2.2 — BLOCKER · There is no affordability floor for humans — while the AI rivals have one

`src/data/rivals.ts:61-75` contains `cheapestCompletion(owned, slots, needLeft)` — the exact forward
projection this journey needs — and `buildSquad` (`:80-92`) refuses any pick where
`spent + p.price + completion > BUDGET`. **The bots literally cannot draft themselves into a dead
end.** The human path checks one thing: `budget >= player.price` (`DraftPage.tsx:374`,
`gameStore.ts:206`).

On `?ux=stuck` at 375px the screen reads "$7.0M to spend · 7/10 picked", chips "Platinum 1/2
(pulsing), Gold 3/3 ✓, Silver 3/5", every Platinum row says "Over $" — and the $5M and $6M Silvers
still say "+ Add", so the app will help them dig deeper. The Lock button in that state reads "Need 1
Platinum, 2 Silver" (`DraftPage.tsx:680`): an instruction for something arithmetically impossible.

`32828145` is $19M inside this trap; `51face7f` is $4M from it. The pulsing Platinum chip actively
invites the stuck manager into a list where every button is dead, and the only escape — removing a
player you already chose — is never mentioned anywhere.

**The algorithm is already in the repo, written and commented, applied to the computer opponents and
withheld from the customers.**

**Credit where due:** `src/components/SquadProgress.tsx` has since landed and is the correct response
— it projects forward, names the dead end, quantifies the shortfall in dollars and names the player to
sell. Two things still need doing (→ 2.3).

**Direction:** lift `cheapestCompletion` out of `rivals.ts` into `squadRules.ts` / `squadPlan.ts` and
use it in three places: (1) a persistent line next to the budget — "$7M left · you still need 1
Platinum + 2 Silver, minimum $26M · **$19M short**"; (2) disable or hard-warn any "+ Add" that would
push you below the floor, the same guard the bots get; (3) when the floor is already breached, stop
saying "Need 1 Platinum, 2 Silver" and start naming the exit — "Remove Jodar ($24M) to get back in
range".

### 2.3 — BLOCKER · The button that decides everything sits 980px down and is sticky only on desktop

Measured on `?ux=complete` at 375×812: CTA top edge 980px, computed position `static`, page height
2892px. The My Squad card is `order-first` so it precedes the table on mobile, but the Lock button is
at the *bottom* of that card, after ten squad rows — so on a phone it is below the fold at every squad
size and never pinned (`DraftPage.tsx:498` is `lg:sticky lg:top-20`, desktop only). A second
measurement on a live 10-player squad put its top edge at **y=804 in an 812px viewport, under a 64px
sticky header.**

Home's checklist offers "Lock your squad" (`NextMove.tsx:150`) whose handler is
`() => setTab('draft')` — it changes tab and stops at the top of the page. **One line above it**, the
captain step is handed `onPickLeaders`, which `HomePage.tsx:112` implements as
`courtRef.current?.scrollIntoView({behavior:'smooth'})`. The scroll-to pattern exists in this codebase
and was applied to the less important step.

This is the finish line of the app's only mandatory funnel, on the only platform it is played on, and
it is the one element with no sticky treatment.

**Also true of `SquadProgress`:** it renders only on the Market (`DraftPage.tsx:195`). On Home the same
stuck manager sees "SQUAD 7/10 · 3 to pick", "BUDGET $29.0M to spend", three "+ Add" slots on the
court, and "draft in the Market". **Home is the landing screen and the one every tab-switch returns
to.** Separately, `SquadProgress.tsx:23` reads the persisted store `budget` while `HomePage.tsx:38`,
`DraftPage.tsx:73` and `leagueBoard.ts:81` all use the derived `liveBudget()` — two sources of truth
for the number its entire argument rests on. Your own project memory records that stale ranks/prices
silently corrupt derived values between events; the moment those two disagree, this panel will state a
precise, confident, wrong dollar figure.

**Direction:** give the draft a **sticky bottom action bar on mobile** carrying the live state —
"10/10 · 2/3/5 ✓ · $0M left → **Enter my squad**" or "7/10 · need 1 Platinum + 2 Silver · $19M short".
It becomes the permanent answer to "where am I and what's stopping me", and it collapses the 980px
scroll to zero. Make `NextMove`'s lock step scroll to it, exactly as the captain step already scrolls
to the court. Render `SquadProgress` on Home too, and feed it `liveBudget(...)` like everything else.

### 2.4 — MAJOR · The rule printed under the Lock button says "at least"; the app enforces "exactly"

`DraftPage.tsx:685`: *"A valid squad is 10 players with **at least** 2 Platinum & 3 Gold & 5 Silver."*
Because 2+3+5 = 10, `TIER_LIMITS` makes every minimum a hard maximum (`squadRules.ts:28-30`) and the
market blocks a third Platinum with "Platinum full". `HowToPlay.tsx:21` states it correctly —
"exactly" — but that modal is opened once, if ever. **The draft screen, where the decision is made,
says the opposite.**

"At least 2 Platinum" tells the manager to buy the best two Platinum they can afford and spend the
rest freely. That is the precise mental model that produced `51face7f`: two Platinum for $81M, $69M
left, $65M floor, four dollars from unwinnable. **The copy under the button is teaching the losing
strategy.** It also makes the tier chips ambiguous — is "Platinum 2/2" a target reached or a cap hit?

**Direction:** "Exactly 2 Platinum, 3 Gold and 5 Silver — 10 players, no substitutions", rendered
*above* the button rather than beneath it, derived from `TIER_MINIMUMS` so it cannot drift.

### 2.5 — MAJOR · The tiers are never defined on the screen where they are used

`getTier` is a pure ranking cut — top 10 Platinum, 11–25 Gold, 26+ Silver (`tiers.ts:5-9`). The draft
page shows the word "Platinum" next to a coloured rank number and never says what earns it. **The one
place the app spells it out is a Home checklist sub-label** — "2 from the top 10 · 3 ranked 11–25 · 5
ranked 26+" (`NextMove.tsx:148`) — which disappears the moment the squad is valid, i.e. it is only
visible to people who no longer need it.

Filter to Silver and you get 74 players ranked 26 to 300, priced $4M to $14M, with nothing explaining
why Fonseca and J.J. Wolf are the same class of thing. That ambiguity is what makes the quota feel
arbitrary and enforcement feel like the app breaking rather than the game having rules.

**Direction:** put the definition where the decision is. The tier chips should read "Platinum · top 10
· 0/2", or reveal it on tap alongside the count and the cheapest remaining price. Generate the strings
from `tiers.ts` so they cannot drift.

### 2.6 — MAJOR · The tier progress strip is clipped off-screen at 375px, with the scrollbar hidden

Measured on the running build: the strip's `scrollWidth` is 390px against a `clientWidth` of 351px —
**39px of overflow** (`DraftPage.tsx:298`, `flex items-center gap-2 mb-3 overflow-x-auto no-scrollbar`).
The chips are Filter / All / Platinum 0/2 / Gold 0/3 / Silver 0/5, so **the one that gets cut is
Silver — the tier you need five of.** `no-scrollbar` then removes the only cue that anything is
off-screen.

A manager can genuinely not know Silver is a category. It also means the pulse-to-signal-a-needed-tier
behaviour — the good idea in this component — fires off-screen for the tier with the most slots.

**Direction:** make the three tier chips a fixed 3-up grid on mobile (they are a fixed set of three;
horizontal scroll buys nothing) and move Filter/All elsewhere. If the strip must scroll, keep a
fade-out edge.

### 2.7 — MAJOR · Two tier displays on the same screen disagree about over-quota

Both render `tierCounts(myTeam)`, 200 lines apart, with different state machines. The filter chips
(`DraftPage.tsx:305-326`) only know "need" (`have < min`) and "met" (`have === min`); an over-quota
tier falls into neither and renders as a plain white chip. The My Squad boxes (`:525-538`) have a
third `over` state with red styling and a `!`.

On `?ux=complete` both are on screen at once: the chip says "Silver 8/5" looking perfectly fine, and
the box directly beneath says "SILVER 8/5 !" in red. **Same fact, same page, two renderings, one of
which hides an error.**

**Direction:** one `tierStatus(tier, counts)` helper in `squadRules.ts` returning a single state
(`under` | `met` | `over`) plus the shortfall and its cheapest cost, consumed by both.

### 2.8 — MAJOR · The most prominent add button opens the least capable picker

`PlayerPickerModal` offers a search box and nothing else: rank sort hardcoded (`:31-34`), no tier
filter, no price sort, no surface win%, no form, no tier progress. Its header shows "$109.0M left ·
3/10 picked" — money and count, never which tiers remain (`:47`). **It is what every "+ Add a player"
row and every court "+" slot opens** (`DraftPage.tsx:567`, `SquadCourt.tsx:179, :266-277`), which on a
phone is the first add surface most people meet, because the court is on Home.

The Market table 300 lines away has three-way sort, tier filter chips, surface win%, YTD W-L, titles
and video links **for the identical decision.** Verified live: the picker lists all 88 players
rank-ascending, so the 74 Silvers you need five of are below a long scroll.

Tools are absent at the moment of need, and the manager cannot tell they are missing, because nothing
in the modal suggests a better view exists. Two surfaces for one decision, showing different facts, is
also how the app grew a bug it has already fixed once: the comment at `PlayerPickerModal.tsx:25-30`
records the last time this modal drifted from the table and started offering eliminated players. It is
still half-repaired — `PlayerPickerModal.tsx:32` calls `isUnpickable(p.id)` while `DraftPage.tsx:144`
calls `isUnpickable(p.id, revealed)`; in replay mode the picker would treat nobody as out.

**Direction:** delete the second picker. Make the "+" slots and the court's add flow deep-link into
the Market table with the needed tier pre-filtered — one list, one set of tools, one place to add the
affordability floor.

### 2.9 — MAJOR · Every "you can't" reason lives in a `title` attribute, and at 10/10 they all say "Full"

The specific explanations — "Squad already full (10/10)", "You already have your Platinum players",
"Costs $50M — over your remaining budget" — are all in `title` (`DraftPage.tsx:446`), which **does not
exist on touch**. The visible labels are "Full" / "Platinum full" / "Over $" (`:455`).

Worse, the ternary at `:455` tests `full` before `tierFull`, so **once the squad hits 10 players every
row in the market reads "Full"** — including the Golds a 2/0/8 squad desperately needs. Verified on
`?ux=complete`. Nothing anywhere says "remove a Silver to make room".

The same states get different words in the other picker ("Full" / "Limit" / "Too $",
`PlayerPickerModal.tsx:95`), and when a purchase is refused `PurchaseConfirmModal.tsx:49` gives up
entirely: *"Couldn't add X — over budget, squad full, or tier limit reached."* **The app knows which
one and declines to say.**

**Direction:** move the reason into the visible label or a tap-to-reveal line, use one vocabulary
across both pickers, and reorder so tier-full beats squad-full. Have `addPlayer` return a typed reason
so the modal names the actual one.

### 2.10 — MAJOR · The dev fixture used to study this journey builds an illegal squad

`src/dev/uxHarness.ts:28` reimplements the tier cut with Gold running to rank 30 instead of 25
(`tiers.ts:5-9`). So `?ux=complete` — documented at `uxHarness.ts:22` as "the 88f692fa case: a legal
2/3/5 squad, all money spent, NOT locked" — actually renders **2 Platinum / 0 Gold / 8 Silver**.
Confirmed on the running build: chips read "Platinum 2/2 ✓ · Gold 0/3 · Silver 8/5". Same for `stuck`
and `locked`. This is the third implementation of the tier boundary in the repo, after `tiers.ts` and
the hardcoded copy at `NextMove.tsx:148`.

**The one tool built specifically to look at these screens shows the wrong screen.** A redesign
validated against `?ux=complete` is validated against fiction — and against a state the real UI cannot
even produce, since `addPlayer` caps tiers.

**Direction:** import `getTier` in the harness (one line) and assert each fixture against
`isSquadValid` at boot, failing loudly if a fixture is illegal.

### 2.11 — MINOR · Ten mandatory confirm taps to display one number that belongs in the row

Every pick routes through a modal whose entire informational content is "Price · budget after — $18M ·
$132.0M" (`PurchaseConfirmModal.tsx:64-67`). Price is already in the row; the panel already shows the
current budget. Across a full draft that is 10 extra taps — roughly as many as everything else
combined.

Note the one thing it does do: "budget after" is the **only forward-looking number anywhere in the
draft.** That is an argument for putting it in the row, not for keeping the modal.

**Direction:** drop the confirm for adds (removal is one free tap, so a mis-tap costs nothing) and
surface "→ $132M left" inline on the "+ Add" button. Spend the reclaimed attention on what the pick
does to the affordability floor.

### 2.12 — MINOR · Squad rows give a 96px name column three 36px buttons at 375px

Measured: the name column in a My Squad row is 96px wide, carrying an avatar plus three 36×36 controls
— C, V and ✕ — inside a card with 20px padding (`DraftPage.tsx:553-562`). "Rafael Jodar" truncates.
The ✕ has no confirmation and no undo, and removing a captain silently reassigns the armband via
`pickLeaders` (`gameStore.ts:23-35, :230`).

Removal is the only escape from the affordability trap, so the ✕ matters more than its treatment
suggests — and it sits 8px from the vice-captain button on a truncated row.

**Direction:** collapse C/V/✕ into a tap-the-row action sheet. `SquadCourt` already has exactly this
(`SquadCourt.tsx:302-368`). Reuse it, reclaim the width for the name, and when the manager is over the
affordability floor, annotate each row with what removing it frees.

### 2.13 — MINOR · The deadline banner deletes itself the moment the deadline becomes terminal

"Draft closes when the first round starts — Lock your squad before then" renders only while the
countdown is positive (`Countdown.tsx:13, :45`; rendered at `DraftPage.tsx:192-197`). Once the
scheduled start passes, the whole banner disappears rather than becoming a tombstone. **The screen
after the deadline is strictly emptier of warnings than the screen before it** — while the header
still says "DRAFT OPEN".

*Same fault → 3.6, where the fix already exists fifteen lines away.*

### 2.14 — MINOR · "Check tiers" is the entire diagnosis Home offers, and it names no tier

`HomePage.tsx:96-98`: `squadReady ? 'Ready ✓' : myTeam.length < 10 ? 'N to pick' : 'Check tiers'`. A
10-player squad with an illegal mix gets "Check tiers" — no tier named, no shortfall, and the card is
not tappable.

At the moment the manager most needs a diagnosis, the app produces two words of jargon and no route.

**Direction:** say the shortfall and its price — "needs 3 Gold, min $44M" — and make the card navigate
to the Market with that tier filtered.

### 2.15 — MINOR · Two budget sources of truth, currently agreeing by coincidence

The store's `budget` is mutated incrementally on add/remove (`gameStore.ts:214, :227`) and recomputed
in the persist migration (`:117-119`). `liveBudget()` recomputes from the roster
(`tournament.ts:441-459`). `DraftPage` uses the store's value during the draft; `HomePage.tsx:38-39`
and `SquadCourt.tsx:28` use `liveBudget` unconditionally, in draft phase too. They agree today only
because `liveBudget` falls back to `currentSquad` when `initialSquad` is empty (`tournament.ts:445`)
and because removed players never enter its `acquired` set.

Adding the affordability floor means touching this arithmetic. Unify first: make `liveBudget` the only
budget function and derive the store's `budget` from it, or drop the stored field entirely.

---

## Journey 3 — The finish line: captain, save, lock

This journey works mechanically and reads beautifully. It fails at exactly one point, and the failure
is not a missing feature: **four separate pieces of the UI tell the manager they are finished, and
none of them is the one that matters.**

Here is what `88f692fa` saw on Home with their perfect, unlocked squad:

- `SQUAD 10/10 — Ready ✓` in green (`HomePage.tsx:97-99`)
- a court fielding two players badged **CAPTAIN ×2** and **VICE ×1.5**, gold-glowing (`SquadCourt.tsx:214`)
- a green pill reading **✓ Saved** (`SaveButton.tsx:8`)
- a leaderboard of dashes under "Tournament hasn't started — scores go live the moment play begins."

Every one of those is true. Every one is also irrelevant, because scoring reads `initialSquad`, and
`initialSquad` is written by exactly one line — `finalizeDraft` (`gameStore.ts:316`).
`src/scoring/serverEngine.ts:70-72` states it plainly in a comment: *"A never-locked entry has no
initialSquad → it scores 0."*

**Taps to goal: 3 taps and one scroll.** The count was never the problem. 88f692fa made 23 saves —
they were on these screens over and over. The distance to the goal is three taps; the distance to
*understanding the goal exists* is infinite.

### What works

- **The disabled Lock button names its own precondition** (`DraftPage.tsx:678-681`): "Pick 3 more",
  "Need 2 Silver", rather than a grey "Lock Squad". Rare and correct. Keep the shape; it just needs the
  affordability term (→ 3.9).
- **The empty captain slot is a genuinely good affordance.** A dashed gold circle labelled "Pick
  Captain" (`SquadCourt.tsx:176-193`) opens a sheet offering both "promote a player you own" *and* "🛒
  Sign a new player as Captain — no need to fill your squad first" (`:433-448`). Letting someone name
  a captain before the squad is complete is a real insight about how people draft.
- **The captain-of-record model is right and mirrors the server.** `recordLeaders` refuses to stamp a
  started round (`gameStore.ts:59`), `leaderOfRecord` carries the most recent earlier pick forward
  (`tournament.ts:204-212`), and `validateCaptainLock` enforces the same on the server
  (`entryValidation.ts:82-96`).
- **The countdown shows the absolute local datetime beside the relative one** (`Countdown.tsx:56-58`),
  so "2d 6h" is checkable rather than a claim. It turns red under an hour.
- **The captain actions carry their multipliers on the control**: "👑 Make Captain ×2", "🥈 Make
  Vice-Captain ×1.5", "⬇️ Send Fritz to the bench" (`SquadCourt.tsx:309, 316, 323`). No jargon.
- **`NextMove`'s step order was fixed on purpose** — drafting before the league invite, with the
  reasoning in the comment (`NextMove.tsx:143-146`). With a complete squad the big blue button on Home
  literally reads "Lock your squad →". The routing is right; only the copy fails.
- **Save is automatic, debounced, rate-capped and circuit-broken** (`CloudSync.tsx:88-96, 211-232`),
  with the manual button as a confidence affordance rather than the mechanism. Correct architecture,
  and the incident comments show it was earned. **Do not make saving manual to fix the lock problem.**
- **Choosing a persisted dirty-flag over cross-device timestamp comparison** (`CloudSync.tsx:28-42`) is
  right, and the reasoning in that comment is exactly correct — clock skew across a phone and a laptop
  is not solvable with `updated_at`.

### 3.1 — BLOCKER · Locking is how you enter the tournament, and the product never says so

No screen, no toast, no help card and no tour step states the consequence of not locking. The ten-card
**How to play** mentions "lock" exactly once — about transfers closing before the final
(`HowToPlay.tsx:19-30`) — which teaches the *opposite* meaning. `FirstRunTour.tsx:15-20` never
mentions it.

The label names a **cost** ("Lock") and the product never once names the **benefit** ("this is how you
enter"). A rational manager with three days left defers a scary irreversible action, and the app never
escalates: **the copy at T-3 days is identical to the copy at T-5 minutes.**

On the word itself: in the client it genuinely is irreversible — there is no unlock anywhere, and
after `finalizeDraft` both `addPlayer` and `removePlayer` hard-return on `phase !== 'draft'`
(`gameStore.ts:202, 220`). The *server* is more forgiving: `validateSquadLegality` would happily accept
a same-tier, same-budget swap on a locked entry (`entryValidation.ts:50-64`), and `validateCaptainLock`
only freezes a round's captain once that round has a result (`:82-96`). **The UI is stricter than the
rules require.**

There is also no confirmation and no consequence copy: `onClick={() => { finalizeDraft();
setShowLocked(true); }}` (`DraftPage.tsx:673`) fires straight into confetti. The one screen that
explains what locking bought you — *"You're live on the Cincinnati Open leaderboard"*
(`SquadLockedModal.tsx:24`) — appears **after** the tap. **The sentence that would have saved
88f692fa is already in the product; it is just on the wrong side of the door.**

**Direction:** stop calling it Lock. It is an entry: **"Enter my squad →" / "Confirm entry — you're
in"**. Put the consequence in the button's own subline *before* the tap: "Until you enter, your squad
scores nothing." Then make the un-entered state visible everywhere the manager currently reads
success — the Squad stat card should say **"Not entered"** in ember, not "Ready ✓"; the court should
carry a persistent "Not entered yet" ribbon; the leaderboard row for an un-entered manager should say
so (→ 6.3).

**If you keep one change from this whole audit, make it the stat card. "Ready ✓" is the single most
confident lie on the screen.**

### 3.2 — BLOCKER · Captain/vice changes made in the first seconds after opening the app are silently discarded

The store subscriber bails with `if (applyingCloud.current || !user || gameHydratedFor.current !==
user.id) return;` (`CloudSync.tsx:318`). So during the entire cloud-hydrate window — two sequential
network round trips (`publicLeagueId()` then `fetchEntry()`), up to the 8s bail at `:148` — a real user
edit sets **no dirty flag** and schedules **no save**. When the hydrate resolves it evaluates
`hasCloud && (localEmpty || !localHasUnsaved)` (`:166-181`); the dirty flag was never set, so the
branch is taken and `useGameStore.setState(restored)` overwrites the edit with the cloud copy.

A returning manager is **not** held behind the "Loading…" gate (`App.tsx:149` — `joined` is already
true from localStorage), so the court is fully interactive throughout this window.

The whole between-rounds loop on a phone is: open app, tap captain, close app. **That is precisely the
window.** The manager watches the armband move, the badge reads "✓ Saved" the entire time (it is the
boot default, `syncStore.ts:17`, asserted before any save has ever happened), and a second or two later
the captain silently flips back.

The `DIRTY_KEY` comment at `CloudSync.tsx:28-35` says this exact symptom — captain/vice reverting — was
already reported and fixed. The fix closed the cross-device timestamp race but left this pre-hydrate
race wide open, because the flag it relies on is only set *after* the guard it sits behind.

**Direction:** set `markLocalDirty()` and `useSync.markDirty()` **before** the hydrate guard — a user
edit is a user edit whether or not the fetch has landed — then queue the save to flush on hydrate, or
have the hydrate merge rather than overwrite. Separately, `syncStore` should start in an `unknown`
state that renders no claim, so the badge cannot assert "Saved" about a write that never happened.

### 3.3 — BLOCKER · "Retry save" does nothing once the circuit breaker trips

`doSave` opens with `if (conflictStreak.current >= MAX_CONFLICTS) { setStatus('error'); return; }`
(`CloudSync.tsx:218`). Once four consecutive rev-conflicts have landed, the manual button — whose label
at that point is "↻ Retry save" and whose whole purpose is to be the escape hatch — calls `saveNow` →
`doSave`, which sets the status it already had and returns. **No network call, no state change, no
feedback of any kind.** The breaker is re-armed only by a genuine store edit (`:319`), which a manager
with a finished squad has no reason to make.

A red button labelled "Retry save" that provably cannot retry is worse than no button. This is a dead
end in the strict sense: the user cannot get out of it through any action the UI suggests.

The error state is overloaded four ways besides: illegal squad (`:245`), no league / signed-out
(`:248`), a genuine network throw (`:283`), and the breaker (`:218`) — all rendering identical pixels.

**Direction:** an explicit user tap is at least as strong a re-arm signal as a store edit — reset
`conflictStreak` in `saveNow` and let the attempt run. Keep the breaker for the automatic path only.
And give the error state a reason line: "Couldn't save — check your connection" vs "Your squad is over
budget" are different problems with different fixes.

### 3.4 — MAJOR · The lock confirmation fires and celebrates even when the lock did not happen

`onClick={() => { finalizeDraft(); setShowLocked(true); }}` (`DraftPage.tsx:673`) — the modal is shown
unconditionally. `finalizeDraft` returns silently on `IS_READ_ONLY`, on `tournamentStarted()`, and on
an empty squad (`gameStore.ts:293-301`). `tournamentStarted()` is evaluated at click time and reads the
live results store, which polls every 5 minutes; **the render that drew the enabled button used a
different evaluation.** Land the tap in that gap and the manager gets confetti, a "SQUAD LOCKED" eyebrow
and *"You're live on the Cincinnati Open leaderboard"* while `phase` is still `'draft'` and
`initialSquad` is still empty.

Even on the happy path the leaderboard claim is made against local state — the actual cloud write is a
debounced `saveEntry` up to 2.5s later (`CloudSync.tsx:323` plus the 1500ms rate cap at `:224`) which
can fail with nothing but a 2.8s toast.

It also fires `track('squad_locked')` on a lock that did not occur, so **the one funnel event you have
is unreliable.**

**Direction:** make `finalizeDraft` return a boolean (or read `phase` after the call) and gate the
modal on it; when it refuses, say why. Only claim the leaderboard once the write has landed — hold the
modal in an "Entering…" state until `saveEntry` resolves, with a real retry if it does not.

### 3.5 — MAJOR · The app picks your captain, then reports it as your completed choice

`pickLeaders` (`gameStore.ts:23-35`) fills any empty leader slot with the best-ranked still-alive squad
member, and `addPlayer` spreads it into state on every pick (`:214`). Verified live: I added Cobolli
then Fritz and the coaching hint at `DraftPage.tsx:629` — gated on `(!captain || !viceCaptain)` —
vanished. It can only ever appear at exactly one player. `NextMove.tsx:141` computes `capDone =
!!captain && !!viceCaptain`, so the checklist item "Pick your Captain & Vice — they score ×2 and ×1.5"
strikes itself through at the second pick.

Two consequences. The manager never learns that captaincy is the biggest scoring lever in the game,
because the app quietly answers the question and marks it done. And the evidence document's strongest
claim — "all eight picked a captain" — is very likely an artifact of this function, not proof of
engagement (see the correction in §1).

**Direction:** keep the auto-fill as a safety net so nobody scores un-captained, but stop counting it
as a choice. Add a `captainChosen` flag set only by an explicit `setCaptain`, drive `NextMove`'s
checkmark off that, keep the hint visible until it is true, and badge the auto-picked leader on court
as "Auto — tap to choose". Then instrument it: `captain_set { manual: true|false }`.

### 3.6 — MAJOR · The draft deadline disappears exactly when it matters most

`Countdown` returns `null` once the target passes (`:45`). The draft branch renders it bare
(`DraftPage.tsx:192-197`), so once the scheduled first-round start has passed the Market shows **no
deadline at all** — while the Lock button is still live and still working, because `draftClosed` keys
off `tournamentStarted()` (a real result), not the schedule. `NextMove`'s draft countdown vanishes the
same way (`:59, :154`).

**Fifteen lines below, the live-market branch handles the identical situation properly**
(`DraftPage.tsx:208-217`): when `deadlineCd` is null it renders an ember "The Round of 64 is about to
start — the market locks any moment" card.

The window between "scheduled start passed" and "first result lands" is often hours at a Masters, and
it is the last chance to enter. During it the manager loses their only urgency signal — the screen goes
quieter, not louder, as the deadline expires.

**Direction:** extract one `<Deadline>` component owning both states (ticking, and passed-but-still-
open) and use it in the draft branch, the live branch and `NextMove`. The draft's expired state should
be the loudest thing on the screen: **"Play has started — your squad is not entered. Enter it now,
before the first result."**

### 3.7 — MAJOR · "Lock Squad" names two unrelated actions, and the in-app help teaches the wrong one

The draft's "Lock Squad →" calls `finalizeDraft` (`DraftPage.tsx:678`): writes `initialSquad`, stamps
the captain of record, flips the phase, cannot be undone. The live market's "Lock Squad →" calls
`finalizeSquad` (`:647`), which sets a boolean that hides the Undo buttons and is cleared again by the
next purchase (`gameStore.ts:407, 437-441`). Same words, same blue, same position in the same sidebar.
`NextMove` uses the identical step label "Lock your squad" for both (`:150`, `:240`).

And the live help card states, **in writing**: *"It locks itself — When the round begins, your signings
lock in automatically. In a hurry to be sure? Tap Lock Squad to finalise early."*
(`TransferHelpModal.tsx:13`).

**You have written the instruction that produces the failure.** A manager who learns during Cincinnati
that Lock Squad is optional and automatic carries that belief to the US Open draft, where it scores
zero. The live button's own caption directly beneath it (`DraftPage.tsx:650`) even says "Your signings
are saved. They lock automatically when the round starts" — so the label says lock and the caption says
already saved.

**Direction:** reserve "lock" for nothing. Draft: **"Enter my squad"**. Live market: **"Confirm
signings"**, or drop the control entirely — it already auto-confirms and the help card says so. Change
both `NextMove` labels. Rewrite `TransferHelpModal` step 5 so it cannot be read as advice about the
draft.

### 3.8 — MAJOR · The save indicator is absent from the only page where the squad is edited

`SaveButton` lives inside `SquadCourt` (`SquadCourt.tsx:165-169`), which mounts only on Home
(`HomePage.tsx:118`) and Team (`TeamPage.tsx:151`). **All ten draft picks, every add/remove, every
cash-in and the lock itself happen on the Market**, which has no save affordance and no sync status. If
a save fails there the only signal is a toast that self-destructs after 2800ms
(`src/store/toastStore.ts:19`).

The manager doing the work never sees whether the work is landing. Combined with 3.2, a Market session
can lose edits with the manager receiving no signal that will still be on screen a moment later. A
status indicator visible only on the pages where nothing changes is decoration.

**On the four `SaveButton` states** (`SaveButton.tsx:8-11`, `syncStore.ts:6`):
- `saved` → green "✓ Saved". Manager reads: *my work is safe, and by extension I am done.* Also the
  boot default (`syncStore.ts:17`) — asserted before any save has been attempted.
- `unsaved` → blue, pulsing, "Save". Manager reads: *tap this or lose my work.* False urgency:
  auto-save fires 1000ms later regardless (`CloudSync.tsx:323`). Typical lifetime ~1s.
- `saving` → "Saving…". Unambiguous. Fine.
- `error` → "↻ Retry save". Means four unrelated things, one of which is a no-op (→ 3.3).

**Direction:** move the sync status into the sticky header (`App.tsx:256-274`) so it is visible on
every tab, or render `SaveButton` in the Market's My Squad header. Persist the failure reason next to
it — 2.8s is shorter than the time it takes a phone user to look up from a player table.

### 3.9 — MAJOR · Home says "captains locked" directly above a court that offers "Make Captain"

With R32 underway, `courtStatus` prints "R32 UNDERWAY — CAPTAINS LOCKED, POINTS ARE LIVE"
(`HomePage.tsx:246-247`) — verified on the running build. Immediately below, `canCaptain` is true
(`SquadCourt.tsx:50`, because `liveLeaderRound()` returns R16, the earliest unstarted round), so tapping
any player offers "👑 Make Captain ×2" (`:302-310`).

Both statements are correct — R32's captain is frozen, R16's is open — but **nothing on screen
distinguishes them.** The court badge says only "Captain ×2" with no round (`:214`). The one explicit
lock notice, "🔒 Captains locked — every round underway" (`:231-236`), renders only when
`!leaderRound`, i.e. when the tournament is effectively over.

Given carry-forward, a change made here silently rewrites every future round's captain — a large
consequence delivered with no statement of scope.

**Direction:** put the round on the control and the badge. Sheet header: "Captain for the R16".
Court badge: "CAPTAIN ×2 · from R16". And fix `courtStatus` to say what is true: "R32 underway · your
R16 captain is still open".

### 3.10 — MINOR · The post-lock modal answers the wrong question at the moment of peak anxiety

The manager has just taken an action labelled "Lock" with no prior explanation. The modal gives one
sentence of confirmation then pivots to a league upsell: "The real fun is beating people you know…",
primary CTA "Create a league & invite friends →", alternative "Maybe later"
(`SquadLockedModal.tsx:27-37`). **Nothing states what is now fixed and what they can still change**
(captain each round, 3 transfers, cash-ins). A tap anywhere on the backdrop dismisses it (`:16`).

The question in their head is "wait — can I still change anything?" Answering it would retire the fear
that stopped 88f692fa, and would cost two lines.

**Direction:** lead with what is still open — *"You're in. Your squad is set — but you can still change
your captain before every round, and replace anyone who's knocked out (3 transfers)."* Put the league
CTA under that. Remove the backdrop dismiss on this one modal.

### 3.11 — MINOR · The disabled lock copy is right in form but false for the stuck manager

For `32828145` — 7 players, $7M left, needing 1 Platinum + 2 Silver at a $26M floor — the button reads
"Pick 3 more" (`DraftPage.tsx:679-680`). An instruction they cannot follow. The shape of the copy is
right and worth keeping; it just needs the affordability term (→ 2.2): *"Need 1 Platinum + 2 Silver —
$26M, you have $7M. Remove a player to continue."*

### 3.12 — MINOR · Same component, contradictory captions on two pages

The caption under the court reads "Tap a player to manage · C = captain ×2 · V = vice ×1.5" on Home
(`HomePage.tsx:123`) and "Tap a + to buy players · tap a player for their profile" on Team
(`TeamPage.tsx:154`). The component's actual behaviour is `isOwnTeam ? setManageId(id) :
openPlayer(id)` (`SquadCourt.tsx:202, 256`) — on your own team, tapping opens the manage sheet, never
the profile. **Team's caption is simply wrong**, and the court is the only place a captain can be set
from Home, so this is load-bearing instruction.

**Direction:** the caption describes the component, so move it inside `SquadCourt`, derived from
`isOwnTeam` / `canCaptain`, and delete both page copies.

### 3.13 — MINOR · Dead and divergent implementations of state this journey depends on

- `src/store/marketDraft.ts` is a complete Zustand store documenting a staged/pending model — "the
  manager's cash-ins and buys before they hit Lock Squad" — that the shipped app does not use.
  `grep -rn marketDraft src/` returns only the file itself. **Its comment describes a third meaning of
  Lock Squad**, sitting in the store directory for the next person to read.
- `DraftPage.tsx:501` is `{live ? myTeam.length : myTeam.length}` — a ternary with identical branches,
  i.e. someone meant to differentiate live from draft and did not.
- The `finalized` flag never reaches the cloud: `gameStore.ts:583` persists it locally, but
  `CloudSync.tsx:55-67` (`gameSnapshot`) and `:308-311` (the change watcher) both omit it — so
  confirming signings on your phone does not schedule a save and does not survive to your laptop.
  `viceCaptainHistory` and `cashedIn` are also missing from the watcher snapshot and only save
  incidentally because a sibling field changes in the same action. That is a latent version of the same
  bug.

---

## Journey 4 — Watching a round score

**0 taps to your total** (Home is the default tab and the Score card is above the fold). **Infinite
taps to knowing whether that total is current** — `lastSync` renders in exactly one place,
`AdminPage.tsx:86`, and Admin is not in the nav (`App.tsx:61`).

### What works

- **The underway/live distinction (`tournament.ts:128-142`) is the single best decision in the
  product.** It separates "the schedule says picks are frozen" from "a recorded result proves play is
  happening", and refuses to claim the second on the strength of the first. The copy honours it
  verbatim: "R16 about to begin — captains locked" vs "R16 underway — captains locked, points are
  live". Most fantasy apps get this wrong. Do not touch it.
- **Scoring per completed match rather than per completed round** (`tournament.ts:235-266`). The number
  moves when your player wins, not two days later. The comment explaining why the old model left
  winners "looking unscored for days" is correct and so is the fix.
- **Deriving every round question from results + schedule** rather than the frozen `currentRoundIndex`
  (`tournament.ts:105-150`). Load-bearing and right — the alternative would be an app that silently
  believed it was pre-tournament for eleven days.
- **`ScoringPendingNote`** (`src/components/ScoringPendingNote.tsx`) — a wall of zeros reads as broken;
  one honest sentence, hidden the instant it stops being true (`HomePage.tsx:154`). Right instinct at
  the right size.
- **`transferWindowOpen()` mirrors the store's own commit guard** (`tournament.ts:69-80`, consumed at
  `NextMove.tsx:228-231`), so the coach card can never offer an action the store will reject. **That
  discipline — UI availability equals what the commit path accepts — is the pattern the rest of the app
  should copy.**
- **The never-regress draw merge** (`liveStore.ts:55-66`): a partial Wikipedia parse can never erase a
  pairing you already know. Careful, correct, and the failure it prevents would be very hard to
  diagnose from a bug report.
- **`courtStatus`'s explicit "Tournament complete — final standings" branch** (`HomePage.tsx:245`)
  catches a dead state that normally ships broken.

### 4.1 — BLOCKER · A dead results feed is indistinguishable from a quiet tournament, silently, forever

`useLiveFeed` catches every fetch/parse failure into local `error` and `busy` state
(`src/data/useLiveFeed.ts:21-36`). `LiveFeed.tsx:7-10` calls `useLiveFeed(true)` and **returns null** —
it discards both. The live store is persisted, so on the next open the last-known draw and results
rehydrate and Home renders a confident, fully populated screen: "R32 underway — captains locked, points
are live", a score, a court, a leaderboard.

If the Wikipedia page title built at `liveData.ts:41` stops resolving (a rename, a redirect, a Masters
titled differently), or the device is offline, or the parse breaks, **that screen is frozen and says
nothing.** `lastSync` is recorded (`liveStore.ts:24`) and rendered only on `AdminPage.tsx:86`, behind a
tab absent from the nav (`App.tsx:61`). No timestamp, no stale indicator, no error, no retry, no manual
refresh. The only way to force a sync is a full page reload.

**This is the pipeline-freeze incident again, on the client, without the watchdog.** You already lost
twelve hours of leaderboard to a mis-pasted cron key and shipped a server-side watchdog for it. The
client has no equivalent, and the client is what renders the manager's own Score card. Worse, the
wording actively asserts freshness while being stale — "points are live" printed over a dead number —
and because the local score feeds the headline stat card, a silently dead feed makes the app look like
it scored them zero.

**Direction:** move `error` and `lastSync` out of the hook's local state into `liveStore` so any screen
can read them. Print freshness where the score is: "Results as of 3m ago", amber past ~15 min, red past
~40 with a tappable "Retry now". Add a visible failure state: "Can't reach the results feed — showing
the last update from 14:32." One line of copy converts an invisible outage into a known condition.

### 4.2 — MAJOR · The results feed does not refresh when you reopen the app — but the leaderboard does

You wrote the correct primitive — `useVisiblePoll` pauses while the tab is hidden, jitters, and fires an
immediate refresh on `visibilitychange` (`src/hooks.ts:11-31`) — and used it for the **secondary** data
(the league board, `leagueBoard.ts:57`). The **primary** data, the results that produce every score in
the app, uses a bare `setInterval(sync, 5min)` with no visibility handling at all
(`useLiveFeed.ts:40-45`). It keeps hitting Wikipedia from a backgrounded tab, and it does not re-sync
when the app comes forward. Mobile browsers throttle or suspend background timers, so on iOS the
interval may not have fired at all while the phone was locked.

Open, glance, close is the dominant phone pattern for this exact journey, and this is the one code path
that does not handle it. The moment freshness matters most is the moment the feed is guaranteed
stalest.

**Direction:** `useVisiblePoll(() => void syncRef.current(), LIVE.pollIntervalMs, TOURNAMENT.mode ===
'live')`. Roughly five lines.

### 4.3 — MAJOR · Two different "your points" totals on the same screen, from two different pipelines

The Score stat card at the top of Home shows the client's own computation from its own poll
(`HomePage.tsx:34-37, :91`). Your row in the leaderboard on the same page shows `myCloud?.score` — the
server-authoritative number from the 20-second board poll (`leagueBoard.ts:96-107`, rendered at
`HomePage.tsx:197`). Two numbers, both labelled as your points, refreshed on different clocks (5 min vs
20s + refresh-on-focus), computed by different code on different machines.

They disagree routinely and **systematically in one direction**: the board refreshes on tab focus and
the results feed does not (→ 4.2), so the moment you reopen your phone the leaderboard has moved and the
stat card has not.

The comment at `leagueBoard.ts:96-100` already knows these diverge and deliberately picks the server
value for the row "so your row matches exactly what everyone else sees" — then leaves the local value as
the headline number 300px above it, unlabelled. **The user has no way to know which is real. Their first
conclusion is that the app is broken; their second is that the leaderboard cannot be trusted, which is
the only thing in a fantasy game that has to be.**

*Same fault, other surfaces: `App.tsx:50-54`, `TournamentPage.tsx:19-23`, `TeamPage.tsx:33` — four
independent client call sites plus one server one. → 8.4.*

**Direction:** one number of record for the whole screen — the server one — everywhere your own total
appears. If the faster local number is worth keeping, label the difference ("42 pts · +2 pending"). One
hook, `useMyScore()` returning `{ server, local, stale, lastSync }`, collapses four call sites and gives
the freshness work from 4.1 a natural home.

### 4.4 — MAJOR · Mid-round, nothing distinguishes "lost" from "hasn't played yet"

`playerRoundPoints` returns 0 for "no match this round" and 0 for "played and lost"
(`tournament.ts:214-228`). Points-by-round adds a column for the live round the moment its *first*
match finishes, and renders every other player's cell as "–" (`TeamPage.tsx:258-262`).

Verified live mid-R32: **Taylor Fritz — vice-captain, still in, match on court — renders "1.0 | – |
1.0", character-for-character identical to Ugo Humbert, who lost in R64.** The legend
(`TeamPage.tsx:214-217`) explains the green dot and the OUT chip but neither of the two symbols that
fill the table.

The court on Home is no better: an alive bench player is labelled with their **price**
(`SquadCourt.tsx:262`) — a draft-time fact that means nothing once play starts — and an eliminated one
with "OUT R32". The row-level green dot means "still in the tournament", not "still to play this
round".

**"Who am I still waiting on?" is the entire question of this journey, and no screen answers it** —
even though the draw holds every pairing and `getOpponentId` (`tournament.ts:161`) already computes it.

**Direction:** three visually distinct cell states — lost, not-in-squad-that-round, yet-to-play — and
both in the legend. On Home, one line under the Score card: **"4 of your 10 still to play in the R16."**
Both are pure functions of data already in the store.

### 4.5 — MAJOR · The header status line and the coach card contradict each other at every round transition

`roundStarted()` is a function of the wall clock (`tournament.ts:54-59`). `NextMove` re-evaluates it
every second, because `useCountdown` fires `setNow` at 1 Hz and `buildView` runs on every render
(`NextMove.tsx:48-49`). `HomePage` calls `liveRoundStatus()` as a plain function during render
(`:45, :86`) and only re-renders when something else pushes one (the 20s board poll, or the 5-min
results merge).

So the instant R16's scheduled start passes, `NextMove` flips to "The Round of 16 is about to begin —
your captain and any signings are locked for this round", while the ember line **directly above it**
still reads "R16 incoming — choose your captain".

At 375px these two lines are within one thumb's reach and they give opposite instructions. It is a
~20-second window, but it recurs at every round boundary — six times an event, at exactly the moment
people are checking.

**Direction:** a `useLiveRoundStatus()` hook that subscribes to draw/results **and** carries its own
low-frequency tick (15s is plenty), consumed by `HomePage`, `NextMove` and `TournamentPage`, so there is
exactly one answer per render.

### 4.6 — MAJOR · The Bracket tab pulses "live" 24 hours a day, including on rest days

The pulsing green dot is gated on `phase === 'pre_round'` (`App.tsx:248-250`). `finalizeDraft` sets phase
to `'pre_round'` (`gameStore.ts:316`) and the only exit is `playRound` (`:449, :513`) — the manual flow
that never runs at a live event (your own comments say so at `HomePage.tsx:229-231` and
`NextMove.tsx:157-158`).

So from the moment a manager locks their squad until the tournament ends, that dot pulses: at 4am, on
the Tuesday rest day, during the 48 hours between R32 and R16 when nothing is happening.

**This is the app inventing activity, and it is the only "something happened" affordance in the entire
product.** Because it never turns off, it never means anything — and the one time something genuinely
does happen (your captain wins a quarter-final), there is no signal left to say so. It also quietly
contradicts the honesty the underway/live split was built to protect.

**Direction:** drive it off `liveRoundStatus()?.live` at minimum. Better: make it a genuine unread
marker — a result has landed since you last opened the Bracket tab — stored as a last-seen result count.

### 4.7 — MAJOR · The copy promises live scoring the pipeline cannot deliver, and never names the lag

"Points update automatically as your players win" (`NextMove.tsx:196`). "Points are live"
(`HomePage.tsx:247`). "Underway" (`TournamentPage.tsx:50`). The actual pipeline: Wikipedia edits a few
minutes after a match **ends**, plus up to 5 minutes of client poll — realistically **5–15 minutes**,
unbounded if 4.1 or 4.2 bites. And there is no in-play concept at all: the parser reads the bolded
winner (`drawParser.ts:171-175`), so a match currently on court is completely invisible to the app.

"Live" sets an expectation of seconds. A manager watching their captain convert match point on TV, then
staring at an unmoved number for ten minutes, concludes the app is broken — and that verdict contaminates
the leaderboard. **This is a self-inflicted wound: the constraint is perfectly defensible, it is just
never disclosed.**

**Direction:** one line, where the score is: *"Results land a few minutes after each match finishes ·
updated 2m ago."* Paired with the freshness stamp from 4.1, the complaint disappears.

### 4.8 — MAJOR · The leaderboard silently reorders under your thumb every 20 seconds, and the rows are buttons

`useCloudBoard` polls every 20 seconds and always calls `setRows` with a fresh array, so the board
re-sorts by score on every tick whether or not anything changed (`leagueBoard.ts:112`, fed by `:57`).
Rows are ~40px tall, clickable (`HomePage.tsx:165-198`, `onClick → openTeam(row.id)`), and reorder with
no animation, no highlight of what moved, and no suppression while a touch is in flight. A re-sort
landing mid-tap opens a different manager's team page than the one you aimed at.

**But the bigger loss is what is being thrown away: the reorder IS the drama.** "You just passed Dave"
is the reason to keep the app open, and right now it happens as an untraceable silent shuffle. The app
already computes the gap-to-next line at `HomePage.tsx:188-192` — good instinct — and then destroys its
context by re-sorting invisibly.

**Direction:** animate position changes (a FLIP transform, ~250ms), flash the moved row with the delta
(+10), and skip a re-sort for ~1.5s after `touchstart`. Same data, same poll — it just becomes readable,
and the thing that currently causes mis-taps becomes the thing that keeps people watching.

### 4.9 — MAJOR · The component called `LiveFeed` is not a feed

`LiveFeed.tsx:1-10` renders null. It is a headless poller wearing the name of the thing this journey
needs. **Nowhere in the app is there a chronological stream of events**: no "Sinner beat Rublev — +10,
×2 captain = 20", no "Fritz is out in the R16", no "you gained 34 this round". The score changes by an
integer and the user reverse-engineers why from a bracket of 63 match cards or a table of dashes.

Every ingredient exists: the pairing (`tournament.ts:161`), the winner, the round's base points and the
upset multiplier (`:176-188`), the captain of record (`:204-212`). The app never composes them into a
sentence. **The upset multiplier in particular is the most interesting mechanic in the game — a
graduated 1.0→2.0 curve — and a manager can play an entire tournament without ever seeing it fire,
because nothing narrates it.**

**Direction:** keep the poller, rename it `LiveFeedSync`, and build the real thing on Home under the
score: the last 5–8 results involving your squad, newest first, each as *"Alcaraz d. Musetti · R16 · +5
×1.4 upset ×2 C = 14"*. It is a pure function of data already in the store, it teaches the scoring
system by demonstration, and it is the one screen worth opening a phone for mid-round. **This is the
retention loop the product is missing, not a nice-to-have.**

### 4.10 — MINOR · Pre-tournament, the score card says "0" while the table beside it says "–"

`HomePage.tsx:91` renders a flat `fmtScore(myScore)` = "0 points". Your own row directly below renders
`tournamentStarted() ? fmtScore(row.score) : '–'` (`:197`), with a blue note above the table explaining
what the dash means (`:154`).

"0" is a verdict; "–" is a state. Given that four of eight Cincinnati managers finished on exactly zero,
a screen that shows a hard 0 before anyone on earth could have scored is training people to read 0 as
normal — which is exactly the number you need them to react to later.

### 4.11 — MINOR · The 1 Hz countdown re-runs a full draw-wide derivation every second

`useCountdown` ticks `setNow` every second (`Countdown.tsx:7-11`), re-rendering `NextMove`, which
re-runs `buildView` from scratch. `buildView` calls `liveRoundStatus` (6 rounds × `roundComplete`, each
filtering the ~190-match draw), `liveLeaderRound` (6 × `roundStarted` → `roundHasResult` →
`activeMatches`, which **rebuilds a `Match[]` from the entire draw on every call** — `tournament.ts:23-26`
memoizes nothing), then `myTeam.filter(isEliminated)` — ten players, each a full draw scan plus
`drawCoversField`, which builds a Set over ~380 entries and filters the 96-player roster.

Order of 10–20k array operations plus heavy transient allocation, **once per second**, for as long as
the "Before the R16" card is on screen — which is most of the days between rounds. `HomePage` compounds
it: the 20s board poll always calls `setRows` with a fresh array, re-rendering `SquadCourt`, which
recomputes `isEliminated` inline for all ten players (`SquadCourt.tsx:197, 251, 302, 335`).

This is a mid-range Android on the screen people leave open. Not a crash — the slow kind of reputation
damage: warm phone, scroll jank, battery.

**Direction:** memoize `activeMatches()` on the `(draw, results)` object identities — they only change on
a merge, and `liveStore` already replaces them wholesale. Then split the ticking clock into a leaf
`<CountdownLine>` so a second passing re-renders 40px of text instead of the state machine. *→ 8.7.*

### 4.12 — MINOR · The mid-event joiner is sent to a Bracket page stripped of the round status and the rules

A manager who signs up during a live event stays in phase `'draft'`. `NextMove` correctly detects this
and offers "Watch the live bracket · follow every match" (`:125-135`). The destination gates its entire
status box **and** its "How points are scored" panel on `phase !== 'draft'` (`TournamentPage.tsx:34`), so
this user — the only one who has never seen either — gets neither. They land on a bare 63-match bracket
with no indication of which round is live and no explanation of the game.

**Direction:** `const showStatus = !!focusRound` — let `liveRoundStatus()` be the single gate. The
scoring-rules panel should show unconditionally; it is the best explanation of the game anywhere in the
product and it is hidden from newcomers. *→ 7.5.*

---

## Journey 5 — Between rounds: cash-in and transfers

**Two entirely separate transfer mechanisms exist, built from different code, with different rules,
different information and different failure modes.** The Market path is 4 taps; the court path is 3.
**The shorter, easier path is the one carrying less information and the silent failure.**

### What works

- **`NextMove` on Home is the reason this journey is discoverable at all** (`NextMove.tsx:229-231`,
  `:108-113`). It turns "a player of yours is out" into a counted, tappable checklist step that becomes
  the card's primary button. Keep this. It is doing more work than the Market itself.
- **The refund is on the button before you press it.** "OUT R32 · +$8.5M back" on the row and "Cash In
  +$8.5M" on the button (`DraftPage.tsx:591-604`). Zero extra taps to know the number. This is the thing
  most fantasy apps get wrong, and it should be the model for the court path too.
- **Buy-now-undo-until-it-matters is a genuinely good model** (`gameStore.ts:415-433` `undoBuy`,
  `DraftPage.tsx:107-113` `isUndoableBuy`). A signing commits and saves immediately while staying
  reversible until the round it would first score in actually starts. No pending basket, no separate
  commit, no way to lose the change by walking away. **Do not replace this with a staged basket.**
- **The dashed "Open slot" row** (`DraftPage.tsx:618-626`) is the right way to explain a 9-player squad:
  the hole as an intentional, actionable object rather than a missing player.
- **Making an opening-round casualty a free repair** (`tournament.ts:433-435`) is fair on the merits — a
  manager should not burn one of three transfers fixing a squad that never got to play.

### 5.1 — BLOCKER · The court's "Transfer out" silently does nothing once 3 transfers are spent

`SquadCourt` gates the "🔁 Transfer out — replace X" button on `out && windowOpen &&
substitutionCandidates(...).length > 0` (`SquadCourt.tsx:337`). **It never checks the transfer cap** —
the file does not import `MAX_TRANSFERS` or `transfersUsed` at all (`:1-11`). The Sign handler at `:404`
is `replacePlayer(subFor, p.id); setSubFor(null);` — the sheet closes unconditionally.
`gameStore.replacePlayer:329` then hits `if (transfersUsed(transfers) >= MAX_TRANSFERS) return;` and
returns silently, **with no toast**.

The manager taps Sign, the sheet slides away, the court is unchanged, and nothing ever explains why. The
same silent return covers nine other guards at `gameStore.ts:327-346` — including `isEliminated(newId)`
at `:334`, genuinely reachable when a result lands (every 5 minutes) between the sheet rendering and the
tap.

**This is the failure mode that produced 88f692fa in miniature: someone does the work, presses the
button, and the app registers nothing and says nothing.** From the manager's side a tap that produces no
state change and no message is indistinguishable from a broken app, and their reasonable next move is to
stop. This path is also two taps from Home, so it is not an obscure corner.

**Direction:** two cheap fixes. (1) Give every early return in `replacePlayer` / `cashInPlayer` /
`buyPlayer` a toast, the way `setCaptain` already does via `warnLeaderLocked` (`gameStore.ts:47-50`) —
the pattern exists in this file, it just was not applied to the transfer actions. (2) Compute
`transfersLeft` in `SquadCourt` and disable the button with the reason inline, so UI availability mirrors
the store guard.

### 5.2 — BLOCKER · Two transfer engines with different rules, different UI and different guards

The same operation — swap out a dead player — has two implementations sharing no code:
`gameStore.replacePlayer` (`:324-358`) and `cashInPlayer` + `buyPlayer` (`:362-409`).

**Their guard sets differ.** `replacePlayer` checks the transfer cap and `isEliminated(newId)` but not
`cashInOpen()`. `cashInPlayer` checks `cashInOpen()` and `cashedIn` membership but **not the transfer
cap**. `buyPlayer` checks the cap and an open slot but not `cashInOpen()`.

**Their UI differs more.** The Market shows the refund, a confirm modal, a transfer counter, an Undo, and
lets you cash in without buying. The court shows none of those and cannot cash in without buying.
`TransferHelpModal.tsx:8-14` documents **only** the Market flow — a manager who found the court flow has
no documentation for it anywhere in the app.

Three costs: users get two contradictory mental models of one rule; every future change has to be made
twice and will eventually be made once; and the undocumented path is the one with the silent failure, so
the divergence has **already** produced the bug (5.1).

**Direction:** make `replacePlayer` a thin composition of `cashInPlayer` + `buyPlayer` so there is one
guard set and one place to change the rules. Then decide deliberately which surface owns the flow. My
read: **the court should stop trying to be a transfer desk and route to the Market with the player
pre-selected.** The court is where you watch; the Market is where you trade. That is a considered
structure rather than an accident.

### 5.3 — BLOCKER · Cash In is irreversible with no confirmation — while the reversible action has one

Tapping "Cash In +$8.5M" calls `cashInPlayer` immediately (`DraftPage.tsx:604 → :122`). The player leaves
`myTeam`, goes into `cashedIn`, and **there is no `undoCashIn` anywhere in `src/`.** Meanwhile buying,
which *is* reversible via `undoBuy`, gets a full confirmation modal (`DraftPage.tsx:467`).

**The app has put the dialog in front of the undoable action and nothing in front of the permanent one.**

At 375px the Cash In button is a 36px target sharing a cramped row with the avatar, name and a wrapping
"OUT R32 · +$8.5M back" line (`:582-606`); with two eliminated players the two rows are adjacent and
near-identical. Mis-tap and that player is gone permanently. If your transfers are then spent, or the
refund cannot cover anyone, you field nine for the rest of the event with no route back.

**Direction:** either add the same confirm sheet the buy has — stating the refund, the resulting budget,
**and** that a transfer will be needed to refill the slot — or make cash-in reversible until the next
round starts, mirroring the `undoBuy` model that already works well. **The second is better:** it makes
the two halves of the transaction behave the same way, which is what a manager already assumes.

### 5.4 — MAJOR · The help card states the refund rule backwards

`TransferHelpModal.tsx:45`: *"The refund depends on how far the player got — a quarter-finalist returns
more than an early exit."*

`BUDGET_RETURN_RATES` says the exact opposite: **R64 0.70, R32 0.55, R16 0.40, QF 0.25**
(`tournament.ts:381-389`). An early exit refunds nearly three times what a quarter-finalist does.

The source of the error is visible in the file: `tournament.ts` carries two contradictory comment blocks
— a stale one at `:370-374` ("Deep exits (QF ≈ two-thirds back) reward players who nearly went the
distance") and the current one at `:376-380` ("the earlier a player is knocked out, the MORE of their
price comes back"). The help copy was written against the stale block and never updated.

**This is the only explanation of the refund rule anywhere in the product, and it directly corrupts the
decision it exists to inform.** A manager holding an R64 casualty and a QF casualty with one transfer
left will cash in the QF player expecting the bigger cheque and receive 25% instead of 70% — on a $40M
Platinum that is an $18M error, enough to change who they can afford. **It is a wrong number in the
manager's head, put there by us.**

**Direction:** fix the sentence, delete the stale comment block at `tournament.ts:370-374`, and surface
the actual rate on the row: "OUT R32 · +$8.5M back (55% of $15M)". The curve is a real strategic lever
and right now nobody can see it.

### 5.5 — MAJOR · The 3-transfer cap is invisible until after the irreversible step

Before you cash in, the header says "2 eliminated players to Cash In for $17.0M — claim the money, then
buy any replacement you like" (`DraftPage.tsx:176`) and the banner says "Tap Cash In next to them in My
Squad — then buy any replacement below" (`:238`). **Neither mentions that buying costs one of three
transfers for the entire tournament.** `transfersLeft` first appears at `:182` and `:248-252`, both
conditioned on `openCount > 0` — which is only true *after* you have already cashed someone in. And
`cashInPlayer` has no cap check, so a manager with zero transfers left is still shown "Cash In +$8.5M",
takes it, and only then reads "Cashed-in money can no longer be spent" (`:180`).

The one pre-emptive statement of the rule lives in `HowToPlay.tsx:27`, inside a modal opened from the app
header — not from the Market, and not from this flow.

**The scarce, irreversible resource is revealed only after it has been partly spent.** Structurally the
same failure as the draft: the constraint is enforced but never projected forward.

**Direction:** put "2 of 3 transfers left" in the header and the cash-in banner, before the first tap.
Better: state the consequence in the same sentence as the action — "Cash In +$8.5M · buying a replacement
uses 1 of your 3 transfers". And add the cap guard to `cashInPlayer` so the app stops offering a claim it
will not let you use.

### 5.6 — MAJOR · The Market contradicts itself on one screen when transfers run out

With an open slot and zero transfers left, four elements render simultaneously:

- top banner (`DraftPage.tsx:254-258`): "All 3 transfers used — your squad is set for the rest of the tournament."
- sidebar footer (`:662-663`): "🛒 1 open slot · **$8.5M to spend**" — that branch has no `transfersLeft` guard
- every table row (`:480-482`): "No transfers left"
- sidebar budget line (`:506-507`): labels the unspendable money "**Available**"

"$8.5M to spend" and "Available" are not merely unhelpful, they are **false** — that money cannot be
spent on anything, ever. This is the behaviour that produces the repeated-save pattern in the evidence:
rev counts of 23 and 10 are people re-reading a screen looking for information it will not give them
consistently.

**Direction:** derive a single `canStillTransfer` at the top of the component and let all four read it.
The footer becomes "1 open slot · no transfers left to fill it"; the budget line becomes "Banked".

### 5.7 — MAJOR · Home's headline instruction can be impossible to complete and never ticks off

`replaceDone = eliminated.length === 0` (`NextMove.tsx:206-207`) takes no account of
`transfersUsed`/`MAX_TRANSFERS` or of whether any replacement is affordable, and the step is built
whenever `transferWindowOpen()` (`:229-231`). The first not-done step becomes the card's big primary
button (`:52, :108-113`).

So a manager with three transfers spent sees the app's loudest instruction as "Replace eliminated players
→", taps it, and arrives at a Market whose banner says "All 3 transfers used — your squad is set."
The step can never reach done unless they cash in — which the app has just told them is pointless.

`NextMove` is the best component in this journey and this undermines it specifically. **A coach that
keeps issuing an order you have been told you cannot follow stops being trusted.**

**Direction:** fold the cap and affordability into `replaceDone`, and give the exhausted case its own
honest step, the way the post-SF case already gets one at `:231` ("Squad is final — no transfers after the
semi-finals"). That branch is the right pattern; it needs a sibling.

### 5.8 — MAJOR · `SquadCourt` reads live results non-reactively and `TeamPage` never subscribes at all

`SquadCourt` calls `isEliminated`, `liveBudget`, `playerRefund`, `transferWindowOpen` and
`liveLeaderRound` (`:4, 28, 30, 44, 197, 251, 336`) — all of which read `useLiveStore.getState()`
internally — **and subscribes to the live store nowhere; it does not import it.** `HomePage.tsx:32-33`
subscribes, so the court on Home re-renders as a side effect of its parent. **`TeamPage` does not** — no
`useLiveStore` import anywhere in the file — and `TeamPage.tsx:151` renders the same fully interactive
`<SquadCourt />` for your own team.

Results land every 5 minutes. On the Team page the court keeps showing a knocked-out player as alive,
keeps a stale `budgetFor` (`SquadCourt.tsx:30`), and keeps offering or refusing "Transfer out" against
stale state until some unrelated game-store write forces a render. `transferWindowOpen` and
`roundStarted` are clock-dependent (`tournament.ts:54-59`) and nothing in `SquadCourt` ticks, so the
window can read open well past its scheduled close.

It produces exactly the silent no-op in 5.1, but from a correct-looking screen. **Depending on a parent's
subscription for correctness is a landmine — the next page that renders `SquadCourt` inherits the bug.**

**Direction:** subscribe inside `SquadCourt` and add a coarse timer tick for the clock-derived predicates.
Longer term, the `eslint-disable react-hooks/exhaustive-deps` pattern repeated at `DraftPage.tsx:73-75,
88-90, 95-97, 101-103, 114-116` is a smell: these derived values want to be selectors, not memos with
hand-maintained dependency lists. *→ 8.7.*

### 5.9 — MAJOR · Three "cash-in opens when the round ends" states are unreachable dead code

`cashInOpen()` is `return transferWindowOpen();` (`tournament.ts:348-353`) — the two predicates are
identical. `DraftPage` derives `pendingCash = cashOpen ? [] : outHeld` (`:93`), then renders it in three
places that are all nested inside `windowOpen`: the header line (`:178`), a dedicated ⏳ banner
(`:242-247`) and a sidebar summary (`:657-661`). Because `cashOpen === windowOpen`, `pendingCash` is
always empty inside those branches. **None of the three can ever render.** The comment at `:346-347`
still describes the intended distinction the code no longer draws. `:603`'s `ready && windowOpen` is
redundant for the same reason.

Someone designed the "your money is coming, wait for the break" explanation and it never reaches a user.
What ships instead is a 10px "⏳ round on" chip (`:606`) in a row already wrapping to four lines at
375px. Beyond the lost copy, ~40 lines of unreachable JSX in the busiest conditional cascade in the app
is how the next reader concludes the wrong thing.

**Direction:** decide which is true. If cash-in should be claimable during a live round for players who
fell in an earlier completed round, make `cashInOpen` a real predicate and the branches come alive. If
not, delete them and the stale comment. Both being half-present is not an option.

### 5.10 — MAJOR · A 9-player squad is explained on exactly one screen and looks broken on the other two

After a cash-in the Market explains the hole well (`DraftPage.tsx:618-626`, blessed by
`TransferHelpModal.tsx:42`). Nowhere else does. Home's Squad stat card reads "9/10 · in play" with no
notion of an open slot (`HomePage.tsx:93-99`). The court renders nine avatars and a shorter bench with no
placeholder — `SquadCourt.tsx:266` only draws "+ Add" slots `if (canEdit)`, which is draft phase only, so
live there is nothing marking the gap.

Home is where managers spend their time, and Home presents an under-strength squad as normal. Managers
who cash in and get distracted have no reminder anywhere that a slot and real money are sitting idle.

**Direction:** carry the open-slot concept onto Home and the court — an empty dashed bench position with
"Open slot" and the money attached — and change the Squad card's unit from "in play" to "1 slot open ·
$8.5M".

### 5.11 — MINOR · "Available" means two different things on the same screen

When the window is open, transfers remain and there is no open slot, every row's action cell falls through
to a grey "Available" (`DraftPage.tsx:485`), sitting in the column where "+ Buy" appears — so it reads as
"this player is available to buy" when it means "you have no slot to put anyone in". The sidebar uses the
same word 400px away to label the budget (`:506`).

**Direction:** say the blocker, not the state: "Cash in first". The draft branch already does exactly
this one branch away (`:455` renders "Gold full" / "Over $").

### 5.12 — MINOR · A free repair makes the transfer counter look broken

`transfersUsed` excludes any transfer whose outgoing player fell in the unscored opening round
(`tournament.ts:433-435`), so replacing an opening-round casualty is free. A manager who does so watches
the banner say "3 of 3 transfers left" immediately after making a transfer (`DraftPage.tsx:81, :251`).
Nothing states the exemption. At a 96-draw Masters the opening round is played while the draft is still
open, so **this is the common case.** A counter that does not move after an action reads as a bug, and
the manager's next move is to test it — which costs a real transfer.

**Direction:** say it at the moment it applies, on the cash-in row and in the toast: "replacing them is
free — doesn't use a transfer". The rule is generous and it is currently invisible generosity.

### 5.13 — MINOR · Transfer history records a swap that may not be the one you made

`buyPlayer` backfills `openSlots[0]` — the comment at `gameStore.ts:403` admits "which cashed player is
arbitrary". Cash in Sinner and Rune, then buy Fritz, and the transfer is logged as `{out: Sinner, in:
Fritz}` whether or not that is the pairing you had in mind. `TeamPage.tsx:329-333` renders that pairing as
the public record, for every team, so rivals read it too. Scoring is unaffected — but it is cosmetic in
the one place the app presents itself as a record of what happened.

### 5.14 — MINOR · The Market's cash-in instruction renders below the thing it instructs about

The sidebar carries `order-first` (`DraftPage.tsx:497`), so on mobile My Squad — with the Cash In buttons
— appears directly under the header. The 💸 banner reading "Tap Cash In next to them in My Squad"
(`:235-239`) lives in the left column and therefore renders *after* it. The pointer arrives once the
manager has already scrolled past the target. Putting My Squad first was the right call; the instruction
just did not follow it.

---

## Journey 6 — Friends: leagues, invites, standings

**Where do I stand: 0 taps** (Home). **Full standings, if you have no private league — the common case:
2 taps, every visit,** because the toggle does not persist. **Create a league: 3 taps. Share it: 4 more.**
**Today, with Cincinnati live: infinity taps — the controls are not rendered.**

### What works

- **One squad, many leagues.** `CloudSync` always writes the entry against the public league id
  (`CloudSync.tsx:156`), and a private board resolves standings by `league_members → user_id` with no
  league filter on the entry (`cloud.ts:264-277`). Exactly one entry per user per tournament, and every
  board is a different view of it. **This is the correct model** — it is why the Home league picker swaps
  boards instantly with zero re-draft, and why nobody has to choose between playing publicly and playing
  with friends. Do not touch it.
- **Sharing a link, not a code.** `invite.ts:10-36` shares `origin/?join=CODE` through the native share
  sheet with a proper `AbortError` guard, and `App.tsx:85-124` strips the param, stashes it and auto-joins
  with a toast naming the league. Bare-code entry is the fallback, not the primary. Right shape for a loop
  that lives in iMessage.
- **The private board lists members with no entry** (`cloud.ts:222-223, :277`) — deliberately. That is the
  "who still needs to pick" signal, and it is a considered decision, not an accident.
- **The column choice is ambitious and correct in principle.** Out / Buys / C+V / Budget / Pts
  (`LeaguePage.tsx:65-71`) is an attempt to make the table *explain* rather than merely rank. Almost
  nobody does this.
- **Your own row splits its sources correctly** (`leagueBoard.ts:96-107`): squad and budget from local
  state, **score from the server**, so your row shows other people exactly what they see.
- **Any member can invite, not just the owner** (`LeaguePage.tsx:302`). Right call for a friends game.
- **Delete is done properly** — two-step, and the confirm names the league and says "for everyone?"
  (`:342`). This is the standard the Remove and Leave buttons three lines away should have met.
- **"–" instead of 0.0 before the first result**, plus `ScoringPendingNote` (`:40-41, :59`).
- **The polling discipline** — jittered 20s polls paused while hidden (`leagueBoard.ts:57`,
  `LeaguePage.tsx:189`), a monotonic request-id guard so a slow response cannot overwrite a newer one
  (`leagueBoard.ts:42-52`), `PublicBoard` isolated so its poll does not run behind the Private view
  (`LeaguePage.tsx:120-130`), and every foreign player id sanitized before it reaches the throwing
  `getPlayer()` (`leagueBoard.ts:80-92`). Hard-won and right.
- **A mobile-specific budget column** — `$53` on phones, `$53.0M` from `sm:` up (`:70, :105`). Someone
  actually looked at this table at 375px.

### 6.1 — BLOCKER · The entire create/join/invite journey is deleted the moment play starts — and the app's biggest CTA points straight at it

`const started = tournamentStarted()` gates away the Create box, the Join box **and** the invite banner
(`LeaguePage.tsx:196, 257, 278-280, 302`). Cincinnati has been live since 14 Aug, so right now a manager
who opens League sees only: *"Private leagues are closed — the tournament has started."*

**A league owner can no longer see or copy their own invite code anywhere in the product** — the code
appears in exactly two places in the UI, the create toast and that banner, and both are gone.

Worse: `SquadLockedModal`'s primary button — the confetti moment, "Create a league & invite friends →"
(`SquadLockedModal.tsx:33`) — calls `setActiveTab('league')` with **no precondition check**
(`DraftPage.tsx:714`). Anyone who locks late, which is most people, taps the highest-intent button in the
funnel and lands on a dead paragraph.

The private league IS the product — `SquadLockedModal.tsx:8` says so in a comment ("pivots straight into
the viral loop… at peak intent"). **The loop is open only in the few days before the draw and shut for
the ~10 days the event is actually exciting and people are talking about it.** A friend who hears about
the game on day 2 cannot be brought in at all, and the app never says when or whether it reopens. It
reads as broken, not as closed.

**Direction:** separate the two rules that got fused. Joining mid-event is harmless — the entry is already
scoped by tournament and their score just starts where it starts. Keep Join and the invite banner alive
for the whole event and label the consequence: "Sam joins from R16 — earlier rounds don't count for them."
Keep Create alive always; it costs nothing. If you truly want a closed field, say when: "Locked for
Cincinnati — reopens for the US Open on 24 Aug", with a button that pre-creates the league for the next
event. And gate `SquadLockedModal`'s CTA on whether the destination has anything on it.

### 6.2 — BLOCKER · "Leave this league" and "Remove" are one unconfirmed tap on 22px targets, and unrecoverable

`doLeave` and `doKick` fire immediately on click (`LeaguePage.tsx:333, :349`). No confirm, no undo, no
undo-toast. Both buttons are `text-[11px] px-2 py-1` — **~22px tall** — sitting inside a member list that
re-sorts itself every 20 seconds (→ 6.7). And because the Join box is hidden once `started` is true
(6.1), **a person who leaves or is removed mid-tournament has no path back into that league** — the code
no longer has a field to be typed into.

Three lines above, deleting a league gets a proper two-step confirm. The inconsistency inside a single
card means the pattern was never applied, not that a decision was made.

This is loss of work under the audit's own definition: a whole tournament's social context, gone from a
mis-tap on a 22px control, with no recovery.

**Direction:** the same two-step treatment Delete already has, with copy stating the consequence — "Leave
<league>? You won't be able to re-join while Cincinnati is running." 44px targets. If you fix 6.1 by
keeping Join open, this drops to a normal confirm.

### 6.3 — MAJOR · The board cannot show that a friend has a finished squad and hasn't entered it — and invents a $150M budget for them

The B8 view redacts `myTeam` / `initialSquad` / `captain` / `transfers` from any entry still in
`phase='draft'` — correct, rivals should not copy an in-progress draft. **But `phase` itself survives the
redaction and `boardRow` never reads it** (`cloud.ts:223-247`), and `CloudBoardRow` has no lock flag.

So on the private board, a friend who built a legal 2/3/5 squad and spent all $150M but never pressed
Lock renders as: **0 pts, Out 0, Buys 0, C+V –.** Identical to someone who joined and never opened the
app.

And the Budget column is worse than absent: `leagueBoard.ts:81` recomputes it with
`liveBudget([], [], [], [])` — which returns `STARTING_BUDGET` — so it confidently prints **"$150.0M to
spend" for a manager with $0.0 left.** The accurate server value is fetched at `cloud.ts:238` and then
thrown away; nothing reads `CloudBoardRow.budget`.

**This is 88f692fa.** Ten players, exactly 2/3/5, every dollar spent, a captain, 23 saves, zero points.
**The league board is the only place their friends would have noticed — and it showed them as untouched
and flush with cash.** The app had the information (phase in the state blob, budget in a column it
already SELECTs) and displayed the opposite. A leaderboard that misreports a rival's state is not a
neutral omission; it actively prevented the one intervention that would have saved that entry.

**Direction:** add `locked: (st.phase ?? 'draft') !== 'draft'` to `boardRow` in `cloud.ts` **and** to the
edge function's `boardRow`, and render it as a status pill on every row: "Locked ✓" / "Drafting…" / "Not
started". Sort unlocked-with-zero to the bottom with a nudge affordance — a share sheet pre-filled with
"You've got 10 players — enter them!". Use the server `budget` for rival rows; fall back to `liveBudget`
only for your own.

### 6.4 — MAJOR · Gold, silver and bronze medals are handed out alphabetically before anyone has scored

The sort is `b.score - a.score || a.name.localeCompare(b.name)` (`leagueBoard.ts:112`). Pre-tournament
every score is 0, so the name tiebreak decides the whole order — and `RankBadge` still paints rows 1–3
gold/silver/bronze with a glow (`LeaguePage.tsx:20-28`) while Home puts literal 🥇🥈🥉 on them
(`HomePage.tsx:59`). All of this directly under a note saying the tournament has not started.

The screen contradicts itself in a 200px vertical span. A manager who sees themselves 4th before a ball
is hit will believe the game already went against them. It also quietly teaches that the tiebreak is
alphabetical, which is not a rule anyone agreed to. During play, two managers on 40.0 get ranks 3 and 4
with no tie indication.

**Direction:** suppress medal styling entirely while `!tournamentStarted()` — flat badges, sorted
alphabetically with a header saying so. Once scoring is live, render true ties as equal rank ("T-3"). Do
it once in a shared helper: `RankBadge` and `HomePage.medal` are two implementations of one idea.

### 6.5 — MAJOR · No comparison is possible — the captain is in the data and never shown

To find out why someone is beating you: tap their row, read, tap back, tap your own row, read, and hold
both in your head. No side-by-side, no differentials, no per-round column, no rank movement. **The board
has `captain` and `viceCaptain` loaded on every row (`leagueBoard.ts:22-23`) and renders neither** —
despite captain being a ×2 multiplier and therefore the single largest explanatory variable in the
scoring system. And the Home preview has a gap-to-rival line (`HomePage.tsx:188-192`) that the page you
tap through to for FULL standings **does not**. The destination is less informative than the preview of
the destination.

**A league board that ranks without explaining gives you a number to be annoyed about and no move to
make. That is what makes a fantasy game stop being fun by round three.**

**Direction:** three additions, in order of value per line of code. (1) A **Captain column** — one avatar
plus last name, greyed with a lock icon while their entry is redacted. This alone answers "why" most of
the time. (2) The same +X-to-catch line Home already has, on the rows above and below yours. (3) Tapping
a rival opens a two-column compare against **your** team rather than their team in isolation, shared
players dimmed, differentials highlighted. All three read from data already in memory.

### 6.6 — MAJOR · Tapping a rival in a PRIVATE league resolves them against the PUBLIC board

`StatsTable` rows call `openTeam(row.id)` → `TeamPage`, which looks the id up in the **public** board
(`TeamPage.tsx:31`, `useLeagueBoard(null)`). The private board deliberately includes members who have no
entry row (`cloud.ts:222, :277`); those people are absent from the public board by construction. So
tapping a friend who joined but has not drafted shows *"This team isn't in your league yet, or is still
loading."* — while you are staring at their row inside your league.

At scale it gets worse: anyone outside the top 100 (`functions/api/leaderboard/[tournament].ts:11`) or 250
(`cloud.ts:250`) is unreachable the same way, and **which limit applies depends on whether the CDN was
warm** — so the same tap works or does not depending on cache state, and "N managers" silently changes
number between refreshes.

**Direction:** pass the league context into `TeamPage` (store the selected league id alongside `viewTeam`,
or have `TeamPage` read the same `useLeagueBoard(selectedLeagueId)`) so a row is always resolved from the
board it was rendered in. Make the two limits one exported constant. Give the not-yet-drafted case its own
state ("Sam hasn't drafted yet") instead of an error.

### 6.7 — MAJOR · Two independent fetches of the same league's membership, on two independent timers

`fetchLeagueMembers` (`LeaguePage.tsx:184, 189`) and `fetchLeaderboard({allMembers:true})`
(`leagueBoard.ts:51, 57`) both query `league_members` for the same league and both join `public_profiles`,
on two unsynchronised jittered 20s polls. The header count comes from one (`LeaguePage.tsx:297`), the
table rows from the other. After a friend joins, the header can say "4 members" while the table shows 3
for up to 20 seconds. On first render `members` is `[]`, so the header briefly reads "<League> · 0
members" for a league you are standing inside.

**The header count is exactly the number an owner stares at to confirm their invite landed — and it is
the one most likely to be wrong.** Roster order is a second symptom: `cloud.ts:152` has no `.order(...)`,
so the manage list can re-sort between polls with a one-tap unconfirmed "Remove" on every row (→ 6.2).

**Direction:** derive the member list from the board — it already has userId, teamName, teamEmblem and
username for the same set — and delete `fetchLeagueMembers`. Add `.order('joined_at')`. Render "…" rather
than 0 until the first fetch resolves.

### 6.8 — MAJOR · `joinLeague` swallows every failure into "No league found with that code"

`doJoin`'s catch has no binding and no inspection (`LeaguePage.tsx:224-229`). Offline, RLS failure, rate
limit, a Supabase 5xx — all render as "No league found with that code."

**Forty lines away, the deep-link handler does exactly the right thing** (`App.tsx:113-121`): it matches
on the message, clears the pending code only for a genuinely bad one, and tells the user it will retry
when they are back online.

Someone on a train with a perfectly valid code is told their friend gave them a bad one. They message the
friend, the friend re-sends the same code, it fails again. Two policies for one operation in one codebase
— and the worse policy is on the path more people use.

**Direction:** extract `App.tsx`'s classification into a shared `joinErrorMessage(e)` and call it from
both.

### 6.9 — MAJOR · Create or join a second league and you keep looking at the first — so "Invite friends" shares the wrong code

Neither `doCreate` nor `doJoin` sets `selected` (`LeaguePage.tsx:220, :226`). The effect at `:175-178`
only reassigns when there is no selection or the selected league vanished. So if you are already in League
A and create League B, `selected` stays on A: the toast announces B's code, while the board, the member
list and the invite banner all still show A. **Tap "Invite friends" and you share A's code to people you
meant to put in B.**

Separately, `fetchMyLeagues` orders only by `is_public` with no secondary key (`cloud.ts:141`), so for a
user with 2+ private leagues Postgres row order is arbitrary and can change between refreshes — making
`leagues[0]` (`LeaguePage.tsx:176`, `HomePage.tsx:55`, the default board on Home) nondeterministic. **This
is the same class of bug the codebase already identified and fixed one file over** (`cloud.ts:300`, "P5:
deterministic tiebreak so the truncated set is stable across refreshes"). The pattern was known and not
applied here.

**Direction:** `setSelected(id)` from the RPC's return value in both handlers before `refresh()`. Add
`.order('created_at')` to `fetchMyLeagues`. And make the create toast actionable — "Created — invite
friends" with the share sheet — rather than a code the user must memorise from a toast.

### 6.10 — MAJOR · Your score can differ between the Home stat card and the leaderboard row below it

Same fault as → 4.3, seen from the league side. Your leaderboard row uses the server score
(`leagueBoard.ts:96-107`); the Home "SCORE" card, the sticky header chip and your own Team page all compute
it locally (`HomePage.tsx:34-37`, `App.tsx:51-55`, `TeamPage.tsx:33`). **The decision to trust the server
on the board is correct — the fix is not to change that, it is that the other three surfaces were not
brought along.**

### 6.11 — MAJOR · Nothing explains what the public league is, or that one squad scores in both

The private side gets one sentence: "Invite-only — each private league is seen only by its members"
(`LeaguePage.tsx:199`). **The public side gets nothing.** Nowhere does the app say you were auto-enrolled
at signup (`private_leagues.sql` step 5), that you never "join" it, that you have exactly one squad, or
that it scores in every board simultaneously. The tab says "Public Leagues" (plural) for a single league
called "Grand Slam Open League" — a third name for the same thing. `HomePage.tsx:150` makes it worse:
"Draft your squad to join the Public League" implies drafting is the act of joining.

The underlying model is the best decision in this journey and it is completely invisible, so managers guess
whether joining a friend's league costs them their public standing. That guess has a wrong answer that
feels plausible.

**Direction:** one line under the toggle, on both sides: *"You're in the Grand Slam Open League
automatically. Private leagues are extra — the same squad scores in all of them."* Singularise the tab.
Use one name everywhere. Delete the misleading `HomePage.tsx:150` branch.

### 6.12 — MAJOR · The only in-app prompt to create a private league ticks itself off after one pick

`leagueDone = hasPrivateLeague || myTeam.length > 0` (`NextMove.tsx:139`). Pick a single player and "Add
friends (optional)" goes green with a tick, permanently, without you ever having a league. Combined with
the only other entry point — `SquadLockedModal`, which fires on lock — **a manager who drafts anyone and
never locks is never told private leagues exist except by discovering the tab themselves.**

Four of eight Cincinnati managers never locked, and at least three had picked players. For every one of
them, the coach card silently confirmed the social step was complete.

The `|| myTeam.length > 0` was clearly added to stop the card shouting "Create your league →" at an empty
squad — the comment at `:142-146` says so, and that reasoning is right. **The fix was applied to the wrong
variable.**

**Direction:** keep the ordering fix but make done-ness honest: `leagueDone = hasPrivateLeague`. Keep it
last in the list so it cannot hijack the primary button. An un-ticked optional step is a nudge; a falsely
ticked one is nothing.

### 6.13 — MAJOR · Every leaderboard fetch failure renders as an empty league with no error state

`fetchLeaderboard` catches every failure, logs to console and returns `[]` (`cloud.ts:266, 274, 302`).
`useCloudBoard` has no error state to propagate. The UI's only reaction is to render fewer rows.
Reproduced live: "🌍 Grand Slam Open League · 0 managers" above "No squads here yet — invite friends with
the code above."

On flaky data — a train, a pub, a tournament — a manager watching live results sees their friends silently
vanish with no explanation, and the 20s poll means it can flicker: rows present, gone, present.
`fetchMyLeagues` (`cloud.ts:142`) does the same, producing "You're not in any leagues yet" for someone who
is.

**Direction:** return a discriminated result, thread an `error` through `useCloudBoard`, and render a thin
strip above the table — "Couldn't refresh standings · retrying" — **keeping the last-known rows on screen**
rather than clearing them.

### 6.14 — MINOR · On the phone, the create and join controls get smaller touch targets than on desktop

The league-name input, the code input, the Create button and the Join button are all `py-1.5 sm:py-2`
(`LeaguePage.tsx:262-263, 269-270`) — ~34px on a phone, 38px from `sm:` up. **The responsive modifier makes
the primary controls of this journey larger on the device that has a mouse.** The toggle is ~40px
(`:143`); "Remove" is ~22px (`:333`); "Delete this league" is bare unpadded text (`:339`). Meanwhile the
nav is `min-h-[44px]` and Invite is `min-h-[40px]` in the same codebase.

### 6.15 — MINOR · League defaults to the Private tab for everyone and forgets the choice every visit

Plain component state (`LeaguePage.tsx:133-134`), so the toggle resets to Private on every navigation. A
manager with no private league — most of them — taps League, reads "You're not in any leagues yet", taps
Public Leagues, looks, goes to Bracket, comes back, and is on the empty private view again. **Home solves
the same problem properly** with a defaulting ref plus remembered selection (`HomePage.tsx:52-56`).

The comment at `:133` defends the default ("the friends board is the emotional core here") and the intent
is right — for people who have friends in the app. For everyone else, the tab named League opens on a
message saying you have no league.

**Direction:** `myLeagues.length > 0 ? 'private' : 'public'`, persisted in the profile store along with
the selected league id.

### 6.16 — MINOR · "Invite friends with the code above" appears where there is no code and no invite

`StatsTable`'s empty state (`LeaguePage.tsx:35-39`) is shared by both boards. Verified live on the Public
tab: "🌍 Grand Slam Open League · 0 managers" followed by "No squads here yet — invite friends with the
code above." The public league has no invite code and no invite control. The same copy fires on the private
board once `started` hides the banner.

### 6.17 — MINOR · Pasted invite codes with a leading space are silently truncated into a wrong code

`onChange` only uppercases (`LeaguePage.tsx:269`), and `maxLength={6}` clips a paste — so " ABC123" copied
from WhatsApp becomes " ABC12", six characters, so the Join button enables, so it submits, so the server
(which does `upper(btrim(p_code))`) finds nothing → "No league found with that code". Nothing indicates the
codes are hex-only.

**Direction:** `setCode(e.target.value.replace(/[^0-9A-Fa-f]/g,'').toUpperCase().slice(0,6))`. Add a Paste
button and show progress as "4/6".

### 6.18 — MINOR · Every board row rescans the full draw on every keystroke, poll and results tick

`isEliminated` does a linear `draw.some(...)` over ~190 entries plus an exit lookup, called for up to 13
players per row (`LeaguePage.tsx:45-48`). `correctLeaders` calls `playerRoundPoints` — another per-round
scan — up to 14 times per row (`:49-53`). Nothing is memoised. And the create/join input state lives in
the same component that renders `StatsTable` (`:168-169` vs `:316`), so **every keystroke while typing a
league name fully recomputes the board.** At eight managers this is invisible; at the public board's own
250-row limit it is on the order of a million comparisons per render, during live results. *→ 8.7.*

### 6.19 — MINOR · Rank numerals are white on gold and silver

`RankBadge` renders `color: '#fff'` on `#E8B923` / `#AEB6C2` / `#C77B3B` (`LeaguePage.tsx:20-28`) — roughly
1.9:1 and 2.0:1 contrast, far below the 4.5:1 minimum, at 13px in a 26px badge, on a phone, likely
outdoors. **Rank is the single number the page exists to communicate, and for the top three it is the
hardest to read.** Also: the public board renders 1..N with no indication it is truncated at 100 or 250 —
Home says "Top 12 of N", League says nothing — so at scale a manager outside the cut sees a rank number
that is not their real one.

---

## Journey 7 — The reference screens: bracket, player, team, profile

Every goal in this journey is one or two taps of navigation followed by an unanswered question. **The
screens are not far apart; they are missing the facts.**

### What works

- **The bracket's geometry is mathematically right and should not be touched.** `BracketTree.tsx:105-114`
  uses equal-height columns with `justify-around`, so round *i*'s match *s* lands at (s+0.5)/n and its two
  feeders at (2s+0.5)/2n and (2s+1.5)/2n — midpoint exactly (s+0.5)/n. Each match is genuinely centred
  between the two that feed it. **It reads as a tree because it is one.** The problem is the viewport, not
  the maths.
- **Drawing the full skeleton to the Final from day one**, with "TBD vs TBD" placeholders (`:58-64`) — you
  can see where two of your players would collide three rounds before the pairing exists. Most
  implementations render only what is known and lose that.
- **The pre-draw state is first-class, not an empty grid** (`:39-50`): it says the draw is not out, says
  when it will be, and gives the next action. **The pattern the rest of the app should copy.**
- **Highlighting one team's players in gold with C/V multiplier badges inline** (`:96-101, 196-199`) is the
  right feature, and the default resolves correctly — `leagueBoard.ts:104-109` always injects an entry with
  id `'you'`, so `BracketTree.tsx:26-27`'s `find('you')` still works after the board loads. I went looking
  for a race here and there isn't one.
- **"How the price is set" (`PlayerPage.tsx:133-153`) is the single best panel in this product.** Rank base
  × form multiplier × surface multiplier, each with a one-line justification, ending in the price. In a
  game whose entire failure mode is a $150M constraint people cannot reason about, showing the formula
  instead of asserting the number is exactly right — and it is honest about its edges ("at $18M ceiling",
  "not enough matches").
- **`PlayerPage`'s return-tab pattern is the app-wide standard it should be** (`gameStore.ts:541-545`,
  `PlayerPage.tsx:64-72`): it records where you came from and renders a truthful label. In a tab-state SPA
  with no URL history, this is the only thing between the user and a dead end. It also guards unknown ids
  with a friendly page (`:29-36`).
- **The profile auto-saves with no Save button and says so** (`UserProfile.tsx:23-25, 105`). Given that
  88f692fa lost a tournament to a button they did not press, a screen that cannot lose your edit is the
  right instinct. **The rest of the app should be learning from this file.**
- **`TeamPage`'s Points-by-round table is the strongest screen in this journey** and the only place the
  scoring becomes legible: per-player, per-round, multipliers applied, plus a public transfer history for
  every rival (`:158-169`). The sticky player column (`:228, 243`) keeps it usable at 375px — measured 350
  visible / 358 scroll width, no clipping. And its columns cannot drift from the scorer:
  `playedScoredRounds()` (`tournament.ts:231-233`) and `liveScoreBreakdown`'s filter (`:250`) resolve to the
  same set. I checked specifically for that class of bug and it is not there.

### 7.1 — BLOCKER · The Bracket tab is 6 pixels wide on a 375px phone

Measured live at 375×812. The nav is `flex-1 min-w-0 overflow-x-auto no-scrollbar` (`App.tsx:226`) with
`clientWidth` 165 and `scrollWidth` 214. Button rects: Home 78–123, League 127–179, Market 183–234, Bracket
238–292 — against a container that ends at **x=243**. **Six of the Bracket button's 54px are on screen**,
and the visible part of that region is actually occupied by the "?" and profile buttons which start at
x=259. `no-scrollbar` removes the only cue that the strip scrolls. On load the strip auto-scrolls to 48,
which hides "Home" entirely.

The width is consumed by the logo plus its margin (38px) and two 44px circular buttons (96px total — more
than Bracket needs). **And there is no bottom nav anywhere in `src/`** (the brief assumes one; it is a
sticky top header, `App.tsx:213`), so the four tabs sit in 8% of the viewport in the least reachable zone
of a phone.

A user cannot see all four places the game lives, and which one is missing changes depending on where the
strip happens to be scrolled. It also breaks onboarding: `FirstRunTour.tsx:40-43` spotlights `[data-tour]`
nav buttons by `getBoundingClientRect`, so the "The Bracket is the action" step draws its cutout over the
profile button.

**Direction:** move the tab bar to a fixed **bottom** bar — four icon+label targets at ~93px each fit
375px comfortably — and give the header back to identity and status. Drop the horizontal scroll entirely: a
nav that scrolls is a nav that hides itself. Move the profile out of the header (→ 7.7 — it does not
deserve that space).

### 7.2 — BLOCKER · Half your squad is invisible on the bracket because the opening round is never drawn

The bracket iterates `ROUNDS`, which for a 96-draw Masters starts at R64 (`BracketTree.tsx:58-64`,
`tournamentConfig.ts:157`). The opening round **is** parsed into the live store — I verified 32 R128
pairings sitting in localStorage key `gsgm-live-cincinnati_2026` — and is simply never rendered
(`tournamentConfig.ts:315-318`, `OPENING_ROUND = R128`).

With the harness's legal squad, **5 of 10 players (shang, monfils, kokkinakis, wolf, assche) appear nowhere
on the Bracket screen.** "Highlight team" highlighted 9 rows covering 5 distinct players out of 10, with
no explanation of where the rest went.

A manager opens the Bracket to find their players. Half are missing and the screen offers no sentence
saying why. The evidence doc notes that 12 of 96 Cincinnati entrants were out during the draft — those are
exactly the players this screen erases.

**Direction:** render the opening round as a real first column labelled "First Round" (not "R128" — → 7.4),
greyed to signal it is not scored. At minimum, an explicit strip above the bracket naming the players who
lost before the scored draw began.

### 7.3 — BLOCKER · The player page can never tell you a player is eliminated — the badge is dead code

`PlayerPage.tsx:38-39` computes `revealed = ROUNDS.slice(0, currentRoundIndex)`. `currentRoundIndex` is
initialised to 0 and only ever advanced by `playRound` (`gameStore.ts:510`), the manual step that never runs
at a live event — the codebase says so itself at `App.tsx:47-48` and `tournament.ts:330-334` ("FROZEN AT 0
in production"). So `revealed` is always `[]`, `isPlayerOut` computes `deepest = -1`, and `stage <= -1` is
false for everyone. **The ELIMINATED badge at `:85-89` cannot render.**

Verified in the running app: Alejandro Tabilo, shown as "OUT · R32" on the Team page, the bench and Home,
has a player page with **no elimination state at all** — and its head-to-head banner reads "🎾 Met at
Cincinnati Open 2026 · Round of 64 — Tabilo won."

This is the one screen dedicated to a single player and the only screen in the app that cannot answer the
only live question about him. During the draft it shows already-eliminated players as fully alive with a
price and a form chart. Every other screen got this right; this one silently regressed to a variable the
whole codebase documents as unusable. *Root cause → 8.1.*

**Direction:** `isEliminated(p.id)` (`tournament.ts:321`) — the same call `SquadCourt`, `NextMove` and
`LeaguePage` already make — and subscribe the page to the live store (→ 7.9).

### 7.4 — MAJOR · "Is this player out, and when?" is computed four ways and printed with three labels

Four implementations of one question:
- `PlayerPage.tsx:39` — `isPlayerOut(p.id, [])`, always false
- `SquadCourt.tsx:197/251/335`, `NextMove.tsx:206`, `LeaguePage.tsx:47` — `isEliminated`
- `DraftPage.tsx:414` — `isUnpickable`
- `TeamPage.tsx:200-204` — its own composite of `getPlayerExit` + `tournamentStarted` + `isInLiveDraw`

The exit **label** is equally fragmented: `DraftPage.tsx:415` prints the raw `getPlayerExit` value,
`DraftPage.tsx:593` prints it with a `?? '1st rd'` fallback, `TeamPage.tsx:203` pipes it through
`roundShort()` (`:14`) which falls back to the raw id, and `SquadCourt.tsx:213` prints the raw value again.

Verified live: five squad members display **"OUT · R128"** on the Team page and "OUT R128" on Home — at a
96-draw event that has no Round of 128 and where the string "R128" appears in no rules text anywhere in the
app.

Elimination drives refunds, transfers, captain validity and the market. Four answers is four chances to
disagree during a live event.

**Direction:** one exported `isEliminated(id)` for the boolean and one `exitLabel(id)` for the human string,
mapping the opening round to "First round". The label function should never be able to emit a round id the
active tournament does not play.

### 7.5 — MAJOR · The bracket is a 1068×2110px canvas on a 375px phone with no orientation aids

Measured live: container `clientWidth` 351 / `scrollWidth` 1068 (3.0 screens across), `clientHeight` 2110
(2.6 screens down), total page 2808px. Every column is forced to 2106px by `items-stretch`, so **the Final
is one 59px card at pageY 1318 / xTrack 908, floating in ~2100px of white space.** Round headers all sit at
pageY 651 and are **not sticky** — past the first screenful, nothing labels the column you are looking at.
My own squad's 9 highlighted rows spanned pageY 670→2256 across three horizontal positions. No zoom, no
minimap, no round switcher, no "jump to my players", and no scroll affordance on the horizontal axis.

Two-axis scrolling with no landmarks is the classic way to make a phone user give up. Everything here is
well-built and none of it is usable at the size it will actually be used.

Compounding it: the "How points are scored" panel is gated on `phase !== 'draft'` (`TournamentPage.tsx:34`)
— so **the clearest explanation of scoring in the product is switched off during the one phase where the
decisions are hardest**, and shown only to people who can no longer act on it. Verified with `?ux=empty`:
`hasScoring:false`. At the same time the page's intro promises "you can highlight any team's players and
trace their route to the final" (`:41`) while the highlight control only renders when `teams.length > 0`
(`BracketTree.tsx:69`) — `hasHighlight:false` for a pre-draft manager. **The first thing a brand-new user
reads on this page describes a feature they cannot see.**

**Direction:** phone-first, do not shrink the desktop tree. Default to **one round column at full width**
with a round pager (‹ R32 ›), a sticky round header, and a "my players only" toggle that filters to the
5–10 matches that concern this manager. Keep the current tree for ≥768px — it is good. Ungate the scoring
panel and make the intro state-aware.

### 7.6 — MAJOR · In the bracket, tapping a player does something different from everywhere else — and there is no route to a player page

Every other surface answers a tap on a player by opening their profile. The bracket answers by toggling a
path trace (`BracketTree.tsx:32-35, 168-211`) and **offers no route to the player page at all.** The tap
target is a bare `<div onClick>` with no role, no tabIndex and no keyboard handler, measured **28px × 166px**,
with 126 of them stacked 1px apart.

28px is well under the 44px minimum and the two players of a match are adjacent — on a phone you will
routinely trace the wrong man. And the screen where you are watching a live match is the one screen that can
tell you nothing about the players in it: no rank context beyond the "#n", no form, no price, no "is he
mine".

**Direction:** make each side a real 44px-min button with role and keyboard support. Short tap traces;
chevron or long-press opens the profile — or a small sheet offering both, so the two intents stop competing.

### 7.7 — MAJOR · "Who do they play next" is structurally impossible, and the correct helper sits unused

`PlayerPage`'s `nextOppId` loops `getOpponentId` from `currentRoundIndex` (=0, frozen) (`:40-48, :189`).
`getOpponentId` reads `activeMatches()` = `liveMatches(draw, results)`, and `liveResults.ts:53` does
`if (!winnerId) continue;` — dropping every undecided match. **The function therefore CANNOT return a
future opponent**; starting at index 0 it returns the first opponent already beaten.

Verified live during R32: Flavio Cobolli's head-to-head defaults to #66 Miomir Kecmanovic (beaten in R64)
while his actual next match — R16 vs #11 Rafael Jodar, already in the draw — appears nowhere on the page.
Zverev's defaults to Norrie, same story.

**The correct function, `liveOpponent(draw, id, round)`, exists at `liveResults.ts:89`, is unit-tested at
`src/__tests__/liveResults.test.ts:60-63, and is called by no production code.**

"Who does he play next, and can he beat them" is the single most valuable thing a fantasy tennis app can put
on a player page, and the code comment at `PlayerPage.tsx:40-41` claims that is what it does. It does the
exact opposite — surfacing a match from the past and presenting it as the comparison that matters.

**Direction:** use `liveOpponent` against the undecided draw, walking forward from the live round. Then
promote it out of the head-to-head selector into a first-class "Next match" line in the hero: round,
opponent, opponent's rank, scheduled time.

### 7.8 — MAJOR · The player page has no action and no squad context — it is a dead end at the moment of decision

The page you open to decide whether to spend $18M contains **no buy button, no cash-in, no "already in your
squad" marker, no "you have $7M — you cannot afford this", and no points-this-tournament** (whole file, 279
lines). Its only exit is "‹ Market". And the Market's search, sort and tier filter are component-local
`useState` (`DraftPage.tsx:33-35`), destroyed when the tab unmounts — **so returning drops you at the top of
an unfiltered 96-row table.** Comparing three players costs three re-searches (5 taps plus retyping, no
side-by-side). There is no browser history, so a back-swipe leaves the app.

The evidence shows managers saving 23 and 10 times against unfinished squads — people re-reading screens
hunting for information. **This screen is where they would hunt, and it will not tell them whether they can
afford the player, whether they already own him, or let them act.** `51face7f`, $4M from a dead end, could
have opened this page and learned nothing about their own constraint.

**Direction:** a sticky footer bar carrying the live decision — tier + price, your remaining budget, your
count for that tier, and one primary action ("Add — $18M" / "Already in your squad" / "Can't afford — $11M
short" / "Out of the tournament"). And persist the market's search/sort/filter in the store so "‹ Market"
returns you where you were.

### 7.9 — MAJOR · The player page never updates while a match is being played

`PlayerPage` subscribes to `gameStore` only (`:27`). It prints elimination state, next opponent and the
in-tournament meeting banner (`:204-206`), all of which read the live store outside React. The feed merges
every 5 minutes; **the page will not notice.** Both `DraftPage.tsx:48-51` and `TournamentPage.tsx:18-22`
explicitly subscribe to draw/results with a comment explaining that this is required. `PlayerPage` was never
given the same treatment. *Same fault → 5.8 (`TeamPage`, `SquadCourt`).*

### 7.10 — MAJOR · Your own total on My Team is computed differently from your total everywhere else

`TeamPage.tsx:33` always computes locally for your own team, while `:54` uses `entry.score` for a rival and
the League table uses the server value. **Your own row is the only score in the app derived differently from
every other score, including your own rival-facing one.** *Merged with → 4.3 / 8.4.*

### 7.11 — MAJOR · Head-to-head leads with the wrong surface and hides behind a 95-item native picker

Verified live on Zverev's page at a hard-court event: the comparison table's **first row is GRASS WIN %**
("86% GRASS WIN % 52%") sitting above the hard-court row (`PlayerPage.tsx:209-216`). The `SurfaceBar`
directly above it correctly highlights `TOURNAMENT.surface` (`:129`); the H2H below it hardcodes
grass→hard→clay. Lines `:214-215` also hardcode the label "2026" while the rest of the page uses `statsYr =
p.statsYear ?? 2026` (`:54`). The opponent picker measures 102×33px (below 44px, and it truncates names)
with **95 options and no search** (`:228-240`).

Two screens' worth of surface logic on one page disagreeing about which surface matters is the sort of thing
that makes a knowledgeable tennis fan stop believing the numbers.

**Direction:** sort the H2H rows by relevance — active surface first, always. Drive the year label off
`statsYr`. Replace the select with a searchable sheet defaulted to the real next opponent (7.7), offering
"players in your squad" as a shortcut — comparing two of your own picks is the actual use case.

### 7.12 — MAJOR · "–" and "·" are never explained, and a match in progress looks identical to a loss

*Merged with → 4.4.* `TeamPage.tsx:258-262` renders `c == null ? '·' : c === 0 ? '–' : score`, and the
legend (`:214-217`) explains neither symbol.

### 7.13 — MINOR · The profile holds nothing you need mid-game, and its one piece of copy is wrong

The profile contains username, email, country, optional names, a link to your team, change password and sign
out. **Nothing about the game**: no transfers used (2 of 3 is decision-critical and lives nowhere here), no
rules link, no leagues, no notification settings, no tournament switcher (that is at the foot of Home). The
completeness banner says the required fields "will be needed to join the live league" (`UserProfile.tsx:75-78`)
— shown to someone who has already joined and is mid-tournament, and nothing is actually gated on them.
"Your team" (`:109-119`) shows the name and emblem but will not let you change either. The trigger is a 44×44
unlabeled person glyph at x=311, visually identical to the "?" beside it — **and it occupies exactly the
header width that is squeezing the Bracket tab off the screen (7.1).**

**Direction:** either make it a real "You" screen (team identity editable inline, transfers remaining, your
leagues, rules, tournament switcher, sign out) or demote it out of the header and give the space back to
navigation. Fix the banner copy to say what actually breaks — and if nothing breaks, delete it.

### 7.14 — MINOR · The Team page's only exit is "‹ League", wherever you came from

`BackToLeague` is hardcoded (`TeamPage.tsx:18-25`), while `openPlayer` records `playerReturnTab`
(`gameStore.ts:540-544`) and `openTeam` records nothing (`:538`). Tapping your own team name on Home's court
(`HomePage.tsx:118`) lands you on a page whose only way out says "League". With no browser back and
`sanitizeState` (`gameStore.ts:85`) throwing you to Home on reload, **this one link IS the navigation, and it
teleports people to a screen they never visited.** The correct pattern exists ten lines away in the same
file.

### 7.15 — MINOR · The squad-at-round walk is implemented twice with different index bases

`TeamPage.tsx:186-191` (`squadAt`, `ROUNDS.findIndex`) vs `tournament.ts:250-255` (`liveScoreBreakdown`,
`ROUND_ORDER.indexOf`). Today they agree — including for a transfer logged against `OPENING_ROUND`
(`gameStore.ts:344`), where -1 and 0 happen to yield the same result. **They agree by coincidence, not by
construction.** The table is the user's explanation of their own score; if these diverge it will contradict
the total above it, silently.

**Direction:** export `squadAtRound(initialSquad, transfers, round)` once and have both call it.

### 7.16 — MINOR · Player-page copy repeats itself and reads like a template

Verified live on Tabilo: the hero reads "#29 ATP · Seed 22 · Left-handed Clay-court grinder" (`:99`) and the
bio immediately under reads "Alejandro is a left-handed clay-court grinder from Chile… At 29 and
left-handed…" (`:58-62`). Left-handed three times in two lines; the style string repeated verbatim. The
quick-facts grid shows "#29 Rank" beside "29 Age" (`:112-118`). And at a hard-court event, Cobolli's hero
describes him as a "Grass-court threat".

This is the app's most editorial surface — where a manager who does not follow tennis forms an impression —
and it reads as generated filler, which undercuts the excellent price panel below it.

---

## Journey 8 — Underneath it all: structure, state and performance

This section is for the engineer, not the user. It is where the faults above come from.

### What works

- **`src/data/tournament.ts` is the right idea, well executed.** `liveScore`, `liveBudget`,
  `transferWindowOpen`, `playerRefund` and `liveRoundStatus` each exist once, are pure over
  `(draw, results)`, and are mirrored by the server engine. **That is why the live half of this app is
  correct. Do not refactor this module** — the problems are all in the code that fails to use it.
- **`entryValidation.ts` as a single client+server rule mirror**, with a comment ordering the SQL to stay
  identical. Correct shape for a competitive game.
- **`NextMove`'s `buildView` (`:120`)** — one phase-aware coach, pure, testable, driven entirely from real
  state rather than conditionals scattered across pages. Its content has bugs; the container is right.
- **`SquadCourt` as one shared renderer** for your squad, a rival's, and the Team page. The court is the
  product's identity and there is one of it.
- **`CloudSync`'s runaway-save defence** (`:88-96, 216-230`) and **`useVisiblePoll`'s jitter plus
  hidden-tab pause** (`hooks.ts:11-31`) are real engineering discipline.
- **The new `SquadProgress` panel** is the correct response to the evidence. It just needs to be on Home
  too, and to read the same budget as everything else (→ 2.3).

### 8.1 — BLOCKER · Two tournament models coexist; the turn-based one is frozen at zero and still drives live UI

The store still carries a turn-based model — `currentRoundIndex`, `myScore`, `roundScores`,
`budgetReturns`, phase `'round_complete'`/`'finished'` — advanced only by `playNextRound` (`gameStore.ts:443`)
and `continueToNextRound` (`:520`). **Neither is called from any component.** I read live staging
localStorage: `currentRoundIndex` is 0 while `gsgm-live` holds **73 recorded results across an 85-match
draw.**

So the model that says "nothing has happened" is still wired into screens, alongside the results-derived
model that knows R32 is underway. **Every file in `src/` carries a comment apologising for this** — "the
frozen currentRoundIndex", "the never-run manual play-round flow", "pinned at 0 in production" — nine such
comments across six files.

This is the single biggest structural problem in the app, and it is the root cause of 7.3, 7.7, 8.2 and part
of 8.4. Every new screen must independently remember which of two contradictory clocks to read, **and the
wrong choice fails silently — the code compiles, renders, and lies.** It is also why the codebase reads as
defensive: the comments are load-bearing, which means the next change made without reading them is a bug.

**Direction:** delete the turn-based model. Remove `playNextRound`, `continueToNextRound`, `myScore`,
`roundScores`, `budgetReturns` and `currentRoundIndex` from `GameStore` and from `partialize`/`gameSnapshot`;
keep `phase` only as the draft/entered boolean it actually is (or replace it with `initialSquad.length > 0`).
Every remaining consumer then has exactly one source for "where is the tournament". **This is subtraction,
not new work.**

### 8.2 — BLOCKER · The "never field an eliminated captain" guard is inert, so a dead captain keeps the armband all tournament

`pickLeaders` decides eligibility with `isPlayerOut(id, revealed)`, where `revealed = ROUNDS.slice(0,
currentRoundIndex)` (`gameStore.ts:26, :30`). `currentRoundIndex` is 0, so `revealed` is `[]`, so
`isPlayerOut` (`tournament.ts:358-366`) returns false for every player alive or dead. **The filter is a
no-op.**

`sanitizeState` runs this on **every** hydration path — localStorage rehydrate, version migrate, and the
cloud restore at `CloudSync.tsx:174` (`gameStore.ts:126-129`) — so a restored entry keeps an eliminated
captain and the auto-fill will happily promote another eliminated player into an empty slot. Meanwhile
`setCaptain`, three lines of the same file away (`:246, :260`), correctly uses `isEliminated`.

Carry-forward scoring (`tournament.ts:204`) keeps the last-set captain in force for every subsequent round.
**So a manager whose captain goes out, who then reloads or opens the app on another device, silently
forfeits the ×2 slot for the rest of the event.** `NextMove.tsx:210` correctly reports "your captain is
out" — but the mechanism meant to repair it cannot.

**Direction:** change `pickLeaders` to take no `revealed` argument and use `isEliminated(id)`. Drop
`isPlayerOut` from `gameStore` entirely.

### 8.3 — BLOCKER · Home renders three simultaneous, contradictory answers to "am I done?", two of them green

*The user-facing half of this is 3.1.* Mechanically: `HomePage.tsx:93-100` (Squad stat card), `SaveButton.tsx:30`
via `SquadCourt.tsx:164-169`, and `NextMove.tsx:150` each answer a different question with the same visual
vocabulary of green-and-a-tick. "Saved" means your bytes reached Supabase. "Ready ✓" means your composition is
legal. **Neither means you are entered**, and the one that determines whether you score is the quietest.

Worse, `NextMove.tsx:125-135` never inspects `myTeam`, so a manager with 10 legal players who never locked is
told: *"DRAFT CLOSED — Cincinnati Open is already underway. Drafting for this event has closed — but you're
all set to play the next one."* **The product's own coach tells 88f692fa that nothing went wrong and invites
them to spectate.** The same branch fires for `32828145`, whose squad is mathematically unfinishable.

**Direction:** one component owns "entry status" and the other two say nothing about it. Reserve green for
"you are entered and will score"; render "Saved" as neutral plumbing. Split the `NextMove` branch on
`myTeam.length > 0` and name it plainly: **"Your squad was never entered, so it scored nothing this week."**
A product that hides its own failure from the person it happened to cannot be trusted with the next one.

### 8.4 — MAJOR · The same total is computed in four places, and a fifth surface uses a different source

`App.tsx:50-54`, `HomePage.tsx:34-37`, `TournamentPage.tsx:19-23` and `TeamPage.tsx:33` each compute the
manager's total via `liveScore`/`liveScoreBreakdown` with their own memo deps and their own render triggers;
`leagueBoard.ts:107` renders the server's number for the same quantity. There is no `useMyScore()`. The four
agree by construction but not by timing; the fifth is a different number by design. **This is 4.3 / 6.10 /
7.10 seen from underneath.**

The maintenance cost is the other half: the multiplier, the transfer-application rule and the captain-of-record
rule are flagged parity-critical against `serverEngine.ts` and `recompute-score/index.ts`, and a change now
has to be chased across four client call sites plus two server ones before anyone can tell whether the numbers
agree.

**Direction:** one hook — `useMyScore()` returning `{ server, local, stale, lastSync }` — rendered everywhere.
It collapses four call sites, gives the freshness work from 4.1 a home, and turns a contradiction you ship into
a value you can display.

### 8.5 — MAJOR · "Buys" on the league table and "transfers left" in the Market count different things

`transfersUsed` (`tournament.ts:433`) deliberately exempts repairs of opening-round casualties. The Market
honours that (`DraftPage.tsx:81`). **The league standings table does not** — `LeaguePage.tsx:103` prints the
raw `row.transfers.length`. A manager who made one free repair and two real transfers sees "3" in Buys while
the Market says 1 of 3 left. A rival's row also overstates how many moves they have burned, which is genuinely
strategic information in a game with a hard cap of three.

**Direction:** `transfersUsed(row.transfers)`, and label the column "Transfers" to match the vocabulary the
Market and the rules use.

### 8.6 — MAJOR · Five components describe the same squad rule in five different vocabularies

The same constraint — 2 Platinum, 3 Gold, 5 Silver — renders as:

| Where | What it says |
|---|---|
| `HomePage.tsx:97` | "Check tiers" — says nothing at all |
| `DraftPage.tsx:673-675` | "Need 1 Platinum, 2 Silver" |
| `DraftPage.tsx:315-319` | a chip row: "2/2 ✓ 0/3 8/5" |
| `SquadProgress.tsx:88` | "You need 3 Gold. The cheapest way to finish costs $47M of your $0.0M" |
| `NextMove.tsx:148` | "2 from the top 10 · 3 ranked 11–25 · 5 ranked 26+" — abandons the tier names entirely |

A new manager has to learn that "Platinum" and "the top 10" are the same idea, and that "Check tiers" and
"Need 1 Platinum" are the same message at different fidelities. **"Check tiers" is the worst of the five and
sits on the landing screen: it tells a manager something is wrong and refuses to say what.** This is not five
features; it is one sentence written five times by five different hands.

**Direction:** one helper produces the sentence. `squadShortfall` already exists and already returns the data;
give it a `describeShortfall()` companion every surface calls. Choose one vocabulary — tier names, since they
are what the market filters by — and never mention rank bands outside the rules.

### 8.7 — MAJOR · Re-render storm: whole-store subscriptions layered over unmemoized draw-wide derivations

Four things compound:

1. `HomePage.tsx:22-26`, `DraftPage.tsx:32` and `SquadCourt.tsx:27` call `useGameStore()` **with no
   selector**, so any write anywhere re-renders all three.
2. `BracketTree.tsx:16` and `AdminPage.tsx:42` call `useLiveStore()` with no selector, including `lastSync`,
   which `liveStore.ts:98` rewrites on every 5-minute poll whether or not anything changed; `setDraw`/
   `mergeResults` return fresh identities every poll regardless.
3. `useLeagueBoard` rebuilds `cloudRows` and re-sorts on every consumer render (`leagueBoard.ts:75-112`),
   calling `liveBudget` per manager; `liveBudget` → `playerRefund` → `openingRoundExit` scans the whole draw.
4. `liveScore` is ~70 calls to `getMatchesForRound`, and `getMatchesForRound` (`tournament.ts:35 → :23-27 →
   liveResults.ts:49-64`) **rebuilds the entire match array from scratch on every single call.**

I measured **17.3ms of synchronous work for one sort-button tap** on a Market showing only 23 rows.
Pre-tournament that table is 96 rows. Add the 1 Hz `NextMove` recomputation (→ 4.11) and the per-row board
scans (→ 6.18).

On a phone this is the difference between a game that feels live and one that feels laggy, and it gets worse
exactly when it matters most. It is also load-bearing on **correctness**: because the derivations are
imperative, every consumer must hand-maintain fake memo deps (8 `eslint-disable react-hooks/exhaustive-deps`
in `src/`, six in `DraftPage` alone) — and `TeamPage` already forgot (→ 5.8).

**Direction, in order of payoff:** memoize `activeMatches()` on `(draw, results)` identity inside
`tournament.ts` so every downstream helper gets it free; wrap `useLeagueBoard`'s board construction in
`useMemo`; replace the bare `useGameStore()` destructures with field selectors. **Do not reach for
virtualization first** — the table is not the bottleneck, the recomputation is.

### 8.8 — MAJOR · `HomePage` is a coherent home with three tenants who should not be there

`HomePage.tsx:70-224` renders, in one scroll: a read-only tournament banner, a title block with a status line,
three stat cards, the `NextMove` coach card, the court plus bench, a caption, a league-picker `<select>`, a
12-row leaderboard with a rank-gap sub-line and **two** separate "Full standings →" buttons, a tournament
switcher, and a welcome overlay. Measured at 375px: **1.6 screens tall, 458 DOM nodes — 258 inside the court
SVG and 222 of those `<circle>` crowd speckles** built by an inline `Array.from({length: 220}).map`
(`SquadCourt.tsx:91-101`) with no memo, in a component that re-renders on every game-store write and every
feed poll.

Asked directly: it is not a random dumping ground. The top half (status, stats, coach, court) is genuinely the
right Home — it answers "where am I, what do I own, what do I do next". **The bottom half is a second-class
copy of the League tab, complete with its own league picker** — which is why the tab exists. And the tournament
switcher, by the code's own comment, was moved here because it was crowding the header: furniture placement,
not information architecture.

**Direction:** cut Home to status + stats + coach + court, and replace the embedded leaderboard with a single
line — your rank, the gap to the manager above, one link to League. That is the emotional payload of a
leaderboard in one row, and it removes the duplicate picker. Move the tournament switcher into the profile
sheet. Hoist the 220 crowd circles into a module-level constant — they never change.

### 8.9 — MINOR · Dead modules and an uncalled store API still ship

- `src/data/rivals.ts` — 218 lines of AI-opponent scoring with no importer outside tests. **It also contains
  the affordability algorithm the humans need (→ 2.2), which is the one thing worth extracting before
  deleting.**
- `src/store/marketDraft.ts` — a complete unused store carrying a third definition of "Lock Squad" (→ 3.13).
- Six uncalled `gameStore` exports: `ensureLeaders` (`:284`), `eliminatedSquad` (`:605`),
  `selectCurrentRound`, `selectRoundMatches`, `selectEliminatedPlayers`, `selectActivePlayers` (`:618-629`).
  Three of the selectors are built on `isPlayerOut` and the frozen round index, so they are not merely unused
  — **they are wrong, and exported.** The next person who needs "who on my squad is out" will find
  `selectEliminatedPlayers` first and get a function that always returns `[]`.

### 8.10 — MINOR · Three destinations exist with no place in the navigation

`activeTab` is a seven-value union (`gameStore.ts:146`) — home, draft, tournament, team, league, player, admin
— but `TABS` declares four (`App.tsx:38-43`). Team, Player and Admin are reachable only by imperative store
calls. `sanitizeState:88` has to special-case this by coercing a persisted drill-down tab back to Home on
reload.

**Answering the brief's question directly:** four tabs is the right count and three of them are real places a
user thinks in — Home ("my team"), League ("my friends"), Bracket ("the tournament"). **"Market" is the odd
one, and it carries the most weight:** it is simultaneously the draft board and the in-play transfer desk, two
activities that never coexist and share almost no UI (`DraftPage` branches on `live` roughly forty times in 717
lines). Meanwhile the two screens users actually navigate to by tapping things — a team, a player — have no tab
and no consistent way back. **The nav is not an accident of growth so much as an under-modelled one: it names
four surfaces where the app really has three places and two drill-downs.**

**Direction:** keep four tabs, but model the drill-downs as a pushed detail layer with a consistent back
affordance rather than as tab values. And consider splitting `DraftPage`: "Draft" before the tournament and
"Transfers" during it are different products wearing one filename, and the branching is where 2.1, 3.7 and 5.6
are hiding.

---

## The five things that matter most

Ranked by: confirmed damage in production, how many other faults they cause, and how cheap the fix is relative
to what it saves.

### 1. Locking is how you enter, and the product never says so — while four things say you're finished

*Findings 3.1, 8.3, 1.5, 3.7, 6.3, 2.3.*

`88f692fa` built a perfect squad — ten players, exactly 2/3/5, every dollar spent, a captain, 23 saves — and
scored zero. This is the only fault in the audit with a confirmed production victim who did everything right,
and the app's response was four green ticks and a coach card telling them they were "all set". The sentence
that would have saved them is already written, at `SquadLockedModal.tsx:24`; it is just on the wrong side of
the door.

**It is ranked first because it is the highest cost per user in the whole product and the cheapest thing on
this list to fix.** Rename the button to what it does ("Enter my squad"), put the consequence in its subline
before the tap, make "Ready ✓" say "Not entered" until it is true, add the rule to `HowToPlay`, stop using
"Lock" for the cosmetic button, and show the un-entered state on the league board so friends can nudge. That
is a day of copy and three small state changes.

### 2. The draft never actually closes, so the app manufactures more of them

*Findings 2.1, 1.1, 3.6, 2.13.*

`draftClosed` is computed once and used once, 611 lines away, in a grey footer chip. Everything else — the
header, the buy buttons, the tier chips, the store's `addPlayer`, the court's `canEdit` — behaves as though
the draft is open. A stranger who signs up during a live event is told to draft, walked to the Market by the
tour, allowed to spend all $150M, and then quietly refused. **The countdown even deletes itself at the moment
it becomes terminal, so the screen gets quieter as the deadline expires.**

**Ranked second because it is a machine for producing #1, and it runs during the nine days an event is live —
exactly when the app gets shared.** It is also a second, un-eliminated explanation for 88f692fa: "they never
pressed Lock Squad" assumes the button was pressable. **Run this query before you design anything: do any of
the four zero-scorers have a last-save timestamp after the first Cincinnati result?**

### 3. The dead end you cannot see — and the algorithm you already wrote for the bots

*Findings 2.2, 2.4, 2.5, 3.11, 2.14.*

`32828145` is $19M inside an unfinishable squad. `51face7f` is $4M from the same wall. The cheapest legal
Cincinnati squad costs $106M of $150M, so "$150M to spend" is really "$44M of discretion" — and no screen ever
says so. Meanwhile `rivals.ts:61-75` contains `cheapestCompletion`, and `buildSquad` uses it to make it
*impossible* for the AI opponents to draft themselves into a dead end.

**The forward projection is written, commented, tested against 20k simulated tournaments, applied to the
computer opponents, and withheld from the customers.** And the copy under the Lock button says "at least 2
Platinum" when the code enforces exactly two — actively teaching the strategy that produced `51face7f`.

Ranked third because it accounts for two of the four zero-scorers and the fix is mostly *moving code you
already have*. `SquadProgress` has landed and is right; it now needs to be on Home, to use `liveBudget`, and
to gate the "+ Add" buttons the way the bots are gated.

### 4. One question, many answers — the bug factory

*Findings 8.1, 8.2, 8.4, 8.6, 7.4, 5.2, 2.7, 4.3.*

There are two tournament clocks in this app. One is derived from results and is correct; the other,
`currentRoundIndex`, is frozen at 0 in production and still wired into live screens. That single fact is why
the player page can never show a player as eliminated, why it offers a first-round opponent as "next", and why
the guard meant to stop you fielding a dead captain is a no-op that silently costs points across a device
switch.

Around it: **four ways to compute your score, four ways to ask if a player is out, five vocabularies for the
tier rule, two transfer engines with different guard sets, two budget functions, two tier-status state
machines that already disagree on screen.**

**Ranked fourth rather than first because it is invisible to users today — but it is why fixes will not stick.**
Every one of the first three problems has to be fixed in three or four places, and whichever one you miss is
the one a manager will be looking at. The largest single win here is subtraction: delete the turn-based model.
That one deletion fixes 7.3, 7.7 and 8.2 for free.

### 5. Nothing gets in, and nothing gets out — the social loop is broken end to end

*Findings 1.2, 6.1, 6.3, 1.3, 1.11, 6.2.*

The invite code is stashed in `sessionStorage` and destroyed by the email-verification tab, so **every invited
friend who signs up fresh — the entire acquisition path — silently lands outside the league they were invited
to.** Private leagues then close entirely the moment play starts, so for the ~10 days an event is exciting
nobody can create, join, or even *see their own invite code* — and the confetti moment's primary button routes
straight into that dead paragraph. Signed-out visitors can see nothing at all, and shared links render as a
naked URL because there are no og tags.

And the one social mechanism that would have caught 88f692fa — a friend noticing on the league board — was
structurally blind: `phase` survives the redaction, `boardRow` never reads it, and the budget column
**fabricates "$150.0M to spend" for a manager who had spent every dollar.**

**Ranked fifth only because it costs you future users rather than the eight you have.** But note what it means
for the evidence: half your managers scored zero in a league where their friends could not see it happening.

---

### One thing that is not on the list but is on every screen

**The nav.** Four tabs live in a 165px-wide horizontally-scrolling strip at the *top* of a phone, with the
scrollbar hidden. Measured: 49px of it never fits, so **one of the four tabs is always off-screen**, and which
one depends on where the strip happens to be scrolled. Meanwhile the single control that decides whether you
score sits 980px down a static page.

Neither of those is a strategy problem. Both are the reason a manager cannot find the thing you built.

---

*Audit compiled 2026-08-18. All measurements taken at 375×812 against the live Cincinnati build. Every finding
carries a file and line so it can be acted on.*
