# Grand Slam GM — format options

Simulation study, 17 Aug 2026. Questions asked: *is 40 points for the Final too much, should the
squad be 8 rather than 10, and what makes player selection actually matter?*

**Method.** Monte-Carlo over the **real** Cincinnati field, real prices, real quotas and the real
scoring engine (`scripts/sim-formats.mjs`). Match model `P(A beats B) = logistic(0.5·ln(rankB/rankA))`,
calibrated so #1 beats #10 ≈76% and #1 beats #100 ≈91% — close to ATP hard-court base rates.
20 configurations: 5 points curves × 4 squad shapes.

Each configuration puts **three informed drafters** (chalk / value / contrarian) against **three
random drafters** in the same league, on the same simulated tournament. Captain and vice are chosen
optimally for everyone, so the *only* difference between managers is who they drafted — which is
exactly the thing being measured.

**SKILL EDGE** = how much more often an informed drafter wins than a random one. +50% means informed
wins 75% of leagues to random's 25%. It is the number that answers *"does picking well matter?"*.

> **Precision note.** Headline rows below are 4,000 tournaments each. Rows marked † are 1,200 and
> carry roughly ±3% noise on skill edge — enough to reorder near-ties, so they are not used to
> support any conclusion.

---

## Finding 1 — player selection already matters, and nothing tested changes that

| Curve (R64·R32·R16·QF·SF·F) | Skill edge | Points spread | % of points from QF on | Final flips league |
|---|---|---|---|---|
| **A — current** 1·2·5·10·20·40 | +51.5% | 24.1 | 69% | 10% |
| **B — flatter** 1·2·4·8·14·22 | +52.0% | 16.5 | 63% | 10% |
| **C — early-fat** 2·3·5·8·13·20 | +50.8% | 16.6 | 51% | 10% |
| **D — linear** 1·2·3·5·8·13 | +51.8% | 10.5 | 53% | 10% |
| **E — flat-ish** 3·4·6·9·14·20 | +49.9% | 18.6 | 46% | 10% |

*(10-player squad, 2/3/5, $150M — today's format)*

Skill edge sits at **~51% in every curve**, and at **51–54% across every squad shape too**. The
variation is inside the noise band. An informed drafter wins roughly **three leagues in four** — and
that is true of today's format and of all nineteen alternatives.

**So the honest answer to "how do I make player selection relevant?" is: it already is.** Neither
the points curve nor the squad size is the lever for that. This is the opposite of the intuition
that prompted the question, and it is the most useful result in the study, because it means the
format choice can be made entirely on other grounds.

## Finding 2 — 40 points for the Final is defensible; the *first week* is the real problem

The Final overturns the standings only **10% of the time**. The leader going into the Final wins
about 90% of leagues. The Final is dramatic without being decisive — ×40 is not too much.

The defect is at the other end. Under the current curve **69% of all points come from the QF
onward**, leaving R64 and R32 worth roughly **10% between them**. The first week is close to
ceremonial. That is what the curve genuinely controls — from 69% down to 46% across the options —
and it changes how long the season *feels* alive without changing who wins.

## Finding 3 — 8 players works, but the budget must come down with it

| Squad | Skill edge | Points spread | Verdict |
|---|---|---|---|
| 10 · 2/3/5 · $150M | +51.5% | 24.1 | today |
| 8 · 2/2/4 · **$150M** | +53.9% | **15.6** | ✗ squads converge |
| 8 · 2/2/4 · **$120M** | +51.6% | 23.0 | ✓ works |
| 8 · 1/3/4 · $120M † | +50.0% † | 14.9 † | ✗ weakest shape |

Cutting to 8 players while keeping $150M is the trap: with two fewer slots and the same money,
**everyone can afford the stars**, squads converge, and the spread between managers collapses from
24 to 16. Managers finish closer together — the format gets *less* interesting.

Take the budget to **$120M** and the spread is preserved (23.0). Eight picks with real scarcity
means each individual pick carries more weight than one of ten, even though the measured skill edge
is unchanged. Dropping to a single Platinum is the weakest shape tested on both axes.

---

## The three options

Because skill edge is invariant, these are ranked on the two dials that *do* respond: **how alive
the early rounds are** (late %), and **how far apart managers finish** (spread).

### Option 1 — Keep 10 players, flatten the curve
**10 · 2/3/5 · $150M · points 1·2·4·8·14·22**

- Late concentration **69% → 63%**
- Spread 16.5 · skill edge +52.0%
- Final still worth 22 — a real prize, no longer a cliff

The conservative choice. Nothing about squad building changes, so no manager relearns anything and
squads already drafted stay meaningful. It shaves the top of the curve and nothing else.

**Pick this if** the priority is "don't disrupt a running competition".

### Option 2 — Keep 10 players, early-fat curve
**10 · 2/3/5 · $150M · points 2·3·5·8·13·20**

- Late concentration **69% → 51%** — the most balanced season available without changing the squad
- Spread 16.6 · skill edge +50.8%
- R64 + R32 rise from ~10% of all points to roughly a quarter

The best value-for-disruption. One number changes — the points table — and the first week stops
being ceremonial. The scoreboard moves from day one and the Final still decides plenty.

**Pick this if** the priority is "fix the dead first week with the smallest possible change".

### Option 3 — 8 players, $120M, early-fat curve
**8 · 2/2/4 · $120M · points 2·3·5·8·13·20**

- Late concentration **53%** · spread 16.1 · skill edge +51.2%
- Eight picks instead of ten, on a tighter budget

Everything Option 2 delivers, plus a structurally tighter draft: fewer slots and less money means
no room for a lazy pick, and each one is a larger share of your squad. The cost is that it changes
two things at once, and every manager has to relearn squad building.

**Pick this if** the priority is "the best game", and the relearning cost is acceptable.

---

## Recommendation

**Option 2**, with Option 3 if you want the structural change as well.

Option 2 fixes the one defect the data actually exposes — a first week worth almost nothing — for
the price of editing a single table of six numbers. Option 1 helps less for the same disruption.
Option 3 is a good format but earns its extra disruption on feel rather than on any measurable
improvement, since the skill edge is flat across all three.

Two caveats worth stating plainly:

1. **Do not change the format mid-tournament.** Cincinnati is at the R32 stage with four active
   managers and scores on the board. Any of these should start at the next event.
2. The simulation captains optimally for every manager. Real managers do not, so real skill edges
   will be lower than the figures above across the board. The *ranking* is unaffected — every
   option shares the assumption.

## What was not modelled

- **Transfers and cash-in** are excluded here. They are swept separately in `scripts/sim-balance.mjs`,
  which shows the current 3-transfer cap produces a healthy draft-skill gap (~27 points), while
  unlimited transfers flatten it to ~11.
- **The upset multiplier** is held at its current setting throughout. It is an independent dial and
  probably the more interesting one to study next: it is the main reason a cheap squad can compete
  with an expensive one, and unlike the points curve it plausibly *does* move the skill edge.
- **Human behaviour.** Managers here are archetypes. Real leagues have heavily correlated picks
  (everyone owns the same three favourites), which compresses spread in ways this does not capture.
