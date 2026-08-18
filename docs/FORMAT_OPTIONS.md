# Grand Slam GM — format options, with pros and cons

Simulation study, 17 Aug 2026.

**Method.** Monte-Carlo over the **real** Cincinnati field, real prices, real quotas and the real
scoring engine (`scripts/sim-formats.mjs`). Match model `P(A beats B) = logistic(0.5·ln(rankB/rankA))`,
calibrated so #1 beats #10 ≈76% and #1 beats #100 ≈91% — close to ATP hard-court base rates.
20 configurations: 5 points curves × 4 squad shapes, 4,000 tournaments each.

In every configuration, **three informed drafters** (chalk / value / contrarian) play **three random
drafters** in the same league on the same simulated tournament. Captain and vice are picked optimally
for everyone, so the *only* difference between managers is who they drafted.

**The four measures used throughout:**

| Measure | What it tells you | Why you care |
|---|---|---|
| **Skill edge** | how much more often an informed drafter beats a random one | does picking well matter? |
| **Spread** | gap in average points between the best and worst strategy | do managers finish far apart or bunched? |
| **Late %** | share of all points earned from the QF onward | is the first week worth playing? |
| **Flip %** | how often the Final overturns the standings | is the last day dramatic or decisive? |

---

## The two findings that shape every option

### 1. Player selection already matters — and no format tested changes that

Skill edge is **~51% in every points curve** and **51–54% across every squad shape**. That variation
is inside the noise band. An informed drafter wins roughly **three leagues in four**, today and in all
nineteen alternatives.

So the honest answer to *"which format makes player selection relevant?"* is: **they all do, equally.**
Neither the points curve nor the squad size is the lever for that. This is the opposite of the
intuition behind the question, and it's the most useful result here — it frees the decision to be made
on other grounds.

*(If you do want to move that dial, the lever is the **upset multiplier**, not the curve. It is the
main reason a cheap squad keeps up with an expensive one. Untouched in this study; worth its own.)*

### 2. The Final isn't the problem — the first week is

The Final overturns the standings only **10%** of the time; the leader going in wins ~90% of leagues.
**×40 is dramatic without being decisive, and is defensible as it stands.**

The real defect is at the other end. Under today's curve, **69% of all points come from the QF onward**,
leaving R64 and R32 worth about **10% between them**. The first week is close to ceremonial. That is
what the curve genuinely controls — 69% down to 46% across the options.

---

## Format 0 — What you have today
**10 players · 2 Platinum / 3 Gold / 5 Silver · $150M · points 1·2·5·10·20·40**

Skill edge **+51.5%** · Spread **24.1** · Late **69%** · Flip **10%**

**Pros**
- **Widest spread of any option (24.1).** Managers finish far apart, so the league table has a clear
  shape and winning feels earned.
- **Maximum late drama.** The Final is worth 40; a single match can swing a visible chunk.
- **Zero disruption.** It is running now, and four managers have live scores against it.
- Player selection already rewarded as well as any alternative.

**Cons**
- **The first week is nearly pointless.** R64 + R32 ≈ 10% of all points. A manager who opens the app
  on day three sees almost nothing on the board, which is a plausible contributor to the drop-off.
- **Big early leads are hard to read.** With 69% of points still unplayed after R16, the standings you
  see for most of the tournament are not very informative.
- **The 1-point opening round feels like a rounding error** next to a 40-point Final — the single
  most common source of "I don't understand the scoring".

---

## Format 1 — Flatten the curve
**10 · 2/3/5 · $150M · points 1·2·4·8·14·22**

Skill edge **+52.0%** · Spread **16.5** · Late **63%** · Flip **10%**

**Pros**
- **Cheapest possible change.** One table of six numbers. No squad rules change, nothing to relearn,
  squads already drafted stay meaningful.
- **Takes the edge off the cliff.** The Final drops 40 → 22, so no single match dwarfs a whole week.
- **Skill edge unchanged** (+52.0%), so nothing of competitive value is lost.
- Lowest-risk option to ship mid-season if you ever had to.

**Cons**
- **Barely fixes the actual problem.** Late share only moves 69% → 63%. The first week is still worth
  about an eighth of the tournament — better, but not fixed.
- **Costs a third of the spread** (24.1 → 16.5). Managers bunch closer together, so the table is less
  decisive than today's.
- Pays a real price (less separation) for a modest gain (slightly less back-loading). **Worst
  benefit-per-cost of the three.**

---

## Format 2 — Early-fat curve *(recommended)*
**10 · 2/3/5 · $150M · points 2·3·5·8·13·20**

Skill edge **+50.8%** · Spread **16.6** · Late **51%** · Flip **10%**

**Pros**
- **Actually fixes the first week.** Late share 69% → **51%**. R64 + R32 rise from ~10% of all points
  to roughly a quarter. The scoreboard moves from day one.
- **Same tiny implementation cost as Format 1** — six numbers — but nearly three times the effect on
  season shape.
- **The Final still matters**: 20 points remains the biggest single prize, and flip % is unchanged at
  10%. You lose the cliff, not the drama.
- **Better spread than Format 1** (16.6 vs 16.5, effectively equal) for a far larger gain.
- Makes the game much easier to explain: the numbers 2·3·5·8·13·20 read as a smooth progression,
  where 1·2·5·10·20·40 reads as a doubling gimmick.

**Cons**
- **Spread still drops** from 24.1 to 16.6 versus today. Any flattening costs separation — this is
  unavoidable, not specific to this option.
- **A big early lead becomes harder to overturn**, because more of the total is already banked by the
  QF. Leading managers are rewarded; a manager who joins late has less runway.
- Changes the headline number everyone knows ("the Final is worth 40"), which needs communicating.

---

## Format 3 — Eight players, smaller budget, early-fat curve
**8 · 2 Platinum / 2 Gold / 4 Silver · $120M · points 2·3·5·8·13·20**

Skill edge **+51.2%** · Spread **16.1** · Late **53%** · Flip **8%**

**Pros**
- **Every pick counts for more.** Eight slots on a tighter budget means one bad choice is 12.5% of
  your squad rather than 10%, with less money to paper over it.
- **Fixes the first week too** (late 53%), same as Format 2.
- **Faster to draft.** Eight decisions instead of ten — directly relevant to the four managers who
  never finished a draft. This is the only option that reduces the size of the onboarding task.
- Squad-building trade-offs stay sharp because the budget was cut in proportion.

**Cons**
- **Changes two things at once** (squad size *and* scoring), so every manager relearns the game — the
  worst possible timing given they already say they don't understand it.
- **No measurable competitive gain over Format 2.** Skill edge +51.2% vs +50.8% is noise; spread is
  marginally lower. Its advantages are ergonomic, not mathematical.
- **The budget cut is mandatory and easy to get wrong.** At 8 players on the current $150M, everyone
  can afford the stars, squads converge, and spread **collapses to 15.6** — a *worse* game. The
  $120M is not optional.
- Fewer slots means fewer chances to hold an upset-scoring underdog, slightly reducing variety.

---

## Side-by-side

| | Today | Format 1 | Format 2 | Format 3 |
|---|---|---|---|---|
| Squad | 10 · $150M | 10 · $150M | 10 · $150M | **8 · $120M** |
| Points | 1·2·5·10·20·40 | 1·2·4·8·14·22 | **2·3·5·8·13·20** | **2·3·5·8·13·20** |
| Skill edge | +51.5% | +52.0% | +50.8% | +51.2% |
| Spread | **24.1** | 16.5 | 16.6 | 16.1 |
| Late % | 69% | 63% | **51%** | 53% |
| Flip % | 10% | 10% | 10% | 8% |
| First week worth | ~10% | ~12% | **~25%** | ~24% |
| Effort to ship | — | tiny | tiny | medium |
| Managers must relearn | — | no | scoring only | **squad + scoring** |

## Recommendation

**Format 2.** It is the only option that fixes the defect the data actually exposes — a first week
worth almost nothing — and it costs exactly as little to implement as the option that barely helps.
Format 1 pays nearly the same price in spread for a third of the benefit. Format 3 is a good game
whose advantages are ergonomic rather than competitive, and it asks managers to relearn everything at
the precise moment they are telling you the game is already too hard.

**If drop-off is your priority rather than season shape**, Format 3's shorter draft is the only
option that makes the first task smaller — but fix the explanation first (see the UX work), because
eight confusing decisions are not much better than ten.

## Two caveats, stated plainly

1. **Do not change format mid-tournament.** Cincinnati is at R32 with four active managers and scores
   on the board. Any of these starts at the next event.
2. **The simulation captains optimally for every manager.** Real managers do not, so real skill edges
   will be lower across the board than the figures here. The *ranking* of the options is unaffected —
   every option shares the assumption.

## What was deliberately not modelled

- **Transfers and cash-in.** Swept separately in `scripts/sim-balance.mjs`: the current 3-transfer cap
  produces a healthy draft-skill gap (~27 points), while unlimited transfers flatten it to ~11.
- **The upset multiplier**, held constant throughout. It is the dial that plausibly *does* move skill
  edge, and is the natural next study.
- **Human behaviour.** Managers here are archetypes. Real leagues have heavily correlated picks —
  everyone owns the same three favourites — which compresses spread in ways this cannot capture.
