import { findPlayer } from './players';
import { getTier, type Tier } from './tiers';

// Squad composition rule. A 10-player squad is exactly 2 Platinum, 3 Gold and
// 5 Silver. Because the minimums (2+3+5) add up to the squad size, they are in
// effect an EXACT quota — you can't stack marquee names, nor fill the draw with
// cheap wildcards. Budget is roomy ($200M) so most builds are affordable; the
// squeeze is choosing WHICH two Platinum / three Gold you can pair with strong
// Silver value.
export const SQUAD_SIZE = 10;
export const STARTING_BUDGET = 200; // $M each manager gets to draft their squad
export const TIER_MINIMUMS: { tier: Tier; min: number }[] = [
  { tier: 'Platinum', min: 2 },
  { tier: 'Gold', min: 3 },
  { tier: 'Silver', min: 5 },
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
