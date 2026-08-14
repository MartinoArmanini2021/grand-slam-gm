import { findPlayer } from './players';
import { getTier, type Tier } from './tiers';

// Squad composition rule. A 10-player squad is exactly 2 Platinum, 3 Gold and
// 5 Silver. Because the minimums (2+3+5) add up to the squad size, they are in
// effect an EXACT quota — you can't stack marquee names, nor fill the draw with
// cheap wildcards. Budget is $150M so most builds are affordable; the
// squeeze is choosing WHICH two Platinum / three Gold you can pair with strong
// Silver value.
export const SQUAD_SIZE = 10;
export const STARTING_BUDGET = 150; // $M each manager gets to draft their squad

// How many mid-tournament re-signings a manager may make (one per cashed-in slot they refill).
// WHY A CAP: with unlimited transfers the optimal play is to recycle every loss into the best
// surviving player, every round — so every squad converges on the same survivors and the draft
// stops mattering. Simulation (scripts/sim-balance.mjs, 20k tournaments on the real field) put
// the gap between the best and worst drafter at 45.3 pts with no recovery, 11.5 pts with
// unlimited recovery (75% of the drafting advantage erased), and 43.4 pts at a cap of 3 — which
// keeps recovery as a genuine safety valve (median 49 → 94, last place 10 → 27) without letting
// it flatten the league. Three is the sweet spot; re-run the simulator before changing it.
export const MAX_TRANSFERS = 3;
export const TIER_MINIMUMS: { tier: Tier; min: number }[] = [
  { tier: 'Platinum', min: 2 },
  { tier: 'Gold', min: 3 },
  { tier: 'Silver', min: 5 },
];

// Because the composition is an EXACT quota, each tier's maximum equals its minimum.
// The Market uses this to lock a tier once it's full (e.g. no 3rd Platinum).
export const TIER_LIMITS = Object.fromEntries(TIER_MINIMUMS.map(({ tier, min }) => [tier, min])) as Record<Tier, number>;

export function isTierFull(tier: Tier, ids: string[]): boolean {
  return tierCounts(ids)[tier] >= (TIER_LIMITS[tier] ?? Infinity);
}

export function tierCounts(ids: string[]): Record<Tier, number> {
  const c: Record<Tier, number> = { Platinum: 0, Gold: 0, Silver: 0 };
  for (const id of ids) {
    const p = findPlayer(id);
    if (p) c[getTier(p.ranking)]++;
  }
  return c;
}

// What's still missing to satisfy the rule (empty when the composition is met).
export function squadShortfall(ids: string[]): { tier: Tier; missing: number }[] {
  const c = tierCounts(ids);
  return TIER_MINIMUMS
    .map(({ tier, min }) => ({ tier, missing: Math.max(0, min - c[tier]) }))
    .filter(x => x.missing > 0);
}

// A valid, lockable squad: exactly SQUAD_SIZE distinct players meeting every minimum.
export function isSquadValid(ids: string[]): boolean {
  return ids.length === SQUAD_SIZE && new Set(ids).size === SQUAD_SIZE && squadShortfall(ids).length === 0;
}
