import { findPlayer } from './players';
import { getTier, type Tier } from './tiers';

// Squad composition rule. An 8-player squad must include at least 4 Silver and at
// least 2 Gold — the remaining 2 slots are free (any tier, e.g. a Platinum star).
// This forces a balanced build: you can't stack the draw with cheap wildcards, nor
// blow the budget on marquee names only.
export const SQUAD_SIZE = 8;
export const STARTING_BUDGET = 100; // $M each manager gets to draft their squad
export const TIER_MINIMUMS: { tier: Tier; min: number }[] = [
  { tier: 'Silver', min: 4 },
  { tier: 'Gold', min: 2 },
];

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
