# UX proposal — Grand Slam GM

**Status: in progress.** This records the reasoning behind the redesign and is updated as it is
built. Two changes are already live on the revamp preview; the rest is listed with its rationale so
you can argue with the thinking before the code exists.

**Preview:** https://ux-revamp.grand-slam-gm.pages.dev
**Branch:** `ux-revamp` — production is untouched.

---

## The finding everything else follows from

I could not query PostHog — the repo holds only the write-only project key, and the query API needs
a personal one. So I queried the database instead, which for the question you actually asked turns
out to be better evidence: not where people tapped, but where they *stopped*.

**Of eight Cincinnati managers, four scored zero.** All eight picked a captain, so nobody was idle.

| Manager | Squad | Budget left | Verdict |
|---|---|---|---|
| `88f692fa` | **10, exactly 2/3/5, legal** | **$0.0** | Finished the puzzle. Never pressed the button. **23 saves.** |
| `32828145` | 7 | $7.0 | **Mathematically stuck** — needed $26M of players, had $7M |
| `51face7f` | 2 | $69.0 | $4M from the same trap |
| `524e264f` | 6 | $31.0 | Could have finished with $15M spare |

This is not a product people find confusing in the abstract. It is a product that loses half its
players at two specific, identifiable moments. Everything below is aimed at those two moments first.

---

## What I am deliberately keeping

You asked to be told where the design is right. These are good and I am not touching them:

- **The tier filter chips in the Market** (`Platinum 1/2`, `Gold 3/3 ✓`, `Silver 3/5`). Genuine
  progress feedback at the moment of choice. Best thing on the screen.
- **The disabled-button label that says what's missing** — "Need 1 Platinum, 2 Silver" rather than a
  greyed-out button and silence. Right instinct, and I extended it rather than replacing it.
- **Per-tournament isolation.** Each event keeping its own squad and standings is what makes the
  season-long story possible, and it is cleanly built.
- **The upset multiplier as a single graduated factor** rather than a separate bonus. Elegant, and
  the maths is genuinely fair.
- **The live-derived budget and score.** Refunds land automatically with no "play the round" step.
- **The player video links.** A newcomer to tennis has no idea who these people are, and a one-tap
  route to watching them play is a better answer than more statistics.

---

## Change 1 — "Save my squad", not "Lock Squad" *(built)*

**Why.** `88f692fa` did everything right and scored nothing. "Lock" is both scarier and less
accurate than what happens.

**Verified before building, as instructed:** `save_entry` freezes nothing until a match has a result
(gate f2, `if v_started then`). Before the first ball is struck the whole entry is editable. The old
label asserted the opposite of the truth.

**What changed:** the button reads **"Save my squad"**, in green rather than blue, with a line
beneath it — *"You can change your squad and captains as often as you like until the first round
starts."* The countdown note that said *"Lock your squad before then"* now says saving is
changeable until the round starts. Finality is carried by the deadline, where it is true.

**Not changed:** the post-result freeze, which is what makes the game fair and is enforced in the
database on purpose.

**Judgement call:** I kept a single button rather than splitting "save draft" from "confirm entry".
Two buttons would be more explicit and would also re-create the hesitation we are removing.

---

## Change 2 — make the finish line visible *(built)*

**Why.** `32828145` could not complete their squad and the app never said so. The Market showed
every Platinum greyed out as *"over your remaining budget"* — which reads as "not right now", not
"never, and you must sell someone". `51face7f` was $4M from the same trap.

The rules were **enforced but never projected**. A budget is only a puzzle if you can see whether
the puzzle is still solvable.

**What changed:** a panel above the player list that computes, at every step, what you still need,
the cheapest legal way to finish, and whether you can afford it.

- On track → *"3 more to pick. You need 2 Gold and 1 Silver. The cheapest way to finish costs $41M
  of your $63.0M."*
- Nearly stuck → a warning that one pricier-than-minimum pick could strand them.
- Stuck → *"You can't finish this squad… You're $26M short"*, plus the specific way out: which
  player to sell, with a one-tap button when a single sale fixes it.

**Judgement call:** I chose to let managers *reach* a dead end and then rescue them, rather than
preventing it by disabling any pick that would strand them. Pre-emptive blocking would be safer and
would also turn the draft back into a form — the opposite of what you asked for. The constraint
should be visible, not invisible-and-enforced.

---

## Changes proposed but not yet built

Ranked by the evidence behind them.

**3. The zero-score explanation.** In the `88f692fa` state the app shows three signals, none of them
the true one: the save button says *"Saved"*, the score says *"0.0"*, and the leaderboard says
*"Draft your squad to join the Public League"* to someone holding ten players. Nothing says *"your
squad isn't entered yet"*. This is the same bug as Change 1 seen from the Home screen, and it should
say so plainly and link straight to the fix.

**4. The Market table is a desktop table on a phone.** Ten columns — ATP, Player, Age, Win %, W–L,
Titles, Price, Grass, Hard, Clay — at 375px. This is where the whole game is played and it is the
least phone-shaped screen in the app.

**5. "Check tiers" is not a message.** The Home squad card says *"Check tiers"* when a squad is
10/10 but off-quota. It doesn't say which tier, or by how much — while the Market, two taps away,
knows exactly. The same fact is computed in more than one place and phrased worse in the more
prominent one.

**6. The rules modal fires unprompted on first visit** with seven blocks of text before you have
seen anything. This is the "too much text" complaint, and the fix is to teach the two rules that
gate the first action and let the rest be looked up.

---

## Out of scope, deliberately

- **Anything touching the rules of the game** — scoring, budget, quotas, transfer counts, deadlines,
  visibility. Your list, your call, and nothing here needs it.
- **Server changes** to `save_entry`, RLS or scoring. Change 1 needed only a verification that the
  server already behaves as we want; it does.
- **The `initialSquad` scoring hole** found by today's audit. It has its own deadline (the US Open
  draft) and is a security fix, not a UX one.

---

## Getting back to the current version

Production is on `master` and was never touched by any of this. The revamp lives on `ux-revamp` and
deploys only to its own URL.

```bash
git checkout master
```

And if a production build ever needs restoring to the exact version live before this work:

```bash
git checkout release-20260818-105122Z && npm run deploy
```

---

## What I would like your opinion on

1. **Tone of the stuck message.** It currently says *"You can't finish this squad"* — direct, and
   arguably blunt for someone who has just discovered they wasted their budget. The alternative is
   softer and less clear. I chose clear.
2. **Whether the dead end should be preventable at all.** I let you reach it and then rescue you.
   The other option is to stop you getting there — safer, less like a game.
3. **Green for the save button.** It reads as "go" rather than "commit", which is the point, but it
   is now the same colour as the app's success states.
