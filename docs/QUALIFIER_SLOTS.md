# Qualifier slots — Job 24, decided 2026-08-26

**Martino's call:** a Slam draw publishes with roughly sixteen places marked "Qualifier", filled a day
or two later once qualifying finishes. Those slots are **draftable**, priced at the field minimum,
before anyone knows who will occupy them. A manager can spend $4M on the unknown and see what turns up.

That is a deliberate piece of game design, not a workaround: it turns a dead part of the draw into a
cheap, high-variance option, and it costs a squad slot to take.

## The mechanic that makes it work

**The id is the slot; the name is whoever fills it.**

A manager drafts `qualifier_3`. When qualifying ends we rename that row to the real player — the id
never changes. So the manager's squad is untouched, no transfer is spent, and scoring works because
the draw resolves that player's name to `qualifier_3`.

This matters because the draw parser resolves players **by name**. Sixteen rows all called
"Qualifier" would collapse onto one id and corrupt the draw. Distinct ids from the start avoid that
entirely.

## Assignment rule — objective, so it cannot look rigged

Placeholders are numbered **in draw order**: `qualifier_1` is the Qualifier appearing in the earliest
draw slot, `qualifier_2` the next, and so on. When the names are published, slot N's real occupant
becomes `qualifier_N`.

The assignment is arbitrary from the manager's point of view — that is the gamble they accepted — but
it must be *deterministic and checkable*, decided before a ball is struck and never revisited.

## Field values

| field    | value                                                  |
|----------|--------------------------------------------------------|
| id       | `qualifier_1` … `qualifier_N`                          |
| name     | "Qualifier 1" … until qualifying ends, then the real player |
| price    | **$4M** — the model's floor (`Math.max(4, …)` in pricing.mjs) |
| tier     | Silver                                                  |
| ranking  | nominal 250 until known, then the player's real ranking |

**Price stays $4M for the whole tournament, even after the real name lands.** It is what the manager
paid, and refunds are a fraction of price — letting it rise would pay out more than was spent.

**Ranking DOES update to the real value**, because ranking drives the upset multiplier. Doing it
before the first ball is safe: no result exists yet, so no score can move. (Never after — see
[[lesson-stale-rankings]] for what re-seeding ranks mid-event did once before.)

## The one deadline

The real names must be in the field **before the first ball on Monday**.

If they are not, those draw slots resolve to nobody, and the manager's qualifier appears in no match
row at all. The engine then treats them as an opening-round casualty: **full refund and a free
replacement**. That is a safe failure — nobody loses money — but it silently cancels the bet the
manager actually wanted to make, so it is a deadline, not a fallback.

## Sequence during Job 8

1. Draw publishes → count the slots marked "Qualifier" and create exactly that many placeholders.
2. Build the field with real entrants plus placeholders; load it to the shelf; seed `player_stats`.
3. Managers draft, qualifiers included.
4. Qualifying finishes (~Fri/Sat) → read the real names off the draw page, in draw order.
5. Update each `qualifier_N` row: name and ranking. **Not price.**
6. Re-run `ingest-draw` so the match rows carry `qualifier_N` rather than an unresolved id.
7. Re-run `reconcile-field.mjs` — it must report zero missing and zero phantom.

## How the app decides a slot is still open — Job 31, shipped 2026-08-26

**Detect by NAME, never by id.** `isOpenSlot()` in `src/lib/game/players.ts` (Lovable) tests
`/^qualifier(\s+\d+)?$/i` against the player's *name*.

The instinct is to check `id.startsWith('qualifier_')`. That is wrong and would be a silent,
permanent bug: the id never changes, so every filled slot would keep rendering as unknown for the
whole tournament — no ranking, no stats, no highlights, a dashed "?" crest on a real player who is
winning matches. The rename IS the signal that qualifying is done, so the name is the only honest
thing to key off.

What that one predicate drives:

| screen | open slot | once renamed |
|--------|-----------|--------------|
| `surname()` | returns the whole label — otherwise "Qualifier 3" shortens to **"3"** in the market, on the court and in the bracket | normal surname |
| avatar | dashed tier ring, "?", no headshot fetched | photo chain as usual |
| market row | "Name announced after qualifying", rank column "—", no YouTube button | full season line |
| player page | "Qualifying slot", bio explains the bet, price-breakdown / surface / season blocks hidden (all computed from zeros — they would invent a ×0.60 multiplier and three empty 0% bars) | every block renders |
| How to Play | extra rule, gated on `field.some(isOpenSlot)` | rule disappears by itself |

Display only — no scoring, pricing, save or server logic touched.
