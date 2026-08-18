# Grand Slam GM — UX Research for the Redesign

Research date: 18 August 2026. Products studied: Fantasy Premier League, DraftKings, Sorare,
the ATP/WTA official app, Strava, Duolingo, Robinhood. Design-system practice: Apple Human
Interface Guidelines, Material Design, WCAG 2.2 AA. Grounded against the live codebase at
`C:/Users/marti/tennis-fantasy`.

**How to read this.** Organised by your five questions, plus a sixth section of hard build
constraints. Every pattern says what it is, who does it, why it works, whether it transfers to a
10-player tennis draft with a 2/3/5 tier quota, and what it means for *this* app specifically.
Section 7 is the rejected list you asked for. Section 8 lists everything I could not verify.

**Confidence key.** Used inline throughout:

| Mark | Meaning |
|---|---|
| **[verified]** | Read the primary source, or measured it in this repo, myself |
| **[likely]** | Consistent across several independent secondary sources, no primary confirmation |
| **[unverified]** | Widely repeated but I could not trace it to a source that would survive scrutiny. Do not quote in a deck. |

---

## Two corrections before anything else

Both change the answer, so they go first.

### Correction 1 — "FPL defers account creation until after the squad is picked" is false

The brief used this as its model of a good, specific pattern claim. It is not true. Per the
Premier League's own registration guide, the flow is: fantasy.premierleague.com → Register Now →
Join MyPL → email → an "About me" page (password, name, date of birth, country) → Create an
account → an emailed verification code → *then* the game → *then* pick a squad. **[verified]**
FPL is the **strictest** signup wall of the products studied, not the loosest. It gets away with
it because 11m+ people arrive already intending to play, and because an annual seasonal deadline
manufactures its own urgency. Grand Slam GM has neither.

Do not build toward that premise. The real FPL lessons for first-run friction sit *downstream* of
registration — the guided squad builder and Auto Pick, both covered in Section 1.

### Correction 2 — Grand Slam GM has no bottom navigation bar today

The brief says "Bottom nav today: Home, League, Market, Bracket." In fact those four tabs render
inside a `sticky top-0` navy header, in a horizontally-scrollable row (`overflow-x-auto
no-scrollbar`) sharing a 64px band with the logo, a "?" button and a profile button
(`src/App.tsx:210–254`). **[verified]** There is no `env(safe-area-inset-bottom)` anywhere in
`src/`, and `index.html` line 6 has no `viewport-fit=cover`. **[verified]**

This matters because it changes the priority order. On a phone-first product, the most-tapped
controls are currently sitting in the least reachable band of the screen, behind a silent
horizontal-scroll overflow. Moving them is the cheapest large win available, and it is a
prerequisite for several other recommendations.

---

## 1. From "what is this" to "I have a team"

**The headline finding: never show a first-timer ten empty slots.**

Not one of the five products makes a beginner construct a constrained roster from zero. FPL
generates a legal squad from three preference questions and lets you edit it. Sorare hands you a
free starter pack so your first lineup is an *edit*, not a *creation*. Grand Slam GM currently
renders ten empty slots (`src/pages/DraftPage.tsx:566`) and asks the manager to satisfy — by
tapping, on a phone — exactly 2 Platinum, 3 Gold and 5 Silver under a $150M cap. That is a
constraint a newcomer cannot hold in their head, let alone solve.

The deferred-signup pattern is famous, but it is **not** this app's biggest lever. The expensive
step here is not the account. It is assembling a legal entry.

### 1.1 Guided squad builder — three questions produce a legal squad you then edit

**ADOPT — the strongest single borrow in the whole document.**

**What / who.** New for FPL 2026/27: opening Squad Selection asks "would you like help picking
your team?". "Yes, help me out" asks exactly three questions — (1) if you set a favourite club, do
you want some of their players; (2) a strong 15-man squad for rotation cover, or a cheap bench and
an expensive starting XI; (3) any preference on how the budget splits between attack and defence.
"Generate team" produces the squad. You can regenerate unlimited times, remove individual players
and reallocate the freed funds, or hit Reset for a blank slate. Experienced managers skip the whole
thing. **[verified]** The strings are also visible in FPL's production bundle
(`autoPickChoiceTitle`, `budgetAllocationChoice.balancedSpend` / `.strongStartingXI`,
`preferFavouriteTeam`, `positionFocus`). **[verified]**

**Why it works.** It converts a constrained-optimisation problem into a preference question plus an
editing task. Editing a wrong squad is enormously cheaper than constructing a right one, because
every intermediate state is already legal — you are never stuck holding nine players, $3M and no
eligible Silver. Regenerate makes it non-committal. Reset makes it non-trapping. The opt-out means
it never taxes people who don't need it. Critically, the questions are about **strategy**, not
identity — the answers teach the game's levers while collecting them.

**Implication for Grand Slam GM.** The tennis translation is obvious and near-direct:

1. A favourite player or country you want in the squad.
2. Two galácticos with bargain support, or a deeper balanced squad — already the exact framing in
   `HowToPlay.tsx`'s "Draft 10 players" card.
3. Chalk, or hunt upsets — which maps straight onto the existing upset multiplier.

Generate a valid 2/3/5 under $150M, show the freed budget as the manager swaps individuals, and
**seed a captain and vice-captain too** — `DraftPage.tsx:629` already treats a squad without both
as incomplete, so a generator that skips them hands back an incomplete squad. Rule for scoping the
questions: *ask a question only if a wrong answer would produce a visibly different squad.* That
admits about three and rejects the rest.

### 1.2 Auto Pick as a permanent one-tap escape hatch, with quality filtering

**ADOPT.**

**What / who.** FPL's long-standing "Auto Pick" fills every empty slot with a legal squad
instantly. For 2026/27 the algorithm was improved to filter out players least likely to actually
start matches. Variants include "Auto Pick Again" and "Auto Pick With Tutorial", and availability
is governed by a selector that is true when the squad is *incomplete but not over budget and not
over the club limit* — i.e. it completes a legal partial squad rather than only generating from
scratch. When it can't, it fails in the currency of the constraint: "Unable to Auto Pick — no
available players within budget". Sorare's equivalents are "Suggest Lineup" / "Scout {position}"
and "You do not have enough budget remaining to auto complete a team". **[verified]**

**Why it works.** It is always available, not just at onboarding, so a half-built squad is never a
dead end. The quality filter matters more than the speed — a naive auto-pick that hands you players
who won't take the court teaches the beginner that the button is a trap. And a failure phrased as
"no players within budget" *teaches the constraint*: it tells you the shape of the problem, so the
next action is obvious.

**Implication for Grand Slam GM.** Build "Fill the rest" — respects picks already made, honours
2/3/5, spends within remaining budget, undoable, and the picks stay visibly attributable to the
manager. The tennis-specific quality filter is the interesting part, and the app already knows the
ingredients: exclude withdrawn players; exclude anyone already eliminated (`DraftPage.tsx:370`
records a past incident where 12 eliminated players were selectable); and at a Masters, be careful
with the unscored opening round `HowToPlay.tsx` describes — an unseeded player must win a match
that pays nothing just to reach the start line, so loading up on unseeded Silvers is a bad squad by
construction. This is not a beginner-only feature: it is also the fix for a manager who has cashed
in three players mid-tournament and is staring at open slots.

### 1.3 Endowed starter inventory — the first artefact is an edit, never a creation

**ADAPT.**

**What / who.** Sorare hands new managers a free starter pack of Common cards. Sorare's own help
centre: the cards "can instantly be used in either Daily or Biweekly Common competitions to get a
feel for the game and win rewards", and "allow you to explore the game and enter a team in the
Casual League. This League is dedicated to new Managers." No wallet, no deposit, no purchase to
field a first lineup. **[verified — via search snippets of Sorare's help centre; direct fetch
returned 403]**

**Why it works.** Mechanically it guarantees a legal lineup is reachable on day one without money
or market knowledge. Psychologically it is the *endowed progress effect*: Nunes & Drèze (Journal of
Consumer Research, 2006) split ~300 car-wash customers between an 8-stamp card and a 10-stamp card
pre-stamped twice — identical remaining effort — and completion over nine months was 19% vs 34%.
Artificial advancement toward a goal nearly doubled persistence. **[verified]**

**Implication for Grand Slam GM.** When a first-timer opens the Market they should already hold a
complete, legal, house-picked squad — call it the scout's squad — with captain and vice set, a few
million of headroom, and a visible invitation to change any of it. Note the convergence: this is
the same insight as FPL's generated squad arrived at from the opposite direction, which is the
strongest signal in this section.

**One thing NOT to copy:** Sorare's Common cards score only 50% of standard points — the starter
inventory is deliberately inferior. Don't do that. In a single-tournament game where the draft
largely decides your result, a handicapped starter squad sours the first session rather than
seeding it. (Exact starter card counts differ across write-ups — 5, 12, 25 for MLB — so treat any
specific number as **[unverified]**; the pattern itself is verified from Sorare's own docs.)

### 1.4 The first commitment is reversible until a hard deadline

**ADOPT — and this is mostly a copy change, not an engineering one.**

**What / who.** FPL's "Enter Squad" finalises the team, but unlimited free transfers remain
available right up to the Gameweek 1 deadline. The first squad is a draft with a countdown, not a
decision. **[verified]**

**Why it works.** It removes the fear that makes a first-timer stall on the last tap. The
commitment moment moves from *an act the user performs* to *a time the clock reaches*, which is far
easier to accept — nobody feels they made a mistake when a deadline passed.

**Implication for Grand Slam GM.** The mechanic already exists: `DraftPage.tsx` genuinely locks the
squad when the first round starts, with a Countdown reading "Draft closes when the first round
starts", and the "Lock Squad" control at line 673 is described in the code comments as an
*optional* early finalize. But the button reads "Lock Squad →" and fires a modal called
`SquadLockedModal` — so the loudest, most final-sounding control on the page is the one thing that
isn't actually final. Rename toward FPL's framing: primary action becomes "Enter squad" / "You're
in", with a persistent calm line saying changes are free until the first ball. Keep explicit early
lock as a secondary option for managers who want the undo controls out of the way.

### 1.5 The first session ends in an ENTRY, not a save

**ADOPT.** **[likely — synthesis across five products]**

**What / who.** Every one of the five terminates session one with the user *occupying a position*
in something shared or persistent: a completed lesson and a streak of 1 (Duolingo); a squad entered
into the overall table (FPL); a lineup in the Casual League (Sorare); a contest entered — free
contests with cash prizes exist precisely so the first entry costs nothing (DraftKings); an
approved account holding a granted share (Robinhood).

**Why it works.** A saved artefact has no next moment. An entered artefact has a *result arriving*,
which is the actual reason to reopen the app. It also gives the user a one-sentence answer to "what
did I just do" — the sentence they repeat to a friend.

**Implication for Grand Slam GM.** The public global board already exists (`LeaguePage.tsx:120`,
"The public global board") and `SquadLockedModal` already carries a private-league viral prompt.
The gap is the terminal state: today it is a locked-squad confirmation, i.e. a save. Change it to a
placement — *"You're in. 47th of 312 in the Cincinnati public league. First ball Tuesday 11:00."*
— with the private-league invite as the secondary action it already is.

**Related timing bug to fix while you're there:** `TournamentWelcome.tsx` fires confetti on
**joining**, before a squad exists. Celebration attached to an empty state teaches the manager that
the app celebrates nothing. Move it to the completed entry, where `SquadLockedModal` already sits.

### 1.6 A public, unauthenticated read surface with a non-blocking signup CTA

**ADOPT — cheapest big win, because the content already exists.**

**What / who.** `robinhood.com/us/en/stocks/AAPL` is fully readable with no account: live price,
chart with timeframe switching, market cap, P/E, dividend yield, 52-week range, analyst-rating
breakdown, news. A "Sign up and join over 25 million investors" banner and a "Sign Up to Buy"
button sit *in the page flow*. Neither obstructs the content. **[verified — fetched anonymously
myself]**

**Why it works.** The signup ask is attached to the one action that genuinely requires an account
(buying); everything else is free. It separates "what is this" from "I am now a customer" — exactly
the separation a first-time user needs — and it makes every page a shareable, indexable entry point
rather than a redirect to a login form.

**Implication for Grand Slam GM.** Make three things publicly readable at a URL: a player page
(`PlayerPage.tsx`), a league leaderboard, and a manager's squad. The acute case is the private-league
invite: `App.tsx:88–95` stashes a `?join` code in sessionStorage and then `App.tsx:143` drops the
visitor on `AuthScreen`. A friend clicking "come play me at Cincinnati" currently sees a login form
and learns nothing about the league, who's in it, or what the game is. They should see the league
table, the tournament and the friend's squad, with "Draft your squad" as the CTA.

### 1.7 Deferred signup — the soft wall after the first completed artefact

**ADAPT, with two hard preconditions.**

**What / who.** Duolingo moved its sign-up screen back several steps so a user completes a full
lesson before being asked to register; later refined into a dismissible "soft wall" followed by a
blocking "hard wall". Gina Gotthilf, then VP Growth at Duolingo, in First Round Review: "Simply
moving the sign-up screen back a few steps led to about a 20% increase in DAUs", with a further
"8.2% increase in DAUs" from later soft/hard-wall tuning about three years on. **[verified — quotes
read verbatim]** These are two of only three named, attributable numbers in this entire document.

**Why it works.** Loss of accumulated effort. Abandoning at the wall now costs you something you
made.

**Implication for Grand Slam GM.** A legal squad is fully computable client-side — the count, the
budget and the quota are pure arithmetic over a player list. So the whole draft can happen before
any account exists, and the wall goes on the *irreversible* act: entering the public leaderboard or
joining a private league. This is a real change to `App.tsx:143`, which today returns
`<AuthScreen />` before anything else renders, so nothing about the game is visible to a stranger.

**Two hard conditions.** First, the local squad **must** migrate into the account on first sign-in —
a guest who drafts, signs up, and finds an empty squad is worse than the current hard gate. Second,
it must compose with the existing `?join` pending-invite handshake at `App.tsx:88–105`, since a
guest could arrive via an invite link, draft a squad, sign up, and need **both** the squad and the
league join to land.

**Honest cost/benefit:** this app is unusually exposed to the migration failure mode — a Zustand
game store, a separate profile store, and a CloudSync layer that already produced a runaway-save
incident. If that engineering isn't in scope, **keep the hard gate and spend the effort on the
generated squad instead.** The generated squad is worth more per hour of build than deferred signup
is. Also note the tension inside Duolingo itself: it defers the *account* but front-loads a
*questionnaire*. Copy the deferral, not the questionnaire (see Section 7).

### 1.8 One decision per screen — for the account only

**ADAPT, narrowly.** Robinhood's account flow asks one thing per screen and collects only what is
strictly required, deferring non-essential details (including funding) to later in the
relationship. **[unverified — the widely repeated "11 fields, 16 clicks" specifics come from Medium
teardowns and template sites, not Robinhood; the single-question-per-screen principle is consistent
across independent teardowns and matches the public flow, but treat the numbers as folklore]**

**Implication for Grand Slam GM.** Apply to the **account step only, never to the draft** — ten
sequential one-player-per-screen picks would be far worse than one browsable market with a running
budget. The account should be email + password and nothing else. Team name and emblem (currently in
`profileStore`, surfaced via `UserProfile.tsx`) are naming ceremony, not identity, and belong
*after* the squad exists. "Name your team" is a far better post-draft moment than a pre-draft field.

---

## 2. Live data without instability or anxiety

**The headline finding: this app does not have live data, and its score cannot fall.**

`src/data/liveData.ts` polls a Wikipedia draw article every 5 minutes (`pollIntervalMs: 5 *
60_000`), with the comment "Wikipedia trails a finished match by a few minutes", and the file itself
notes that "a true in-play feed would need a paid provider". **[verified]** So the feed is
match-level results, not in-play points. And `src/scoring/serverEngine.ts` accumulates points per
won round, so a manager's total is **monotonic — it never falls**. **[verified]**

That kills most of the live-scoring playbook and hands you a much calmer one. Nothing needs a
ticker, a pulsing LIVE dot, or an odometer roll, because a number that only rises and only moves
once every few minutes is not volatile. The single genuinely volatile quantity in the product is
**rank** — plus, per the project's own stale-rankings lesson, retroactively recomputed upset
multipliers. Spend the entire anxiety budget there.

### 2.1 Deferred updates — hold changes behind a tap

**ADOPT. Highest-leverage change in this section.**

**What / who.** Incoming poll results are fetched and diffed but not applied to the visible list.
A small pill appears — "ATP: 3 results in — tap to update" — and the list only reflows when the
user taps. This is the "N new items" pattern used by X, Bluesky and Slack. The supporting principle
comes from the Cumulative Layout Shift spec: "Layout shifts that occur within 500 milliseconds of
user input will have the `hadRecentInput` flag set, so they can be excluded from calculations"
(thresholds: good ≤0.1, poor >0.25, at p75). **[verified for the CLS rule; the pill as a named
pattern is widely used but I did not verify a specific product's implementation]**

**Why it works.** A change the user *asked for* is not experienced as instability; a change that
happens under their thumb is. The performance metric and the felt experience point the same way,
which is rare. The pill also gives you the WCAG 2.2.2 "control the frequency of the update"
mechanism for free (see 2.7), and converts a background event into a small deliberate reward.

**Implication for Grand Slam GM.** `useLiveFeed` currently merges straight into the store on a
5-minute timer while the manager may be mid-scroll on League or Bracket. Gate the merge behind the
pill on any scrollable list; auto-apply only when the list is scrolled to top and untouched for a
few seconds.

### 2.2 Fixed-width score cells, not clever number animation

**ADOPT.**

**What / who.** ATP Tour live scores. I inspected the live DOM: every `.score-item` measures
exactly **18px** wide regardless of whether it holds a 6, a 7 or a tiebreak digit, and the parent
`.scores` container is a fixed **36px** grid. A set score changing from 5 to 6 to 7 cannot move a
single pixel of anything else on the card. Notably the ATP page does **not** set
`font-variant-numeric: tabular-nums` (computed value is `normal`) — the fixed cell does the same job
for single digits. **[verified — measured with getBoundingClientRect + getComputedStyle myself]**

**Why it works.** It removes layout shift at the source rather than papering over it with animation.
Reserving the slot means the number can be swapped instantly with no transition at all — and an
instant swap in a slot that never moves reads as *calm*, whereas a beautifully animated number that
nudges its neighbours reads as *unstable*.

**Implication for Grand Slam GM.** Every points, rank and price figure lives in a `min-width` slot
sized for its maximum plausible value, with `tabular-nums` on top for anything two digits or more
(you need both once numbers are multi-digit). `Countdown.tsx` already uses `tabular-nums` — make
that the house rule, not a one-off. **Caveat from the same inspection:** an empty `.score-item`
computes to width 0, so the ATP row does still grow when a new set begins. Reserve the full set of
slots up front rather than copying that detail.

### 2.3 A plain sentence under the number

**ADOPT — and it does double duty.**

**What / who.** Under each ATP score grid sits a natural-language status line: "Game Set and Match
Alexander Zverev. Alexander Zverev wins the match 7-6(4) 7-6(6)." The digits give the state; the
sentence gives the meaning. **[verified — captured page text myself]**

**Why it works.** Numbers that move are ambiguous — a user glancing at a grid cannot tell whether
7-6 6-4 is in progress or over. The sentence resolves state without decoding a badge. It also
solves the accessibility problem for free: that sentence is exactly what belongs in an
`aria-live="polite"` region, whereas announcing individual digit changes is unusable.

**Implication for Grand Slam GM.** The atomic event here is bigger and rarer than a tennis point:
*"Shelton beat Zverev, R16 — your captain, +10 doubled to +20."* One sentence per result is both
the human-readable explanation and the screen-reader announcement, and it is the natural payload
for a **results log** rather than a toast.

### 2.4 Split the number into banked and at stake

**ADAPT hard — the mechanics here are better than FPL's and the design should say so.**

**What / who.** Two figures at different visual weight: what is confirmed and cannot be taken away,
and what is still to be decided. FPL's version is confirmed points plus provisional bonus. Sorare's
is a 35-point baseline (25 for a substitute) that then moves up or down with performance.
**[likely]**

**Why it works.** The anxious question in fantasy is "can I still lose what I have?" Making the
confirmed figure the large, stable, primary number and the contingent figure secondary answers it
permanently. Sorare's baseline is the same trick from the other direction — starting at 35 rather
than 0 means the number a user watches is rarely near zero.

**Implication for Grand Slam GM.** Because points are monotonic, the honest framing is *"84 points,
banked"* as the hero number and *"up to 140 still in play"* (your surviving players' remaining draw
path) as the secondary. **This is the strongest anti-anxiety move available and it requires no live
data at all.**

### 2.5 Provisional until locked — stated in words, with a stated deadline

**ADOPT.**

**What / who.** FPL scores are explicitly provisional while post-match review runs. The Premier
League's own wording: "Points, ranks and league positions will continue to update as match data is
processed, but they may still change until scoring is locked." They publish the lock deadline too —
final post-match data expected within six hours of the final whistle, and points subject to change
up to 9am UK the day after a gameweek's last match. **[verified]**

**Why it works.** It converts an unbounded worry ("my score changed, is this app broken?") into a
bounded, communicated process with an end time. The anxiety in live scoring is rarely the number;
it is not knowing whether the number is trustworthy. Naming the provisional window is cheaper than
eliminating it, and more honest.

**Implication for Grand Slam GM.** You have a real provisional case that is currently invisible.
Per the project's own stale-rankings lesson, refreshing ATP ranks changes the upset multiplier,
which retroactively changes already-banked points. That is FPL's post-match review exactly. A
leaderboard number that silently moves after a round has "finished" will read as a bug. **Label the
round "provisional" until ranks are reconciled, and say when locking happens.**

### 2.6 A staleness receipt and a visible failure state

**ADOPT — verified gap in the codebase.**

**What / who.** Standard practice across live-score and finance apps: show when data was last
successfully refreshed ("Updated 2 min ago"); when a refresh fails, say so rather than continuing
to render old numbers as if current; pause polling when the document is hidden and refresh once on
return.

**Why it works.** Silence is the worst signal. A user who cannot tell "nothing has happened" from
"the feed is broken" will refresh compulsively — the exact anxious behaviour you are designing out.
A timestamp makes staleness a fact rather than a suspicion, and it costs no motion.

**Implication for Grand Slam GM.** `useLiveFeed.ts` captures `error` into state and exposes it in
its return value, but `LiveFeed.tsx` is headless (`return null`) and mounts the hook app-wide — so
**a feed failure is currently invisible to every user**. **[verified]** Given the source is a
Wikipedia article that trails real results by minutes, "Results as of 14:32" is also more honest
than any LIVE claim. Pausing the interval on hidden tabs additionally helps satisfy the WCAG 2.2.2
frequency clause.

### 2.7 Every auto-updating thing needs a pause / stop / hide control

**ADOPT — this is a Level A obligation currently unmet.**

**What / who.** WCAG 2.2 SC 2.2.2, Level A: "For any auto-updating information that (1) starts
automatically and (2) is presented in parallel with other content, there is a mechanism for the
user to pause, stop, or hide it or to control the frequency of the update unless the auto-updating
is part of an activity where it is essential." **[verified]** Critically, the well-known 5-second
grace applies **only** to moving/blinking/scrolling content — there is **no** 5-second exception for
auto-updating information. Material's own motion documentation obeys this: every looping demo on
the M3 motion page carries a visible pause control. **[verified]**

**Why it works.** It is the accessibility requirement and the anxiety fix in one move. A user who
can stop the screen changing under them is a user who can read it. The "or control the frequency"
clause is the cheap escape hatch: a manual-refresh mode satisfies it without building a pause
button.

**Implication for Grand Slam GM.** `useLiveFeed` sets a 5-minute interval and merges results
straight into the store with no user control anywhere. Cheapest compliant fix is the deferred-update
pill (2.1) — updates apply only on tap, which *is* frequency control — plus a settings toggle for
auto-refresh. **Do not add a pulsing LIVE dot without a way to stop it; you would be adding a 2.2.2
problem, not solving one.**

Related and exempt: the 5-minute poll and the round-lock deadline are real-time events under SC
2.2.1 Timing Adjustable, so the tournament clock itself needs no extension mechanism. **What is not
exempt:** auto-dismissing toasts a user must read in three seconds. Give any auto-dismissing message
either a persistent equivalent or no timer at all. **[verified]**

### 2.8 Announce the sentence, not the digits

**ADOPT.**

**What / who.** WCAG 2.2 SC 4.1.3 Status Messages (AA) plus MDN's ARIA live-region guidance.
`role="status"` carries implicit `aria-live="polite"` and implicit `aria-atomic="true"`. W3C's own
caution: "there is a risk of making an application too 'chatty' for a screen reader user." MDN adds
three traps: the live region must exist in the DOM with the attribute set **before** content
changes; `aria-atomic="true"` is needed so a clock announces "17:34" not just "34"; and combining
`aria-live` with `role="alert"` "causes double speaking issues in VoiceOver on iOS". **[verified]**

**Why it works.** Politeness levels are an *anxiety* control, not just an accessibility control.
`assertive` interrupts whatever the user is doing — the audio equivalent of a modal. `polite` queues
until idle, the correct posture for a score that changed while you were reading something else.

**Implication for Grand Slam GM.** One `role="status"` region, mounted empty at app root, receiving
**one sentence per merged result batch**: "Round of 16 results in. Shelton beat Zverev. Your score
is now 84." Never announce per-value; never use `assertive` for a fantasy score (reserve it for a
deadline passing or a squad locking). Current state: `Toaster.tsx` correctly carries `role="status"`
with `aria-live="polite"`, but grepping `LiveFeed.tsx` for `aria` or `role` returns nothing — the
component whose entire purpose is surfacing changing data has no live region. **[verified]**

### 2.9 Animate the element that moved; cross-fade everything else

**ADOPT.**

**What / who.** Apple's Human Interface Guidelines for Live Activities: "During the transition to a
new layout, preserve as much of the existing layout as possible by animating existing elements to
their new positions rather than removing and animating them back in." And for lists specifically:
"when animating items in lists, only animate the element that moves to a new position and use
fade-in-and-out transitions for the other list items." Animations are capped at two seconds
maximum, and the system performs *no* animations on Always-On displays with reduced luminance.
**[verified]**

**Why it works.** Whole-list reanimation on every update is what makes live screens feel unstable —
it signals "everything changed" when one thing changed. Moving only the changed row preserves the
user's spatial memory of where their own entry sits. The Always-On carve-out is instructive: Apple
treats motion as something you *drop* when the context is passive.

**Implication for Grand Slam GM.** This is the exact prescription for the League leaderboard on a
results poll. When ranks reorder, translate the one or two rows that actually moved and cross-fade
the rest; do not re-render with a stagger. Two seconds is a generous ceiling — 200–300ms is right
for a leaderboard reorder.

### 2.10 Effects motion for numbers, spatial motion for objects

**ADOPT as the house rule.**

**What / who.** Material 3 splits motion into two token families. *Spatial* springs drive anything
changing position, rotation or size — they deliberately "overshoot the final value and bounce into
place". *Effects* springs drive colour and opacity — properties "where there shouldn't be any
overshoot". Three speeds each. **[verified]**

**Why it works.** It gives a principled answer to "should this number animate?" A number's job is to
be read. Bouncing, sliding or scaling a number makes it unreadable during the transition and draws
attention proportional to the *motion*, not to the *importance of the change*. Colour and opacity
change the number's appearance without ever making it illegible or un-hittable.

**Implication for Grand Slam GM.** **Values change via effects motion only** — a colour flash, an
opacity cross-fade. **Spatial motion is reserved for containers** — a leaderboard row translating,
a card expanding, a modal presenting. This single rule prevents most of the "screen feels jittery"
failure mode, and it matches Apple's list guidance above, so both systems agree.

### 2.11 Flash-and-fade: a hold, then a decay — at the right tempo

**ADAPT — right mechanism, wrong tempo.**

**What / who.** AG Grid's `enableCellChangeFlash`, the de facto financial-grid implementation:
class `ag-cell-data-changed` for **500ms** (the flash hold), then `ag-cell-data-changed-animation`
for **1000ms** (the fade back to neutral). Two phases, ~1.5s total, entirely CSS background colour —
the digits never move. **[verified]**

**Why it works.** The hold is long enough that a user glancing up mid-poll still catches which cell
changed; the fade returns the screen to a neutral baseline so the next change is legible. Because it
is background colour only, it is "effects" motion in M3 terms — no layout impact, no reading
interruption, and it degrades to nothing under reduced motion without losing the value.

**Implication for Grand Slam GM.** AG Grid's 500/1000 is tuned for a grid updating several times a
*second*. You update every five *minutes*. Stretch the hold considerably (2–4s), and consider
persisting a subtle "changed since you last looked" marker rather than a pure timed fade — with a
5-minute cadence, a 1.5s flash will be missed by almost everyone. Pair with a non-colour channel
(see 7.11).

### 2.12 Ambient chrome tells you whether the world is moving

**ADOPT.**

**What / who.** Robinhood's background is white during market hours and shifts to a dusky grey when
markets close. Creative Director Zane Bevan, quoted by Google Design: "With this elegant system, the
user can launch the app and glimpse the health and activity of the Stock Market without reading a
single word." **[verified]**

**Why it works.** It answers "is anything happening right now?" before the user reads any number —
the question that actually drives compulsive checking. It is also a *zero-motion* live indicator:
a static background state conveys liveness without a pixel moving, so it costs nothing under
prefers-reduced-motion and nothing under WCAG 2.2.2.

**Implication for Grand Slam GM.** You have three clearly distinct world-states — play in progress,
between rounds (market open, transfers allowed), tournament over. A calm global chrome treatment for
each beats a LIVE badge, because it also tells a manager **when they can act** — the thing the
current design has to explain in words (`ScoringPendingNote.tsx` is doing this job with a sentence).
Keep the sentence for the first-timer; add the ambient state for the returning user.

### 2.13 Batch volatility into a predictable window

**ADAPT.**

**What / who.** FPL player prices do not float continuously. Changes are aggregated and applied
once, overnight UK time, capped at £0.1m per day and about £0.3m per gameweek. Managers know the
exact window in which the market can move. **[verified]**

**Why it works.** A number that can move at any instant forces continuous vigilance; a number that
can only move at midnight forces one check a day. Batching converts real-time anxiety into a
scheduled event, and the cap bounds the worst case so a manager can reason about it.

**Implication for Grand Slam GM.** The round is your natural batching boundary. If refunds, prices
or tiers are ever made dynamic, move them **only at round cutover, never mid-round**, and show the
change as a single "prices moved" event with before/after. The failure mode to avoid is a Market
screen where a player's price differs between the moment a manager opens it and the moment they tap
Buy.

### 2.14 Confirm the commitment when the number moved underneath it

**ADAPT.** **[likely — exact option labels come from secondary sources; the DraftKings help article
is JS-rendered and I could not read it directly]**

**What / who.** DraftKings Sportsbook exposes an odds-change preference on the bet slip, with
"Always Ask" as one option and "Accept all Odds Changes" as the fast path. If a price moves between
opening the slip and confirming, the default is to stop and ask rather than silently execute at the
new number.

**Why it works.** It draws the correct line between data that is merely *displayed* and data that is
about to be *committed to*. Displayed numbers may update freely; a number the user is about to act
on must be frozen or re-confirmed.

**Implication for Grand Slam GM.** Directly relevant to `MarketBuyModal` / `PurchaseConfirmModal` /
cash-in. A manager opens a cash-in for an eliminated player, the poll lands, and the refund value or
the replacement's price changes underneath the open sheet. **Freeze the quoted figures for the life
of the modal**, and if the underlying value moved, show "Price changed $2.5M → $2.8M — confirm?"
rather than executing at the new number or silently mutating the sheet.

### 2.15 Skeletons for cold load only — never replace live content with a spinner

**ADOPT.**

**What / who.** NN/g's split: skeleton screens for full-page loads in the 2–10s range because they
preview the final layout; spinners for isolated elements; progress bars beyond 10s. **[verified]**
The corollary for live data is that a background refresh of content already on screen should show
**no blocking indicator at all**.

**Why it works.** Swapping populated content for a skeleton on every poll is the single most
destabilising thing a live screen can do — it destroys reading position and implies the data was
lost.

**Implication for Grand Slam GM.** Skeleton the leaderboard and bracket on first mount, sized to
real row heights so the CLS budget is protected. On the 5-minute poll show nothing beyond, at most,
a small non-blocking activity dot next to the "Updated 2 min ago" line. `busy` from `useLiveFeed`
should never gate rendering of already-loaded content.

### 2.16 Reduced motion means replace, not remove

**ADOPT — with a precision point worth telling you directly.**

**What / who.** WCAG SC 2.3.3 Animation from Interactions requires that "Motion animation triggered
by interaction can be disabled, unless the animation is essential" — and it is **Level AAA, not
AA**. W3C names `prefers-reduced-motion` as a sufficient technique and is blunt about stakes: "The
impact of animation on people with vestibular disorders can be quite severe. Triggered reactions
include nausea, migraine headaches, and potentially needing bed rest." **[verified]**

**Why it works.** Reduced motion is not *zero* motion. If you strip animation entirely, state
changes become abrupt jump-cuts and users lose the change-tracking cue — you trade one accessibility
problem for another. Replacing spatial motion with a cross-fade preserves the signal and removes the
trigger.

**Implication for Grand Slam GM.** WCAG 2.2 at AA does **not** require you to honour
prefers-reduced-motion. What A/AA *does* require is SC 2.2.2 pause/stop/hide (2.7 above) and SC
2.3.1 for flashing. Honour prefers-reduced-motion anyway — it is cheap and right for a phone app
people open in bed — but budget it as AAA polish and spend the mandatory effort on 2.2.2 first.
Concretely: under reduced motion, leaderboard rows cross-fade to their new order instead of
translating; flash-and-fade keeps its colour change but drops any scale/pulse; `Confetti.tsx` should
not fire at all. **And fix the live bug in the reduced-motion block — see 6.6.**

---

## 3. Making a budget and a quota feel like a puzzle, not a form

**The headline finding: FPL blocks the constraint you can COUNT and never blocks the one you can
TRADE. Grand Slam GM does the exact reverse.**

In FPL's production bundle the add "+" button is rendered `isDisabled: M` where `M = (count of
proposed players in this position) >= squad_select`. **Cost is not a term in that expression.**
**[verified — read from `fantasy.premierleague.com/assets/index-rye0D5CU.js`, component
`FB`/AddElement]** Money is instead allowed to go negative: the scoreboard renders "Bank −£0.5m"
in an error colour, and the only relief offered is an opt-in "Affordable (£4.3m)" filter chip.

`src/pages/DraftPage.tsx` computes `addable` from squad-full **AND** tier-full **AND** canAfford,
then sets `disabled={!isSelected && !addable}` with labels "Full" / "{tier} full" / "Over $" — and
parks the reason in a `title=` attribute that never fires on a touch device. **[verified]**

That single inversion is why the draft reads as a form. The most interesting decision in a 10-pick
$150M draft is the last $12M — whether to stretch for Sinner and go thin at Silver — and the app
currently converts that decision into a locked door with an invisible explanation.

### 3.1 Quota hard-blocks at the control; money never does

**ADOPT — highest-value change in this section.**

**Why it works.** A quota is enumerable and non-negotiable — there is no interesting decision behind
a sixth midfielder, so blocking it costs the player nothing and removes a whole class of error. A
budget is continuous and tradeable — the whole game is deciding where the money goes, so blocking it
*deletes the game*. Splitting the two means the interface only ever refuses things that were never a
real choice.

**Implication for Grand Slam GM.** Keep tier-full and squad-full disables — 2/3/5 is exactly the
enumerable case FPL blocks. **Remove `canAfford` from the disable condition.** Let the manager buy
Sinner at $42M with $38M left, show the budget go red and negative, and gate the single commit
("Enter squad") instead. The **live Market's `+ Buy` is a different case** — money there is
committed on tap and irreversible once the round starts — so keep that one blocked, or route it
through the existing `PurchaseConfirmModal` with the overdraft stated.

### 3.2 Let the money go negative and say by how much

**ADOPT — pairs directly with 3.1.**

**What / who.** FPL renders an overdrawn bank as "−£0.5m" in the error state rather than preventing
the pick. Sorare's lineup-builder message catalogue contains `totalPointsAboveCap: 'Total points
above cap'` — the overage in its own currency is a labelled, displayed figure. **[verified — read
from both production bundles]**

**Why it works.** An over-budget squad is a legitimate *intermediate state of thinking* — "I want
these ten, now what do I give up?" Refusing to represent it forces the manager to solve the puzzle
in their head before touching the interface. Showing "−$4.0M" turns it into a subtraction problem
the interface is helping with.

**Implication for Grand Slam GM.** Draft phase only. An unblocked add button is only coherent if the
resulting overdraft is legible. In the live Market money commits on tap, so an overdraft there would
be a real bug rather than a thinking state.

### 3.3 The shortfall is a quantity, not a boolean

**ADOPT.**

**What / who.** FPL's validity selector returns a *shape*, not a flag: `{ budgetExceeded: -toSpend,
needElements: squadSize - picked, overTeamLimit: [clubIds], noTransfersMade }`. Each key is either
absent or carries **how much**. **[verified]**

**Why it works.** "Invalid" is a dead end; "£1.4m over, 2 short" is a next move. Modelling the
violation as a magnitude means every surface downstream — counter, colour, message, filter — derives
from the same number, and the player is always told the size of the gap.

**Implication for Grand Slam GM.** `src/data/squadRules.ts` already has `squadShortfall()`, so the
model is half there, but the Market renders validity as booleans (`ok`/`over`, "✓"/"!"). Extend to
one object: `{ overBy, short, tierGaps: { Platinum: -1, Silver: +2 } }` and render every constraint
surface off it, including the header sentence.

### 3.4 Two-counter constraint scoreboard, always on screen

**ADOPT.**

**What / who.** FPL's squad screen carries exactly two stat tiles above the pitch: "Players selected
11 / 15" and "Bank £4.3m". Each takes a `status` of 'error' or 'success'; the Bank tile explicitly
formats negatives with a leading minus. **[verified]**

**Why it works.** Two numbers, both always visible, both always meaningful. The player never hunts
for the constraint. And the same widget expresses both "you're fine" and "you've broken it" — so the
error state is a colour change on something you were already reading, not a new element that appears
and shoves the layout.

**Implication for Grand Slam GM.** You have the pieces, scattered and mostly off-screen: budget in a
4px `h-1` bar inside the My Squad sidebar, count in a small "10 / 10" next to the heading, and on a
phone the sidebar is `order-first` so **both scroll away the moment you start browsing**. Promote to
one sticky two-tile strip pinned over the player list — "7 / 10 picked" and "$38.5M left" — and let
both go red. (See 5.6: the natural home for this is the contextual bar above the tab bar.)

### 3.5 Remaining budget divided by remaining slots

**ADOPT — the strongest genuinely new idea for the draft screen.**

**What / who.** DraftKings' DFS lineup builder shows two salary figures while you draft: how much of
the $50,000 cap is left, **and** the average salary still available per unfilled roster spot.
**[likely — from a step-by-step walkthrough published by MLSsoccer.com; cap figure verified from
DraftKings' own rules page]**

**Why it works.** Remaining budget alone answers "can I afford this?" — a yes/no question, which is
exactly what makes a cap feel like validation. Budget-per-remaining-slot answers "what does this
cost me?" — it converts one expensive pick into a visible reduction in the quality of *every pick
still to come*. That is the difference between an error and a trade-off, expressed as arithmetic the
interface does for you.

**Implication for Grand Slam GM.** You can go one better than DraftKings, because your remaining
slots are **typed**. With 2 Platinum, 1 Gold and 4 Silver still open and $58M left, show
"$58.0M · ~$8.3M per pick" and, on tap, the per-tier split. Stretching for a $42M Platinum then
reads as *"your remaining Silvers drop from ~$9M to ~$5M each"* rather than "Over $".

### 3.6 "Affordable ($38.5M)" as an opt-in filter, not a default grey-out

**ADOPT — this is the correct answer to the affordability question, and it is a filter, not a
grey-out.**

**What / who.** FPL's price filter chip's first option is "Affordable". Choosing it sets maxCost
equal to the current bank; the list filter removes every row above that figure, and the chip's label
becomes "Affordable (£4.3m)" — the money doubles as the filter value. Below it sits a descending
price ladder in £0.5m steps, generated from the actual min/max of the filtered pool. **[verified]**

**Why it works.** It gives the player both readings on demand. Browsing the full field keeps
aspiration and trade-off visible — you can see Alcaraz is $2M out of reach and decide to free the
money. One tap collapses to the legal subset when you just want to finish. **The player chooses
whether the constraint is a filter or a horizon; the app never decides for them.**

**Implication for Grand Slam GM.** Add an "Affordable ($38.5M)" chip to the existing filter row in
`DraftPage.tsx`, alongside All / Platinum / Gold / Silver. Skip FPL's price ladder — tier already
*is* the price ladder here.

### 3.7 Empty slot is a labelled button that opens the pool pre-filtered

**ADOPT.**

**What / who.** In FPL's list view an unfilled roster row renders a single button reading "Select
Goalkeeper"; pressing it sets the list's position filter to that position and opens the player
sheet. Sorare uses the same construction — "Select your {position}". **[verified — both bundles]**

**Why it works.** The quota stops being a rule that gets *checked* and becomes the *navigation*. You
never read "2 Platinum required" and then go looking; you tap the hole and land in exactly the set
that can fill it. **The structure of the squad becomes the table of contents for the market.**

**Implication for Grand Slam GM.** The My Squad panel currently renders one flat "Pick 10 players"
placeholder when empty. Replace with ten typed empty slots — 2 Platinum, 3 Gold, 5 Silver, drawn in
tier colour — each tappable to open the market with that tier chip pre-selected. **This makes the
quota visible as geometry on first load, before any rule text is read** — the cheapest possible
answer to "what is this game".

(Note this coexists with 1.3: the *default* for a first-timer is a pre-filled scout's squad; typed
empty slots are what they see after they remove someone, and what a returning manager sees after a
Reset.)

### 3.8 Removing a player re-filters the pool to that player's slot

**ADAPT.**

**What / who.** FPL's remove button takes a `filterByElementTypeOnRemove` flag; when set, removing a
defender both drops the player and sets the list filter to defenders. **[verified]**

**Why it works.** Removal and replacement are one intention, and the interface treats them as one
gesture. It also guarantees the very next thing you see is legal.

**Implication for Grand Slam GM.** Applies cleanly during the draft — removing a Gold snaps the tier
chip to Gold. It does **not** apply verbatim to the live Market, where you deliberately allow a
cashed-in player of any tier to be replaced by any tier; pre-filtering there would imply a rule that
doesn't exist. Live, pre-filter by **price** instead: after a cash-in, auto-apply the "Affordable"
chip.

### 3.9 The sort key becomes a visible column

**ADOPT — fixes a concrete defect.**

**What / who.** Each FPL player row is: watchlist toggle | player + club | price | **the value of
whatever metric is currently selected in "Sort by"** | add/remove. The sorted metric is rendered as a
column. **[verified]**

**Why it works.** Sorting without showing the sort key asks the player to trust an invisible
ordering. Rendering it makes the ordering auditable and lets the player see the **size** of the gap
between rank 3 and rank 4 — which is what actually decides whether the extra money is worth it.

**Implication for Grand Slam GM.** The market table hides surface win%, W–L and titles behind
`hidden md:table-cell`, so **on a phone — where the game is almost entirely played — sorting by
"Hard %" reorders the list with the deciding number invisible.** **[verified]** Collapse to a
phone-shaped row of exactly four things: avatar + name, tier dot, price, and the active sort metric.
Everything else goes behind the player sheet.

### 3.10 Filter state lives in chips that display their own current value

**ADOPT — you already have the better half of this.**

**What / who.** FPL puts four chips above the list: "Filter by player" (grouped popover), "Sort by"
(ten options), "Filter by price", and "Reset". Each chip renders its currently selected option as
part of its own label and carries an `isModified` visual state; Reset is disabled when nothing is
modified. **[verified]**

**Why it works.** On a phone the entire query is readable at a glance without opening anything, and
each chip is one tap to change one dimension. `isModified` prevents the classic "why is this list
empty" confusion. A disabled-when-clean Reset is the one legitimate use of a disabled control — it
refuses an action that would do nothing.

**Implication for Grand Slam GM.** Your tier chips already show `2/2 ✓` and pulse when a tier is
still needed, which is genuinely *more* puzzle-like than FPL's position dropdown. What's missing is
the rest of the row: sort is a cramped segmented control pinned right with only three options plus a
separate "Sort by" caption, and there's no Reset. Unify into one scrollable chip row:
`[Tier chips with counts] [Sort: # Rank ▾] [Affordable ($38.5M)] [Reset]`.

### 3.11 Already-picked rows dim; unaffordable rows do not

**ADAPT.**

**What / who.** FPL's list row has two style variants: default, and "proposed" at 60% opacity. The
dimmed state marks a player you have **already selected**. Price never dims a row. **[verified]**

**Why it works.** Dimming is a scarce signal and FPL spends it on the one thing genuinely finished —
"you own this, stop considering it". Spending it on "too expensive" would fire on dozens of rows at
once late in a build and would tell the player, falsely, that *the field has shrunk* when in fact
*their money has*.

**Implication for Grand Slam GM.** The live Market already does the good version — "In squad" plus a
gold "New" badge for owned players. Extend that to the draft phase (dim + "In squad") and **stop
dimming on price**.

### 3.12 Shortlist before you commit money

**ADAPT — cheap, lower priority than 3.1–3.7.**

**What / who.** Every FPL list row carries a watchlist toggle in the leftmost column, and
"Watchlist" is a first-class option in the player filter. **[verified]**

**Why it works.** It separates "interesting" from "bought". In a capped draft the expensive
decisions want deliberation, and without a shortlist the only way to hold a candidate in mind is to
*add them* — which spends the budget and makes the comparison harder.

**Implication for Grand Slam GM.** A 10-pick draft over a 128-player field has real search cost, and
your own hint copy ("Don't know the players?", the ▶ video links) admits newcomers don't know the
field. A star toggle plus a "Shortlist" chip lets someone browse video clips, star six names, then
pick from six instead of 128.

### 3.13 A live projected outcome that recomputes as you build

**ADAPT, carefully.** **[likely — the strings are verified from Sorare's bundle
(`Projected Score`, `Proj. Score`, `Gain on Proj.`); the on-screen treatment is not]**

**Why it works.** A puzzle needs an objective function, not just a legality check. If the only
feedback while building is legal/illegal, the player is filling in a form. If every swap moves a
projected number, the player is *optimising* — and the constraint becomes the thing that makes
optimising interesting.

**Implication for Grand Slam GM.** You have the raw material — per-surface win%, seedings and a real
draw — so an "expected rounds survived" or projected-points figure for the current 10 is computable,
and would give the budget a purpose beyond legality. **Two cautions:** label it clearly as an
estimate, and do not let it update mid-tournament in a way that feels like a live score (that
collides directly with Section 2).

### 3.14 Constraint messages announced in a live region, not just coloured

**ADOPT.**

**What / who.** FPL wraps its squad-validity messages in `<div role="status">` and renders the
club-limit violation as an inline error naming the offending clubs ("Too many players selected from
Arsenal, Liverpool") rather than only turning a counter red. WCAG SC 1.4.1 Use of Color (Level A)
requires that colour never be the only visual means of conveying information or indicating an error.
**[verified]**

**Why it works.** A red number is invisible to a screen-reader user and ambiguous to a colour-blind
one, and a counter that merely changes hue doesn't say what to do.

**Implication for Grand Slam GM.** Current market rows lean on colour plus a `title=` tooltip — the
worst combination on a phone, because `title` has no touch equivalent, so **the reason a button is
dead is literally unreachable**. Move every constraint message into a persistent `role="status"`
strip next to the two counters, always carrying words and a number ("$4.0M over — free up money or
drop a tier"), never colour alone.

---

## 4. Telling a manager what to do next, without nagging

**The rule: a prompt earns persistence only when the user can lose something irreversible by
ignoring it.** Everything else is information, and information belongs where the question is asked,
not on Home.

You already have the right organ. `NextMove.tsx` is a genuinely good phase-aware coach — better than
anything FPL ships. It is currently configured to nag in three specific, fixable ways.

### 4.1 A next-step card that can actually reach "done"

**ADOPT — this is a defect, not a preference.**

**Three verified problems in `src/components/NextMove.tsx`:**

1. **Line 150** hardcodes `{ label: 'Lock your squad', sub: 'before the first match', done: false }`
   in the pre-tournament branch. A manager with a valid 10-player squad and both leaders picked
   **still sees an unchecked step and a full-width primary button** telling them to go do something.
   There is no reachable all-done state before the tournament.
2. **Line 139**: `const leagueDone = hasPrivateLeague || myTeam.length > 0;` — "Add friends
   (optional)" ticks as done when the manager has merely *started drafting*. That is a fake
   completion: it lies to make the list look shorter.
3. Every state renders a full-width primary button, including the states where the card's own copy
   correctly says "nothing to change" (see 4.2).

**Why it matters.** An open loop that never closes stops being guidance and becomes a nag: the user
learns the card is always shouting and stops reading it. A card that *resolves* earns trust, because
its alarm state then means something.

**Implication for Grand Slam GM.** Make lock genuinely reflect `finalized`. Let the optional league
step render as *skippable* rather than falsely completed. And ensure that a manager who has done
everything sees a calm "you're set" card.

### 4.2 Say "nothing to do" out loud, and let the layout agree

**ADOPT.** **[likely — empty-state guidance from Carbon plus an NN/g summary, not a primary NN/g
article read in full]**

**Implication for Grand Slam GM.** `NextMove`'s live-round copy already nails this: *"points update
automatically as your players win. Captains are locked for this round; nothing to change."* That is
the best sentence in the codebase for this section. The failure is that the card then presents two
full-width buttons, which **visually contradicts its own words**. When the answer is "nothing", the
card should *shrink* — smaller, quieter, no primary button — so the layout itself signals rest.

### 4.3 One active node, not a menu of options

**ADAPT.**

**What / who.** Duolingo's Path (rolled out to all learners Nov 2022) shows a single linear path
with exactly one lesson node lit and tappable. They deleted the old "tree" where learners chose
among many available lessons. Duolingo's stated reason: they "often hear from learners that they're
not sure whether they're using Duolingo the correct or best way" and wanted "a clear path to follow
— so you can be confident that each step you take is truly the best step". **[verified]**

**Why it works.** Removing choice removes the guilt of choosing wrong; the product absorbs the
decision so the user only has to act.

**Implication for Grand Slam GM.** `NextMove` already has this shape — a phase-aware card with an
ordered step list and one big primary button driven by the first not-done step. Go further: **show
one step at a time, not a four-item checklist.** A checklist of four open loops is four things you
haven't done; a single lit node is one thing you can do. Keep the full list behind a small "see all
steps" affordance so the manager can still verify quota and captain state.

### 4.4 Notify about what other people did, never about what you failed to do

**ADOPT — Strava is the model.** **[likely — the absence of a re-engagement nag is inferred from
Strava's own notification documentation not listing one; that is absence of evidence, not proof]**

**What / who.** Strava's documented notification set is overwhelmingly reactive-social and
event-driven: kudos, comments, club posts, losing a KOM/QOM/CR. Their help documentation contains no
"you haven't recorded an activity in a while" reminder, and it explicitly says some notifications
are withheld where sending them "might be a poor experience or produce inaccurate and unnecessary
notifications" — e.g. no KOM-loss email on flat segments.

**Why it works.** Every notification is caused by a real-world event involving a real person, so it
is never a fabricated reason to reopen the app. Silence is honest: if nothing happened, nothing
pings. Strava is a habit app that does not guilt you for skipping a day, and it retains fine.

**Implication for Grand Slam GM.** Tennis supplies a constant stream of genuine external events:
your player won, your player got upset out, a rival passed you. Those are Strava-class notifications
— caused by the world, not by the product wanting you back. *"You still haven't picked a captain"*
is legitimate **only because a deadline exists**. *"Come back and check your team"* is not.

### 4.5 The deadline reminder is opt-in, and it is the only push worth asking for

**ADOPT.**

**What / who.** FPL does not push you by default. Deadline reminders are a specific toggle the
manager must switch on (More > myPL Settings > Notifications > Fantasy Premier League > Deadline
reminders), and the Premier League publishes explainer articles teaching people how to opt in.
**[verified]** NN/g adds the timing rule: do not request notification permission on first launch;
"tell people what notifications will be about to increase the chance that they will accept your
request"; batch rather than burst; and "allow users to edit their notification preferences within
the app". **[verified]**

**Why it works.** The one prompt unambiguously in the user's interest is "you are about to lose an
option you cannot get back". Making it opt-in means the notification stream is 100% signal, so it
never gets muted — and the act of opting in *is* consent, which is why it does not read as nagging.

**Implication for Grand Slam GM.** You have exactly one irreversible deadline per round: the moment
the round locks captain and market. That is the single push the app should ever ask permission for.
Ask **at the moment the manager first locks a squad** (they have just demonstrated they care), not
at first launch, with copy naming the exact content: *"One reminder before each round locks —
nothing else."* When a batch of results lands from the 5-minute poll, collapse them into one summary
rather than firing per-player.

### 4.6 Ship the deadlines as a calendar feed instead of a notification stream

**ADAPT — probably the lowest-effort item in this whole document.**

**What / who.** Alongside push and email, FPL offers a calendar subscription: pick the Fantasy
Premier League schedule and every deadline downloads into the manager's own calendar. **[verified]**

**Why it works.** It moves the reminder out of the product's control and into the user's. The
product never has to nag because the user's own calendar does the reminding, on the user's own
terms, with the user's own snooze rules. Zero notification budget spent, zero on-screen real estate.

**Implication for Grand Slam GM.** `TOURNAMENT.schedule` already holds round start times. Emit an
`.ics` per tournament with one event per round lock.

### 4.7 Forgiveness mechanics instead of pressure mechanics

**ADAPT — and you already ship the tennis equivalent.**

**What / who.** Duolingo's streak freeze absorbs a missed day, plus a repair path after a break.
Third-party analysis reports large differences in average streak length with freezes available.
**[unverified — the 17.19 vs 11.62 day figures come from a vendor blog, not Duolingo; I found no
Duolingo-published number]**

**Why it works.** It removes the cliff. Once a user knows a single slip does not destroy their
progress, the product no longer needs to threaten them into compliance.

**Implication for Grand Slam GM.** Don't invent streaks — lean on the mechanic you already have.
**Captain carry-forward means a manager who does nothing before a round still has a valid captain.**
Say that explicitly in the pre-round card: *"If you do nothing, Alcaraz captains again."* That
converts a deadline from a threat into an informed choice, which is the single biggest de-nagging
move available to you.

### 4.8 Give the prompt a give-up condition

**ADOPT the mechanic, reject the tone.** **[likely]**

**What / who.** After sustained non-response Duolingo sends the widely-documented line "These
reminders don't seem to be working. We'll stop sending them for now." — and stops.

**Why it works.** It converts an infinite retry loop into a terminating one, and says so out loud.
That is the difference between a prompt and a pester: **a prompt has a budget.**

**Implication for Grand Slam GM.** Any prompt shown N times without being acted on should demote
itself — primary CTA → quiet line → nothing — and tell the user it is doing so ("We'll stop
reminding you about this"). Apply especially to the optional steps (create a league, invite
friends), which currently sit at the same visual weight as deadline-bound ones.

### 4.9 Repeated identical prompts decay; rotate and rest them

**ADAPT — no machine learning required.** **[likely — I could not extract the PDF text; the
"recovering bandit / satiation" framing and the short reward window come from the paper's title and
abstract plus secondary write-ups, not from lines I read]**

**What / who.** Duolingo models reminder selection as a multi-armed bandit whose arms *recover* over
time — an arm's value is depressed right after use and recovers with rest (Yancey & Settles, KDD
2020). Notifications were previously chosen at random.

**Why it works.** It formalises satiation: the same words in the same slot lose power fast.

**Implication for Grand Slam GM.** `NextMove` currently renders the same sentence on every visit for
the whole life of a state. If the manager has seen "Get ready for the Quarter-finals" six times
without acting, the seventh render is wallpaper. Cheap version: two or three copy variants per
state, plus visual de-escalation once the state has been seen without action.

### 4.10 Celebration should carry information, not just dopamine

**ADOPT.**

**What / who.** Robinhood removed its confetti animation in March 2021 after gamification criticism,
replacing it with more restrained animations that surface additional information about the action
just taken. Head of design Rich Bessel described the replacements as "moments of pause, moments of
understanding". **[verified]**

**Why it works.** The old confetti rewarded the *act of transacting* regardless of whether it was a
good idea. The replacement rewards *comprehension*. A celebration that teaches is not a
manipulation, because it leaves the user better calibrated rather than merely more excited.

**Implication for Grand Slam GM.** The test for `Confetti.tsx` is: what does it fire on? If it fires
on "squad locked" or "transfer made", that is Robinhood-2020 — rewarding the transaction. If it
fires on an outcome the manager cannot control (your captain won the semi-final), it is a genuine
event celebration. Best version: the moment carries the number and the reason — *"Shelton QF win —
10 pts, doubled as captain = 20"* — so the payoff is also the explanation of the scoring system.
Reserve it for genuine milestones, never a routine round win, and suppress entirely under
prefers-reduced-motion.

### 4.11 The three-tier prompt rule

**ADOPT as the governing policy.**

**What / who.** Synthesis of NN/g push guidance and the FTC's "Bringing Dark Patterns to Light",
which classifies **nagging** — repeated requests the user has already declined — as a variant of
coerced action. **[verified]**

| Tier | Behaviour | Qualifies when |
|---|---|---|
| **1** | Persistent, undismissable, **one at a time** | An action with an irreversible deadline the user can miss |
| **2** | Dismissible, remembers the dismissal for the tournament | An optional improvement with no deadline |
| **3** | No prompt — discoverable on the relevant screen only | Everything else |

**Implication for Grand Slam GM.** Tier 1 = replace eliminated players / set this round's captain
before the round locks. Tier 2 = create or join a private league, set a team emblem, add friends.
Tier 3 = "see the live draw", "see the leaderboard" — these are *navigation*, and today they appear
as buttons inside the `NextMove` card during live rounds, which inflates a coaching card into a
second nav bar (see 7.15).

### 4.12 A prompt scoped to a round should expire with the round

**ADAPT.** **[likely]**

**What / who.** Apple Live Activities / ActivityKit — a system-level ambient surface for one
in-progress event, with a hard maximum lifetime (about 8 hours active, up to 12 on the Lock Screen),
which the app is expected to *end* when the underlying event finishes. It is not a notification; it
does not ping, it just sits there and updates.

**Why it works.** It separates "ongoing state you may want to glance at" from "interruption".
Nothing demands a response, nothing accumulates, and the surface removes itself when the reason for
it ends, so it can never become stale furniture.

**Implication for Grand Slam GM.** This is the right mental model for the live-round card: while a
round is playing there is genuinely nothing to do, so the card should be an ambient, non-actionable
status surface that ends itself when the round ends. Later, literally implementing Live Activities
for a manager's captain during a live match is a strong fit — sports is Apple's own cited example.

### 4.13 Badge only for genuinely unresolved items, and clear predictably

**ADAPT.** **[likely — "badge blindness" is well attested in practitioner writing; I did not find a
primary study]**

**Why it works.** A badge is a *promise* that something is unresolved. Break the promise once — the
badge doesn't clear, or it badges something that resolves itself — and the signal is dead for good.
Apple's rule: "Reserve badges for critical information so you don't dilute their impact and
meaning." **[verified]**

**Implication for Grand Slam GM.** At most **one** tab may ever carry a badge, and only for a state
the manager must act on before a lock — eliminated player unreplaced, or captain out. Never badge
Market for "new prices" or League for "someone passed you"; those are *interesting*, not
*unresolved*. **Current bug:** a pulsing green dot is hard-coded onto the **Bracket** tab whenever
`phase === 'pre_round'` (`src/App.tsx:246–248`) **[verified]** — precisely when the pending decision
is about the *squad*, and Bracket is where you can do nothing about it. Move the badge to the tab
that owns the decision, and gate it on actual unresolved state, not on phase alone. *A badge that
lights up every round regardless of whether the user has acted is the definition of nagging.*

### 4.14 Live prompt changes must be announced without stealing focus

**ADOPT — binding at AA.** WCAG SC 4.1.3 requires status messages be programmatically determinable
"without receiving focus". **[verified]**

**Implication for Grand Slam GM.** The `NextMove` card mutates in place when a result lands. Today
that is silent to assistive tech and, for sighted users, **can move the primary button under a thumb
mid-tap**. Wrap the card's headline/eyebrow in `role="status"`, and never re-order or re-label the
primary action while it is under the pointer — defer the swap to the next idle moment.

---

## 5. What genuinely earns a place in a bottom navigation bar

**One test decides occupancy: a tab must be a noun you can inhabit, of equal standing to its
neighbours, meaningful on every day of the tournament.**

Apple gives the rule — "Use a tab bar to support navigation, not to provide actions", with the tab
"preserving the current navigation state within each section". **[verified]** Material gives the
count — three to five top-level destinations of similar importance, a rule unchanged from Material 1
through Material 3; Material 1 gives the mechanical reason: "Avoid using more than five destinations
in bottom navigation as tap targets will be situated too close to one another." **[verified]** And
Apple gives the enforcement clause that does the real work here: **"Don't disable or hide tab bar
buttons, even when their content is unavailable... If a section is empty, explain why its content is
unavailable."** **[verified]** That clause is fatal to any tab whose relevance has a lifecycle.

### 5.1 Move the navigation to the bottom

**ADOPT — the cheapest large win available.**

**Evidence.** Steven Hoober's observational study (UXmatters): 1,333 observations of people using
phones in public, 780 involving screen touches — 49% one-handed, 36% cradled, 15% two-handed; within
cradling, 72% still touch with a thumb. That puts roughly **85% of all touches on a thumb**. His
later work adds that touch accuracy is best at screen centre and degrades toward edges and corners —
targets can be about 7mm at centre but need roughly 12mm in the corners. **[verified]** NN/g's
hidden-vs-visible navigation study (179 participants, 6 sites) measured hidden navigation at "a more
than 20% drop in discoverability"; on mobile users were 15% slower with hidden vs combo navigation
and used it 57% of the time vs 86%; perceived task difficulty rose 21%. Their recommendation: "If
your site has 4 or fewer top-level navigation links, display them as visible links." **[verified]**

**Two honest caveats.** Hoober's headline data is from 2013 on smaller phones, and he emphasises
people fluidly switch grips — sometimes in response to where the UI puts things. So the finding is
"bottom is cheaper for most touches", not "top is unusable".

**Implication for Grand Slam GM.** Current nav combines three anti-patterns: navigation in the
hardest thumb-reach zone; a partial-hiding mechanism (`overflow-x-auto no-scrollbar`) with **no
visual cue that content extends beyond the viewport**, which is the hidden-navigation condition NN/g
measured; and an overflow behaviour Apple explicitly tells you to limit. Rough arithmetic on a 375pt
phone — 24pt page padding, ~50pt logo block, ~96pt for two 44pt header buttons plus gap — leaves
roughly 200pt for four tabs, about 50pt each. They fit, barely, with no headroom for a fifth tab, a
longer label, or large Dynamic Type, at which point tabs silently scroll out of view. *(I have not
measured this on a device; it is an estimate from the source. Check at 320pt and at the largest
accessibility text size.)*

**Do:** fixed bottom bar; `padding-bottom: env(safe-area-inset-bottom)` (see 6.5); each tab a fixed
equal share of width with **no horizontal scroll**; keep the icon-over-label stack and the accent
underline; keep `min-h-[44px]` (raise to 48 — see 6.2); leave the logo, "?" and profile in the top
header.

### 5.2 The verdicts

| Tab | Verdict | Reason |
|---|---|---|
| **Home** | **Earns it** | A noun, a place, meaningful in every phase, and where "what should I do now" lives. Also the only tab that holds an empty state gracefully — "nothing to do right now, next round Saturday" is itself useful. It is additionally load-bearing for cross-tournament navigation because the tournament switcher sits at its foot (`src/App.tsx:275–276`, deliberately moved there). Don't move that switcher back to the header. |
| **League** | **Earns it — and it's the retention slot** | A noun, a place, permanently meaningful, holds state worth preserving. More importantly it answers a question no other surface can: *am I winning?* That is what brings people back between rounds when they have nothing to change. It is also the natural home for anything social — rivals, head-to-head, mini-league chat — which is how you protect a four-item bar from growing to six. |
| **Market** | **Does NOT earn it** | Its label is a place but its content is an action — and the label and the id disagree with each other: the tab id is `'draft'` while the label reads `'Market'` (`src/App.tsx:38–42`), a tell that the team was never sure whether this is a room or a task. Its relevance collapses to zero once three transfers are spent, and it must be locked the moment a round starts. Apple forbids hiding it; Material requires equal importance; it satisfies neither. |
| **Bracket** | **Does NOT earn it** | Reference content, not a destination. Meaningless before the draw is published; consulted a handful of times per event versus a score checked several times a day. Fails "equal importance" outright and fails the empty-state test at the start of every event. |

**The single highest-value structural finding: the object a fantasy manager cares about most has no
tab at all.** `TeamPage` renders on `activeTab === 'team'` (`src/App.tsx:309`) but `'team'` is
**absent from the TABS array** **[verified]** — the squad is reachable only by incidental links,
while the draw tree gets permanent residency.

### 5.3 Recommended bar: **Home · Squad · Matches · League**

This follows Strava's method exactly. When Strava rebuilt its navigation it went from Feed, Explore,
Record, Profile, Training to Home, Maps, Record, Groups, You — merging Profile and Training into
"You" (one place holding "photos, ride details, and training info") and renaming Explore to Maps
around the *artefact* rather than the *activity of looking for it*. The item count stayed at five;
the meaning of each slot got bigger. **They earned the Groups slot by merging two others rather than
adding a sixth.** **[verified]**

- **Squad** replaces Market. The manager gains a permanent home for the object they own.
- **Matches** absorbs Bracket. Bracket and any results view both answer "what is happening in the
  tournament?", so they should be one place — today's order of play, live and completed results,
  your players' next opponents, with the full draw tree as one view inside it. That merge turns a
  part-time tab into a full-time one.
- Supporting external signal: the sport's own official app (ATP WTA Live) spends its four tabs on
  Scores, Calendar, Latest and Rankings and **gives the draw no tab either** — draws live inside
  Scores/Calendar. **[likely — read from an App Store listing summary, not the running app; worth a
  30-second check on a phone]**

**If a merged Matches place cannot be built now, three tabs is legitimate.** Material's rule is
three-to-five. `Home · Squad · League` is better than four tabs where one is dead half the
tournament.

### 5.4 Never disable or hide a tab, even when its section is empty

**ADOPT.** The rule is decisive for a tournament app whose sections have lifecycles. If a section
earns a tab, it keeps that tab through the whole tournament, showing "Draw is published Saturday"
rather than vanishing. **The corollary is harsh and useful: if a section can only justify its tab
for part of the event, it does not deserve a tab at all.**

### 5.5 Settings, profile and help belong in the header, not the bar

**ADOPT — you already do this correctly.** When Strava rebuilt its bar it explicitly relocated
Settings and Find Friends to the top of the screen. **[verified]** Frequency, not importance, is the
allocation rule for a bottom bar: Settings is important and rarely used — those are different axes.

**Implication for Grand Slam GM.** The "?" How-to-play and profile buttons live in the header at a
proper 44×44 (`w-11 h-11`) (`src/App.tsx:277–303`). No change needed — but resist any pressure to
promote Profile to a tab, which is the most common way a four-tab bar becomes a five-tab bar for no
user benefit.

### 5.6 State-dependent, high-stakes actions belong on a persistent contextual bar

**ADAPT — this is where Market's function goes.** **[unverified for the DraftKings specifics — the
App Store listing describes verticals (Sportsbook, Predictions, Racing, Casino) but not the
navigation; slip behaviour comes from sportsbook-UX secondary writeups. Verify on device before
building to a specific layout.]**

**What / who.** Sportsbooks do not put "place a bet" in the tab bar. The bet slip is a persistent
element that appears *above* the navigation when you have selections, carries the live state — count,
stake, potential return — and collapses to nothing when there is nothing to confirm.

**Why it works.** It gives a transient commitment a permanent home without spending a permanent
navigation slot. The bar is self-explaining: its presence means "you have uncommitted changes", its
absence means "you're settled". And it keeps the user inside the browsing context while they build
the commitment.

**Implication for Grand Slam GM.** During drafting: *"7/10 picked · $38.2M left · 2 Plat ✓ 3 Gold ✓
2/5 Silver"* with a Confirm affordance — which is also exactly the constraint scoreboard from 3.4 and
3.5. Between rounds: *"2 players out · 3 transfers left · Cash in"*. It appears exactly when
relevant, disappears cleanly, costs **zero navigation slots**, and does not violate the never-hide-a-
tab rule because a contextual bar is not a tab. iOS blesses this shape explicitly: current tab bars
support an attached accessory that rides above the bar (Apple's own example is the Music MiniPlayer),
and the system treats "nav bar" plus "thing riding above it" as one composed unit. **[verified]**

### 5.7 Tab bars may recede on scroll but must not disappear

**ADAPT.** Apple requires the tab bar be visible when people navigate between sections, with modal
views the only exception; current iOS supports a bar that minimises while scrolling. **[verified]**
A bar that shrinks and grows back is calm; one that disappears and reappears is not. Adopt
minimise-on-scroll **only if it can be done without layout shift** (which ties back to Section 2).

---

## 6. Design-system and accessibility constraints — the build checklist

WCAG 2.2 **AA** is the stated bar. The three rulebooks disagree on exactly one number that matters
here — minimum target size — and that disagreement is the whole design lever.

### 6.1 The one number they disagree on

| Standard | Minimum target | Notes |
|---|---|---|
| **WCAG 2.2 AA (SC 2.5.8)** | **24 × 24 CSS px** | Testable law. Has a **Spacing exception**. |
| **Apple HIG** | **44 × 44 pt** | "so they can be accurately tapped with a finger"; 28×28 pt absolute minimum; ~12 pt padding around bezelled elements |
| **Material** | **48 × 48 dp** + **8 dp** separation | "to ensure balanced information density and usability" |

All three **[verified]** (Material 48dp verified from the server-rendered Material 1 spec and
Android's accessibility help page — `m3.material.io` is a client-rendered SPA and returned only its
title, so the M3 page text itself is **[likely]** rather than verified).

**Encode as two tokens, not one rule:**

- `--target-min: 24px` — hard gate, every interactive element, no exception
- `--target-comfort: 48px` — nav tabs, primary CTAs, captain/vice toggle, cash-in, buy, and
  everything in the draft/transfer flow. **48 satisfies all three standards at once and removes the
  argument.**

### 6.2 The Spacing exception is the density permission slip

SC 2.5.8's exception: "Undersized targets (those less than 24 by 24 CSS pixels) are positioned so
that if a 24 CSS pixel diameter circle is centered on the bounding box of each, the circles do not
intersect another target or the circle for another undersized target." The other four exceptions are
Equivalent (same function reachable via a conforming control on the page), Inline, User Agent
Control, and Essential. **[verified]**

**This is the criterion that decides whether a 128-slot bracket is buildable at all.** Without the
exception, bracket nodes would need to be 24px minimum and would not fit 320px width. With it, small
nodes are legal as long as they are spaced. The **Equivalent** exception is a genuine second escape
hatch: a tiny bracket node can stay tiny if tapping the player's row elsewhere opens the same
`PlayerPage`.

**Build rule.** Dense read-mostly surfaces (BracketTree, League rows, tier pips) → small visuals plus
enforced 24px non-intersecting circles. Anything a thumb aims at repeatedly → 48px.

**Current state:** header "?" and profile buttons are `w-11 h-11` (44px — meets Apple, misses
Material by 4). Nav tabs are `min-h-[44px]` with only `px-2` horizontal padding — a 17px icon plus
8px each side is roughly **33px wide**, which clears the 24px legal floor but sits well under both
platform numbers on the axis a thumb is least accurate on. Draft add button `min-h-[36px]`, tier
chips `min-h-[38px]` — legal, below comfort. **[verified]**

### 6.3 Colour contrast — measured against the live palette

Ratios computed from the tokens in `src/index.css` against `--surface #FFFFFF`. **[verified — I
computed these]**

| Token | Value | Ratio on white | Verdict |
|---|---|---|---|
| `--gold` | `#D99A00` | **2.45:1** | **Fails everything**, including the 3:1 non-text floor |
| `--blue-light` | `#4aa8ea` | **2.60:1** | **Fails everything** |
| `--green` | `#12A150` | **3.37:1** | Large text only (≥24px regular / ≥18.66px bold) |
| `--ember` | `#E5472B` | **3.99:1** | Large text only |
| `--ink-3` | `#6B7C96` | **4.24:1** | **Fails** — see below |
| `--blue` | `#0e6fc4` | **5.14:1** | Passes |
| `--ink-2` | `#5B6B84` | **5.41:1** | Passes |

**Fix first: `--ink-3`.** `src/index.css` line 18 carries the comment *"darkened from #9AA7BC to
~4.5:1 (WCAG AA)"* while it actually measures **4.24:1 on white, 3.95:1 on `--raised`, and 3.75:1 on
`--bg #EEF1F5`** — it fails on all three surfaces, and it is the caption/hint token, so it is on
small text by definition. **A palette that carries a false AA claim in a comment is more dangerous
than one with no claim at all**, because it stops the next person re-checking. Around `#63738C`
would clear 4.5:1 on `--bg`, the worst case.

**Also failing 1.4.11 Non-text Contrast (3:1, AA):** `--line: rgba(10,27,51,0.10)` composites to
roughly `#E3E6EA` on white, about **1.25:1**. There are 23 `<input>`/`<select>` elements in `src/`.
Card borders are decorative and exempt; **input borders are not**. Fork the token into `--line`
(decorative) and `--line-control` (≥3:1, roughly `#767F8C` or darker on white).

**And the tier system is a graphical object conveying the 2/3/5 quota**, so it is governed by
1.4.11 too — `--gold` at 2.45:1 fails. Platinum / Gold / Silver must never be encoded by hue alone
anyway: pair each with a label or a distinct shape so the quota is readable without colour
discrimination.

### 6.4 Focus rings must be checked against every background they land on

`src/index.css` line 53 sets a global `:focus-visible { outline: 2px solid var(--blue);
outline-offset: 2px; }` — well implemented. The gap is the **two-background problem**: `--blue
#0e6fc4` gives **4.53:1** on `--bg #EEF1F5` (fine) but only **3.16:1** on the navy header `#0a1f44`
— it clears the 3:1 bar by 0.16 and will read as near-invisible in practice. **Every nav tab and
both header buttons are focusable there.** **[verified]** Fix: re-declare the ring to a light colour
inside the header scope, or use a two-tone concentric outline guaranteed visible on any surface.

*(SC 2.4.7 Focus Visible is AA and only requires "an indicator is visible". The 2px / 3:1 geometry
comes from SC 2.4.13, which is AAA — take the recipe, don't owe the measurement. See 7.20.)*

### 6.5 `env(safe-area-inset-*)` is inert without `viewport-fit=cover`

**[verified — I grepped the whole of `src/` and `index.html`: not one occurrence of `safe-area` or
`env(`. `index.html` line 6 reads `content="width=device-width, initial-scale=1.0"`.]**

A bottom nav on a home-indicator iPhone must pad itself by `env(safe-area-inset-bottom)` — but
`env()` resolves to **0** unless the viewport meta declares `viewport-fit=cover`.

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```
```css
.bottom-nav { padding-bottom: max(12px, env(safe-area-inset-bottom)); }
```

**The meta tag change must ship in the same commit as the bar, or the bar sits under the home
indicator.**

### 6.6 The reduced-motion reset must cap iteration count — live bug

**[verified — `src/index.css` line 137]**

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

Duration collapse only ends a **finite** animation. `.pulse-dot` is declared `animation: pulseDot
1.8s ease-in-out infinite` and is used on the Bracket tab's pre-round badge and the live-round status
chip. Under reduced motion it does not stop — it becomes a maximally fast oscillation, drifting
toward flashing-content territory (SC 2.3.1, Level A) for an element whose whole job is to blink.
**A reduced-motion implementation that is worse than none.**

**Fix — one line:** add `animation-iteration-count: 1 !important;` to the reduce block.

**Second bug in the same block:** `@media (prefers-reduced-motion: reduce) { .cash-fx {
animation-duration: 0.4s; } }` at line 152 is **dead code** — the earlier `!important` universal rule
outranks it, so the intent to keep a gentle cash-in animation is silently not happening.

### 6.7 Sticky chrome must reserve scroll-padding — SC 2.4.11, AA, new in 2.2

"When a user interface component receives keyboard focus, the component is not entirely hidden due
to author-created content." The canonical failures are sticky headers/footers and banners.
**[verified]**

Browsers scroll a focused element to the viewport *edge* — precisely where sticky chrome lives — so
the default browser behaviour actively causes the failure.

This app has a `sticky top-0 z-50` header at `h-16` (64px), and the redesign adds a bottom nav —
sticky chrome on **both** edges, the exact 2.4.11 trap. Add a `Toaster` and a "new results" pill
(2.1) and that is **four** pinned layers on a phone.

```css
html {
  scroll-padding-top: 64px;
  scroll-padding-bottom: calc(64px + env(safe-area-inset-bottom));
}
```

Keep these in sync with real chrome heights via the same CSS custom properties that size them. Make
the update pill auto-dismiss on focus move. **This is cheap now and near-impossible to retrofit once
dozens of scroll containers exist.**

### 6.8 Text scaling — px type ignores a user's font-size preference

SC 1.4.4 Resize Text (AA) requires text be resizable to 200% without loss of content or
functionality. Apple sets a legibility floor: "Text should be at least 11 points so it's legible at a
typical viewing distance without zooming." **[verified]**

Browser *page zoom* scales px, but a user's **default/minimum font size** preference — the most
common low-vision accommodation on mobile — only moves `rem`/`em`.

**Repo counts [verified]:** `text-[10px]` × **64**, `text-[11px]` × **73**, `text-[9px]` × **11**,
`text-xs` (`0.75rem`, scales correctly) × **102**, rem-based inline `fontSize` × **0**.

Two consequences. (1) 9px and 10px are below Apple's 11pt floor outright — and the nav labels are
`text-[10px]` on mobile (`src/App.tsx:245`). (2) Convert the arbitrary bracket values to rem-based
scale tokens so they track root font size.

Related: SC 1.4.10 Reflow requires no loss at **320 CSS px** width. The nav's `overflow-x-auto` is
currently doing that job by scrolling — acceptable for the nav itself, but verify the squad and
market views at 320px with text at 200%.

### 6.9 Text Spacing — SC 1.4.12, AA

No loss of content or functionality when the user overrides to: line height **1.5×** font size,
spacing after paragraphs **2×**, letter spacing **0.12×**, word spacing **0.16×**. **[verified]** It
is tested by injecting a stylesheet, so it fails loudly and mechanically wherever a component's
height was hardcoded to fit its text.

Relevant here because the design uses tight tracking deliberately — `h1, h2 { letter-spacing:
-0.01em }` and `.font-num { letter-spacing: -0.02em }` — and negative tracking is exactly what a user
override reverses. Combined with `text-[10px]` labels inside fixed-height nav buttons and
fixed-`maxWidth` dialogs (360px, 340px, 520px), the risk is **clipped or overlapping labels**.

**Build rule:** no fixed heights on anything containing text — use min-height plus padding. Test with
the standard text-spacing bookmarklet **before** the redesign ships.

### 6.10 SC 3.3.7 Redundant Entry (Level A) makes draft-state recovery a legal requirement

"Information previously entered by or provided to the user that is required to be entered again in
the same process is either auto-populated, or available for the user to select." Exceptions only:
re-entry is essential, required for security, or the previous information is no longer valid. A named
failure is a site that "clears previously submitted form data after displaying validation errors".
**[verified]**

The draft is a multi-step process under two hard constraints, so validation failures are not edge
cases — they are the normal path. **If picking the 10th player breaks the cap or the quota and the
app resets the selection, that is a straightforward Level A failure.** Same for a league join code
asked for twice.

**Build rule:** partial squad state must survive validation errors, back-navigation and reload; never
clear a valid selection to report an invalid one. The "no longer valid" exception does real work
here — if a player is eliminated or repriced between sessions, dropping them conforms, but **show it
as a change, not a silent wipe**.

### 6.11 SC 3.2.6 Consistent Help (Level A) constrains where the "?" can live

"If a web page contains any of the following help mechanisms, and those mechanisms are repeated on
multiple web pages within a set of web pages, they occur in the same order relative to other page
content." Covered: human contact details, human contact mechanism, self-help option (FAQs, support
pages), automated contact mechanism. "Same relative order" means order in the **serialised DOM**, not
pixel position. The Understanding doc is explicit: "It is not the intent of this success criterion to
require authors to provide help." **[verified]**

You already have a qualifying mechanism: the "?" button opening `HowToPlay` (plus
`TransferHelpModal`, `FirstRunTour`). Because it sits in a persistent header, it conforms by
construction. **The redesign is where it breaks:** if help becomes contextual — header on Home, inline
card on Market, footer link on Bracket — that is a Level A failure.

**Constraint for the design system:** one persistent help affordance in a fixed slot in DOM order,
with page-specific help as *additional* content, never as a relocation of the primary one. Since it is
DOM order rather than visual position, a bottom-nav redesign can move it visually.

### 6.12 `aria-modal` is a promise the dialog must keep with focus management

Four requirements, not one: `role="dialog" aria-modal="true"`; focus moved *into* the dialog on open;
focus contained while open; focus *restored* to the invoking element on close. Escape-to-close is a
fifth.

**Current state: one and a half of five. [verified]** Nine dialogs across `src/components/` correctly
declare `role="dialog" aria-modal="true"` with real `aria-label`s (MarketBuyModal,
PurchaseConfirmModal, PlayerPickerModal, SquadLockedModal, TournamentWelcome, three in SquadCourt),
and `useEscapeToClose` in `src/hooks.ts` is well built — it uses a stack so Escape closes only the
topmost, and it ref-counts body scroll lock. But grepping `src/` for `focus()`, `autoFocus`, `inert`,
or any stored last-focused element returns **zero hits**: no initial focus, no trap, no restore.

`aria-modal="true"` tells assistive tech to ignore everything outside the dialog. **If focus was
never moved in, the user is left focused on hidden content with nothing reachable — the attribute
makes the bug worse, not better.** Matters most on `PurchaseConfirmModal` and SquadCourt's manage
sheet: the confirmation steps of the draft and transfer flows.

### 6.13 Checklist summary

| # | Requirement | Level | Status today |
|---|---|---|---|
| 2.2.2 | Pause / stop / hide for auto-updating content | **A** | **Not met** — 5-min poll, no user control |
| 3.3.7 | Redundant Entry — draft state survives errors | **A** | Verify |
| 3.2.6 | Consistent Help in fixed DOM slot | **A** | Met today; at risk in redesign |
| 1.4.1 | Colour not the only channel | **A** | **Not met** — tier by hue; `title=` tooltips on touch |
| 2.3.1 | Three flashes | **A** | **At risk** — `.pulse-dot` under reduced motion |
| 1.4.3 | Text contrast 4.5:1 / 3:1 large | **AA** | **Not met** — `--ink-3` 4.24:1 with a false comment |
| 1.4.11 | Non-text contrast 3:1 | **AA** | **Not met** — `--line` ~1.25:1; `--gold` 2.45:1 |
| 1.4.4 | Resize text to 200% | **AA** | **At risk** — 148 arbitrary-px type uses |
| 1.4.10 | Reflow at 320 CSS px | **AA** | Verify squad + market |
| 1.4.12 | Text spacing overrides | **AA** | **At risk** — fixed heights, negative tracking |
| 2.4.7 | Focus visible | **AA** | Met on light; **3.16:1 on navy header** |
| 2.4.11 | Focus not obscured by sticky chrome | **AA** | **Not met** — no scroll-padding |
| 2.5.8 | Target size 24×24 CSS px | **AA** | Met; below comfort on nav |
| 4.1.3 | Status messages via role/properties | **AA** | Half — Toaster yes, LiveFeed no |
| — | `viewport-fit=cover` + safe-area insets | n/a | **Absent** — blocks the bottom bar |
| — | `animation-iteration-count: 1` in reduce block | n/a | **Absent** — live bug |

---

## 7. Rejected

Explicitly requested. Each entry says what it is and why it does not fit **a 10-player tennis draft,
a fixed 2/3/5 tier quota, a 5-minute match-level feed, and leagues of a handful of managers**.

### First-run and onboarding

**7.1 — FPL's registration flow.** Reject the flow *and* the premise it was cited under (see
Correction 1). FPL survives five fields and an email round-trip on brand pull alone. Copying it
would mean copying nothing.

**7.2 — DraftKings' registration and KYC wall.** Full name, email, phone, SSN, age and location
confirmation before any contest; identity checks before a first deposit; manual ID review (24–48h)
when instant verification fails. **[likely — draftkings.com/how-to-play returned 403; details from
secondary sources]** This isn't UX, it's compliance. DraftKings runs regulated real-money contests
and has no legal option. **Use it as the argument, not the model:** Grand Slam GM has no money, no
age gate and no KYC obligation, so it has no excuse for the hard gate at `App.tsx:143`. Two things
*are* worth stealing — the free-entry principle (never let the first entry cost anything, including
cost in commitment), and beginner protection (a first-timer landing on a board topped by managers
with six events behind them is a discouraging first result; consider a first-timers' board, or at
least surface "best newcomer" alongside overall rank).

**7.3 — Duolingo's front-loaded personalisation questionnaire.** Roughly seven questions before the
first lesson, inside a flow secondary analyses count at ~38 screens. **[unverified — the counts come
from teardown sites, not Duolingo, and onboarding is A/B tested continuously; the *ordering* claim
is consistent across sources, the counts are not]** It works for Duolingo because each answer feeds
a real personalisation decision and the payoff is seconds away. **Reject at that size here:** unlike
a language course there is no per-user curriculum — every manager gets the same 128-player field and
the same $150M. Note the tension *inside the same product*: Duolingo defers the account but
front-loads the questions, and people quoting "Duolingo defers signup" often import the questionnaire
too, which is the wrong half. **The rule that survives: ask a question only if a wrong answer would
produce a visibly different squad.** That admits about three.

**7.4 — Up-front tutorials and coach-mark tours. Reject `FirstRunTour.tsx`.** NN/g ran a
between-subjects remote unmoderated test, 70 participants (35 per group) across 4 iPhone apps, one
group shown deck-of-cards tutorials and one skipping them. Tutorial group rated ease of use
**4.92/7**; skippers **5.49/7**; significant at **p=0.047**. Task success 91% vs 94%; completion time
93.5s vs 85.2s. The tutorial group performed no better and **felt the app was harder**. NN/g's
conclusion: "Tutorials take time and effort to design and develop, and those would be better spent on
making the UI easy to use and thus alleviating the need for a tutorial in the first place."
**[verified]** `FirstRunTour.tsx` is a four-step spotlight tour of the four nav tabs, shown before
the manager has done anything — precisely the shape NN/g measured as neutral-to-harmful. It also
carries real complexity cost: a per-account `tour_seen_at` flag, a localStorage fallback, DOM
measurement against `[data-tour]` attributes, resize listeners, and a code comment recording a past
bug where it teleported the manager off the Market. **Replace with just-in-time teaching at the three
moments where the rules actually bind:** (1) first time a tier slot fills — "Platinum full. 2/3/5 is
fixed, so your last two Platinum picks are your marquee names"; (2) first captain tap — captain ×2,
vice ×1.5; (3) first cash-in — transfers capped at 3 for the whole event. Keep `HowToPlay.tsx` as a
pull-not-push reference; it is well-written and derives its copy from tournament config, so it stays
accurate across a Masters vs a Slam. NN/g's one exception — interactive walkthroughs for genuinely
complex workflows — is better served here by the generated squad, which teaches the quota by
demonstrating a legal one.

**7.5 — Sorare's handicapped starter inventory.** Common cards score only 50% of standard points.
Reject the handicap while adopting the endowment (1.3): in a single-tournament game where the draft
largely decides your result, a deliberately inferior starter squad sours the first session rather
than seeding it.

**7.6 — Guest mode without a state-migration path.** **[likely — inference from this app's
architecture, no external source claims it]** Letting an unauthenticated visitor build the artefact
in local state, then presenting a signup form, then landing them in a fresh empty account. **Strictly
worse than a hard gate:** the hard gate wastes 20 seconds; this wastes the whole first session *and*
destroys trust at the exact moment you asked for an email. Flagged as the precondition on 1.7. This
app is unusually exposed — a Zustand game store, a separate profile store, a CloudSync layer that
already produced a runaway-save incident, and the `?join` handshake at `App.tsx:88–105`. **If that
work isn't in scope, keep the hard gate and build the generated squad instead.**

**7.7 — The published signup-wall drop-off statistics. Reject as evidence.** Widely repeated:
"routinely loses 20–40%"; "for every 100 users who begin registration only 26 complete it"; a
progress bar cutting stage-1-to-2 drop-off from 38.4% to 24.1%; 7 fields → 3 reducing abandonment
44.7%; "sign up with Google" lifting completion 29.3%. I fetched the UXCam benchmarks page
specifically to check provenance: it attributes its table to "Baymard Institute cart abandonment
research, AppsFlyer mobile benchmarks, Nielsen Norman Group research, and pattern data from across
the UXCam product intelligence dataset" — **no linked signup study, no sample size, no time period,
no significance testing**. The "3.9 million sign-up sessions across 480 SaaS products" study several
posts cite does not resolve to a retrievable methodology. **[unverified]** **Do not put these
percentages in a deck; they will not survive anyone checking.** There are exactly three numbers in
this document with a named source *and* a named person or study: Duolingo's ~20% DAU lift (Gotthilf,
First Round Review), NN/g's 4.92 vs 5.49 tutorial finding (70 participants, p=0.047), and Nunes &
Drèze's 19% vs 34% (JCR 2006). Cite those. The *direction* — a wall before first value costs
meaningful activation — is consistent across every source; act on the direction, don't quote a
number for it.

### Live data

**7.8 — The odometer digit roll on fantasy points.** Robinhood's ticker (open-sourced as
`robinhood/ticker`) rolls each digit through intermediate characters to the target, with wrap-around
when shorter, and handles the resize case where "9999" becomes "10000". **[verified — README read
directly; the green-down/red-up direction convention is from a secondary source, another reason not
to copy it precisely]** It works for Robinhood because the value changes many times a minute and the
roll direction encodes the sign pre-attentively. **Reject here:** the value updates at most every
five minutes and **only ever increases**, so the roll would encode information the user already has,
at the cost of making the number unreadable during the animation. It is also spatial motion applied
to a number, violating the M3 rule in 2.10, and it needs a reduced-motion fallback to earn nothing.
A colour flash on a static digit conveys the same "this changed" with none of the cost.

**7.9 — A LIVE badge, a pulsing dot, or point-by-point ambition.** IBM SlamTracker's Likelihood to
Win updates after every point, to a stated latency budget of roughly 5–10 seconds to ingest,
recompute and publish. **[likely — ibm.com returned 403; details from IBM/USTA press coverage]** That
is what a genuine live tennis product looks like, and it works because IBM has an official
point-by-point feed. **Reject firmly, because the data cannot back the claim.** `liveData.ts` states
it plainly: a Wikipedia draw article, polled every 5 minutes, with the comment "Wikipedia trails a
finished match by a few minutes", and a note that "a true in-play feed would need a paid provider".
A pulsing LIVE dot over a feed that is minutes stale and match-granular is **a promise the product
breaks every time a user checks a real score elsewhere** — the fastest way to lose trust in a scoring
app. It would also add a continuously-animating element that triggers WCAG 2.2.2. Use "Results as of
14:32": less exciting, and true. If a paid in-play feed is ever bought, SlamTracker's 5–10s budget is
the bar; do not claim it before then.

**7.10 — Animating the rank counter on every poll.** Common in live fantasy leaderboards and
third-party FPL live-rank tools. **[likely]** It works for engagement metrics, not for the user.
**Rank is the one number in this product that genuinely falls, and it falls for reasons entirely
outside the manager's control** — other managers' players winning. Animating it maximises the
salience of a number the user cannot act on. **Reject the animation, keep the number:** show rank as
a settled value with a delta against a stable reference ("12th, +3 since Round of 32"). Because
points are monotonic, rank is the *only* volatile figure in the app — which means it is where the
entire anxiety budget should be spent, and the correct spend is restraint. If a delta must be shown
live, batch it to the round boundary the way FPL batches prices.

**7.11 — Colour as the only channel for a change.** Green-up / red-down as the sole encoding.
**Reject as a sole channel.** Roughly 1 in 12 men has a red-green colour vision deficiency and this
audience skews male tennis fans; WCAG 1.4.1 requires colour not be the only visual means of conveying
information. Every flash-and-fade needs a second channel — an arrow, a sign, or the sentence. **This
app has a specific trap:** the palette already uses `--ember` (red-orange) for **urgency** in
`Countdown.tsx`, so reusing red for "value went down" would collide with "deadline approaching".
**Pick one meaning per colour.** **[verified]**

**7.12 — A toast (or a push) per result.** DK Live's play-by-play model works for a companion app a
user opens *because* they want the firehose. **Reject for the in-app case:** a 5-minute poll can
deliver several results at once, so per-result toasts arrive as a **burst** — the definition of an
unstable, nagging screen — and stack pinned layers into the 2.4.11 problem (6.7). Replace with a
single batched summary ("3 results — you gained 22") in a persistent, non-interruptive results log
the manager scrolls on their own schedule. **[likely]**

### Constrained selection

**7.13 — Greying out what you can no longer afford. Reject as a default.** This was proposed in the
brief; it is **not** what FPL does. Three reasons. (1) Price is absent from FPL's disable condition,
and dimming is reserved for already-picked rows; the affordability treatment is an opt-in filter chip
instead. (2) It deletes the trade-off — late in a $150M draft most of the field goes dark and the
manager can no longer see the choice they'd have to make to reach a star; **the interface has
silently decided the strategy.** (3) On mobile the explanation channel does not exist: the current
build's `title={"Costs $42M — over your remaining budget"}` never renders on touch, so the user gets
a dead button with no reason. NN/g: "Disabled buttons often confuse users by appearing clickable but
providing no response or feedback." **[verified]** Keep greying only for truly enumerable refusals
(tier full, squad full, eliminated) and offer "Affordable ($38.5M)" as the opt-in equivalent.

**7.14 — FPL's price-change economy and 50%-profit sell rule.** Prices drift by £0.1m increments on
net transfer volume; selling returns only £0.1m of profit for every £0.2m of rise. **[verified]** It
works for FPL because a season is ten months long: prices become a second scoreboard and team value
becomes a competence signal. **Reject — wrong time horizon and a duplicate mechanic.** A Grand Slam
GM event lasts under two weeks; prices derive from ATP ranking (a stale-rankings hazard this project
has already been bitten by); and `MAX_TRANSFERS=3` plus the cash-in refund already supply the
anti-churn friction FPL's sell tax provides. Adding drifting prices would create a second currency to
monitor and reward *opening the app often* rather than *picking well*. Do borrow the transparency
instinct in one narrow place: state an eliminated player's refund figure **before** the cash-in —
which the app already does.

**7.15 — A third simultaneous constraint (Sorare's cap + scarcity + eligibility).** A Sorare lineup
must satisfy a division points cap denominated in recent-form scores, eligible scarcity tiers, and
per-competition eligibility ("Eligible cards", "Ineligible Player", "Ineligible League", "Partial
Eligibility"). **[likely — strings verified from the bundle; specific cap values second-hand, Sorare's
own post returned 403]** It is load-bearing for Sorare because managers own an arbitrary, uneven
collection. **Reject:** Grand Slam GM already carries three interacting constraints ($150M, exact
2/3/5, 10 slots) and managers pick from an open field — there is nothing for a fourth rule to do
except add refusal states. **Take Sorare's naming discipline instead of its rule count:** "Total
points above cap" is worth copying; the cap-plus-scarcity-plus-eligibility stack is not.

**7.16 — Like-for-like replacement scoping during live transfers.** An FPL transfer must bring in a
player "in the SAME position as your departing player", so an illegal transfer is unrepresentable.
**[verified]** **Adopt the technique in the draft** (tap an empty Platinum slot → Platinum-filtered
market, 3.7) but **reject it live**, where Grand Slam GM deliberately drops the tier quota after
lock: cash in a Silver, buy any tier. That freedom is the point of the cash-in economy — an
eliminated Platinum should be able to become two Silvers. Scoping the live pool by tier would quietly
re-impose a rule the game removed on purpose, and the header copy already promises "buy a replacement
of any tier below".

### Prompts, nagging and navigation

**7.17 — Guilt and confirmshaming escalation.** Duolingo's "You made Duo sad" and progressively more
emotionally charged inactivity pushes; Duolingo has publicly discussed guilt-framed pushes performing
measurably better than neutral ones. **Reject unconditionally.** The FTC's dark-patterns report
defines confirmshaming as design that uses "emotive wording around disfavored options to guilt
consumers into choosing favored options", and classifies repeated declined requests as nagging under
coerced action. **[verified for the FTC definitions]** This is a small private-league product played
by friends; guilt copy from a fantasy app about a tennis draw reads as absurd rather than motivating,
and it burns the one thing a small social product runs on. The leaderboard already supplies real
social consequence. *(The widely-cited "62% felt guilty / 34% felt anxious" 2022 survey of 1,500
users is repeated across secondary blogs with no traceable primary source — **[unverified]** — though
the pattern itself is well documented.)*

**7.18 — Daily streaks as the engagement spine.** **[likely]** For a product where the desired
behaviour genuinely *is* daily, a streak aligns with the goal. **Grand Slam GM's real rhythm is the
draw, not the day:** roughly seven decision points across a fortnight, separated by days where the
correct behaviour is to do nothing. A daily streak would reward opening the app on days when the app
has *explicitly told the manager there is nothing to change* — training exactly the compulsive
checking you want to design out, and contradicting the app's own honest "nothing to do" state. If a
persistence metric is wanted, count **tournaments entered**, or **rounds where the manager set a
captain before lock** — behaviours actually in the user's interest.

**7.19 — Surfacing "what everyone else is doing" as a prompt.** Robinhood's Top Movers. Barber,
Huang, Odean & Schwarz (*Journal of Finance*, 2022) found Robinhood users engage in more
attention-induced trading than other retail investors and herd into whatever the app surfaces; the
top stocks bought each day showed average 20-day abnormal returns of about **−4.7%**. **[verified]**
**Reject as a prompt; permit as information behind a tap.** A "most transferred in this round" or
"X% of managers captain Sinner" module in the coaching slot converts a decision the manager should
own into crowd-following, and **in a league of four it collapses the variety that makes the league
fun**. If ownership data is shown at all, put it inside the player detail page where it answers a
question the manager asked — not on Home, where it asks the question for them.

**7.20 — The coaching card as a second navigation bar.** **[verified in this codebase]** The
draft-closed, `st.underway && !st.live`, `st.underway` and finished branches of `NextMove.tsx`'s
`buildView` all return `actions` arrays whose entries are **pure tab changes** to `'tournament'` and
`'league'` — destinations the nav already reaches in one tap. Every state therefore renders a
full-width primary button, so the button stops meaning "this is urgent". **Strip them.** Reserve the
card's primary button exclusively for actions with a lock deadline; in every other state the card
should be text-only and physically smaller.

**7.21 — The current horizontally-scrollable top nav row.** Combines three anti-patterns: navigation
in the hardest thumb-reach zone; a partial-hiding mechanism with **no affordance** (`no-scrollbar`
hides the scrollbar, so there is no cue that content extends beyond the viewport), which is the
hidden-navigation condition NN/g measured at >20% discoverability cost; and an overflow behaviour
Apple explicitly tells you to limit. The `min-h-[44px]` on each button is correct and should be
preserved. **[verified]**

**7.22 — The overflow / "More" tab.** Apple: "If horizontal space limits the number of visible tabs,
the trailing tab becomes a More tab... The More tab makes it harder for people to reach and notice
content on tabs that are hidden, so limit scenarios in your app where this can happen." **[verified]**
**Duolingo is living proof of the cost** — the most heavily-optimised habit app on the market
outgrew its own bar and now instructs users in its official Practice Hub guide: "If you don't see a
barbell icon, tap the circle icon with three dots ••• which will open an extended menu where you can
see the barbell icon." **[verified]** They had to publish documentation explaining where one of their
own core features went. Reject overflow, and reject its cousin `overflow-x-auto`.

**7.23 — A Strava-style centre action button.** Strava keeps a centre slot for Record — an action,
not a destination, in flat violation of the tabs-are-places rule. **It survives because Strava has
exactly one primary verb and it never changes**, so it effectively becomes a place. **Reject here:**
this app's primary verb rotates through *draft your squad* → *set your captain* → *cash in an
eliminated player* → *nothing at all once transfers are spent*. A centre button whose meaning rotates
through four states is the unstable-map problem in a single control. Material points the same way:
"only one floating action button is recommended per screen" for "the most common action", and this app
has no single most-common action across the tournament lifecycle. Use the phase-aware contextual bar
(5.6) instead. **[likely]**

**7.24 — Modelling the tab bar on the ATP official app.** ATP WTA Live uses four bottom tabs —
Scores, Calendar, Latest, Rankings — with the ATP/WTA switcher at the top rather than in the bar.
**[likely — read from an App Store listing summary, not the running app]** It works for a consumption
app with four parallel content feeds of equal standing, none of which owns any user state. **Reject
as a template:** Grand Slam GM has a user-owned object (the squad) with no ATP-app equivalent, and
that object deserves the prime slot. **Borrow one detail — the negative space:** the sport's own
official app gives the draw no top-level tab. Strong external signal that Bracket doesn't need one.

**7.25 — Treating FPL's navigation as a peer model.** There is **no standalone official FPL app**.
Fantasy Premier League is one feature inside the Premier League app, alongside Matchday Live,
Matchday Stories, myPremierLeague, Premier League Radio and the Archive. FPL's internal sections
(Pick Team, Transfers, Leagues, Fixtures, Statistics, The Scout) sit one or more levels below the
app's top-level navigation. **Reject the IA as a model**, and be sceptical of any teardown presenting
"FPL's tabs" as a bottom-bar reference — the constraint FPL solved is "fit a fantasy game inside
someone else's app", which is the opposite of this problem. **[unverified for the official PL app's
own tab labels — my fetch of its App Store page returned the App Store's own chrome (Today, Games,
Apps, Arcade) mixed with feature copy, which is not evidence. Do not build against a claimed FPL or
PL-app tab list without seeing it on a device.]**

### Accessibility misreads

**7.26 — `user-scalable=no` or `maximum-scale=1` to stop iOS input zoom.** The reflex fix a developer
will reach for the moment the 9/10/11px type from 6.8 meets a form field. It trades a cosmetic
annoyance for a **1.4.4 Resize Text failure at Level AA**. The correct fix is setting form inputs to
a computed 16px minimum — the threshold at which iOS stops auto-zooming. **Good news:** `index.html`
currently has neither attribute, so this is a **regression to prevent, not one to undo** — and the
`viewport-fit=cover` change (6.5) is exactly the edit where someone might add it by accident. **Write
it into the design system as a banned attribute.** **[verified]**

**7.27 — 48dp applied uniformly to the bracket and leaderboard.** For primary controls it works. For
a 128-slot bracket it does not — 48px nodes plus 8dp separation cannot render a full draw at 320 CSS
px without either two-dimensional scrolling (which 1.4.10 Reflow disallows for content that doesn't
require it) or destroying the at-a-glance read that makes a bracket a bracket. Material's own spec
pairs the 48dp figure with "to ensure balanced information density and usability" — **density is part
of the goal, not the enemy**. The conforming route is 2.5.8's Spacing exception plus its Equivalent
exception. **Reject as a blanket rule, keep as a tiered one.** **[verified]**

**7.28 — Treating SC 2.4.13 Focus Appearance and SC 2.5.5 Target Size (Enhanced) as part of the AA
bar.** Both are **Level AAA**. 2.5.5 is the source of the 44px figure people quote as "the WCAG
rule"; the AA rule (2.5.8) is 24px. **Reject them as gates, borrow their numbers as defaults.**
Loading AAA criteria into the checklist makes it unachievable and encourages skipping it wholesale.
Take 2.4.13's "2 CSS pixel thick perimeter, 3:1" as the ring recipe — which the repo already does —
without owing the full AAA measurement procedure. **Distinguishing "must pass" from "chose to exceed"
is what keeps the checklist honest.** **[verified]**

---

## 8. What I could not verify

Listed so nobody quotes these as fact.

| Claim | Status |
|---|---|
| Signup-wall drop-off statistics (20–40%, 26/100, 38.4%→24.1%, 44.7%, 29.3%) | Marketing claims presented as data; provenance checked and found vague |
| Robinhood's "11 fields, 16 clicks" onboarding specifics | Medium teardowns and template sites only |
| Duolingo's "~38 screens" / "seven questions" onboarding counts | Teardown sites; onboarding is continuously A/B tested |
| Duolingo streak-freeze effect (17.19 vs 11.62 days) | Vendor blog; no Duolingo-published number found |
| Duolingo guilt survey ("62% felt guilty / 34% anxious", 1,500 users) | Repeated across secondary blogs, no traceable primary |
| Sorare starter-pack card counts (5, 12, 25) | Differ across write-ups; the *pattern* is verified from Sorare's own docs |
| Sorare division points-cap values (e.g. 260) | Sorare's own post returned 403; figures second-hand |
| DraftKings bet-slip odds-change option labels | Help article is JS-rendered; from secondary sources |
| DraftKings' tab labels and slip behaviour | App Store listing describes verticals, not navigation |
| The official Premier League app's own bottom tab labels | App Store fetch returned App Store chrome, not app UI |
| ATP WTA Live's four tabs (Scores, Calendar, Latest, Rankings) | From an App Store listing summary, not the running app |
| IBM SlamTracker's 5–10s latency budget | ibm.com returned 403; from IBM/USTA press coverage |
| M3's own 48dp page text | `m3.material.io` is a client-rendered SPA; corroborated via Material 1 spec and Android docs |
| DraftKings' "average remaining salary per player" display | From an MLSsoccer.com walkthrough, not a DraftKings source |
| Duolingo KDD 2020 paper internals (satiation framing, reward window) | Could not extract the PDF; from title/abstract and secondary write-ups |
| Strava having *no* re-engagement nag | Inferred from their notification docs not listing one — absence of evidence |
| Nav width arithmetic (~50pt per tab at 375pt) | My estimate from the source; not measured on a device |
| The "N new items" pill as a named product pattern | Widely used; I did not verify a specific product's implementation |

Everything else in this document is either a primary source I fetched and read, or a measurement I
made against this repository.

---

## Appendix — primary sources fetched and read

**Products.** premierleague.com (registration guide, 2026/27 squad-picking changes, FPL basics,
price changes, deadline reminders, provisional scoring); `fantasy.premierleague.com/assets/index-rye0D5CU.js`
(production bundle — AddElement, validity selector, scoreboard, filter chips, list rows, auto-pick
strings); `sorare.com/assets/index-DgF4DxVq.js` (lineup-builder message catalogue);
help.sorare.com (starter cards, Casual League); robinhood.com/us/en/stocks/AAPL (fetched
anonymously); atptour.com/en/scores/current (live DOM inspected with getBoundingClientRect and
getComputedStyle); blog.duolingo.com (Path redesign, Practice Hub guide); support.strava.com
(notifications); press.strava.com and bikerumor.com (navigation redesign); github.com/robinhood/ticker;
ag-grid.com (cell change flash); apps.apple.com listings (ATP WTA Live, DraftKings).

**Research and guidance.** review.firstround.com (Gotthilf on A/B testing at Duolingo);
nngroup.com (mobile tutorials; mobile app onboarding; hamburger/hidden navigation; push
notifications; skeleton screens; disabled buttons); uxmatters.com (Hoober, how users hold devices;
design for fingers); Nunes & Drèze, *Journal of Consumer Research* 32(4), 2006; Barber, Huang, Odean
& Schwarz, *Journal of Finance*, 2022; ftc.gov, "Bringing Dark Patterns to Light";
design.google/library (Robinhood); cnbc.com (Robinhood confetti removal).

**Design systems and standards.** developer.apple.com/design/human-interface-guidelines (tab bars,
live activities, accessibility); developer.apple.com/design/tips; m1.material.io (bottom navigation,
accessibility); m3.material.io (motion); support.google.com/accessibility/android; w3.org/TR/WCAG22
and the WCAG 2.2 Understanding documents for SC 1.4.1, 1.4.3, 1.4.4, 1.4.10, 1.4.11, 1.4.12, 2.2.1,
2.2.2, 2.3.3, 2.4.7, 2.4.11, 2.4.13, 2.5.5, 2.5.8, 3.2.6, 3.3.7, 4.1.3; developer.mozilla.org (ARIA
live regions, font-variant-numeric, prefers-reduced-motion); web.dev/articles/cls.

**This repository.** `src/App.tsx`, `src/index.css`, `index.html`, `src/pages/DraftPage.tsx`,
`src/pages/LeaguePage.tsx`, `src/pages/TeamPage.tsx`, `src/components/NextMove.tsx`,
`src/components/LiveFeed.tsx`, `src/components/Toaster.tsx`, `src/components/Countdown.tsx`,
`src/components/FirstRunTour.tsx`, `src/components/HowToPlay.tsx`,
`src/components/TournamentWelcome.tsx`, `src/data/liveData.ts`, `src/data/useLiveFeed.ts`,
`src/data/squadRules.ts`, `src/scoring/serverEngine.ts`, `src/hooks.ts`.
