import { PLAYERS, findPlayer } from './players';
import { getTier, type Tier } from './tiers';
import { squadShortfall, SQUAD_SIZE } from './squadRules';
import { isUnpickable } from './tournament';

// ── "Can I still finish, and what will it cost?" ─────────────────────────────────────────────────
//
// THE PROBLEM THIS SOLVES, from production. Of eight Cincinnati managers, four scored zero. One of
// them (32828145) had 7 players, $7M left, and needed 1 Platinum + 2 Silver — a combination whose
// CHEAPEST possible price was $26M. They could not finish. Nothing on any screen said so: the
// Market simply showed every Platinum greyed out as "over your remaining budget", which reads as
// "come back later", not "you are stuck and must sell someone". Another (51face7f) was $4M from the
// same trap and could not have known.
//
// The rules ENFORCE the constraint but never PROJECT it. That is the whole failure: a budget is
// only a puzzle if you can see whether the puzzle is still solvable.
//
// The maths is trivial — the cheapest legal finish is just the N cheapest still-available players
// in each tier you are short of. The app had every input and never did the sum.

export interface SquadPlan {
  /** Tiers still to fill, e.g. [{ tier: 'Platinum', missing: 1 }, { tier: 'Silver', missing: 2 }] */
  needed: { tier: Tier; missing: number }[];
  /** Total players still to pick. */
  slotsLeft: number;
  /** The least it could possibly cost to complete a legal squad from here. */
  cheapestFinish: number;
  /** Money left. */
  budget: number;
  /** budget − cheapestFinish. Negative means the squad cannot be completed. */
  headroom: number;
  /** True when the squad is already complete and legal. */
  complete: boolean;
  /** True when no legal completion exists at this budget — the dead end. */
  stuck: boolean;
  /** True when it is still possible but only just (< 10% of the remaining spend to play with). */
  tight: boolean;
}

/**
 * Cheapest way to fill `missing` slots in `tier`, from players not already owned and still
 * pickable. Returns Infinity when the field cannot supply that many — a genuinely impossible
 * shortfall, which must not silently read as "free".
 */
function cheapestFor(tier: Tier, missing: number, owned: string[]): number {
  if (missing <= 0) return 0;
  const pool = PLAYERS
    .filter(p => getTier(p.ranking) === tier && !owned.includes(p.id) && !isUnpickable(p.id))
    .map(p => p.price)
    .sort((a, b) => a - b);
  if (pool.length < missing) return Infinity;
  return pool.slice(0, missing).reduce((t, p) => t + p, 0);
}

export function planSquad(squad: string[], budget: number): SquadPlan {
  const needed = squadShortfall(squad);
  const slotsLeft = Math.max(0, SQUAD_SIZE - squad.length);
  const complete = needed.length === 0 && squad.length === SQUAD_SIZE;

  const cheapestFinish = needed.reduce((t, n) => t + cheapestFor(n.tier, n.missing, squad), 0);
  const headroom = budget - cheapestFinish;

  return {
    needed, slotsLeft, cheapestFinish, budget, headroom, complete,
    stuck: !complete && headroom < 0,
    // "Tight" is judged against what is still to be SPENT, not the original $150M: having $4M spare
    // is comfortable with one Silver to buy and precarious with eight players to find.
    tight: !complete && headroom >= 0 && cheapestFinish > 0 && headroom < cheapestFinish * 0.1,
  };
}

/**
 * When stuck, the smallest set of players to drop that makes the squad completable again — the
 * concrete way out, rather than "you are stuck, good luck".
 *
 * Removing a player frees their price AND re-opens a slot in their tier, so the shortfall changes
 * too. Naively suggesting "sell your most expensive" is wrong: dropping a Platinum you are required
 * to own just re-creates the shortfall at a higher price. So each candidate is re-planned rather
 * than assumed.
 *
 * Tries one sale, then pairs. A 10-player squad is 10 singles and 45 pairs — trivial to search, and
 * bounded, so this cannot become a performance problem. `shortfall` is always populated when stuck,
 * so the UI has something honest to say even in the rare case where no pair is enough.
 */
export function wayOut(
  squad: string[], budget: number,
): { sell: string[]; then: SquadPlan; shortfall: number } | null {
  const plan = planSquad(squad, budget);
  if (!plan.stuck) return null;
  const shortfall = Math.round((-plan.headroom) * 10) / 10;

  const priceOf = (id: string) => findPlayer(id)?.price ?? 0;
  const tryDrop = (drop: string[]) => {
    const without = squad.filter(x => !drop.includes(x));
    const after = planSquad(without, budget + drop.reduce((t, id) => t + priceOf(id), 0));
    return after.stuck ? null : after;
  };

  // Cheapest single sale that unblocks — least disruptive to a squad they have already chosen.
  const singles = squad
    .map(id => ({ sell: [id], then: tryDrop([id]), price: priceOf(id) }))
    .filter(o => o.then !== null)
    .sort((a, b) => a.price - b.price);
  if (singles.length) return { sell: singles[0].sell, then: singles[0].then!, shortfall };

  const pairs: { sell: string[]; then: SquadPlan; price: number }[] = [];
  for (let i = 0; i < squad.length; i++) {
    for (let j = i + 1; j < squad.length; j++) {
      const after = tryDrop([squad[i], squad[j]]);
      if (after) pairs.push({ sell: [squad[i], squad[j]], then: after, price: priceOf(squad[i]) + priceOf(squad[j]) });
    }
  }
  if (pairs.length) {
    pairs.sort((a, b) => a.price - b.price);
    return { sell: pairs[0].sell, then: pairs[0].then, shortfall };
  }
  // No one- or two-player sale fixes it. Still return the shortfall — "free up at least $X" beats
  // silence, and silence is exactly what the current app does.
  return { sell: [], then: plan, shortfall };
}
