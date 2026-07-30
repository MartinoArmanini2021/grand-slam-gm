// Shared squad-legality fixtures, run through BOTH entryValidation.ts (unit) AND the live
// save_entry RPC (integration, rpcDrift) so a change to EITHER side that makes them disagree
// is caught — not just seed drift. Squads are built from real ids so the cases are concrete.
import { PLAYERS } from '../../data/players';
import { getTier, type Tier } from '../../data/tiers';

const tierByPrice = (t: Tier, cheapestFirst = true) =>
  PLAYERS.filter(p => getTier(p.ranking) === t).sort((a, b) => (cheapestFirst ? a.price - b.price : b.price - a.price));

export const legalSquad = (): string[] =>
  [...tierByPrice('Platinum').slice(0, 2), ...tierByPrice('Gold').slice(0, 3), ...tierByPrice('Silver').slice(0, 5)].map(p => p.id);

const priciestSquad = (): string[] =>
  [...tierByPrice('Platinum', false).slice(0, 2), ...tierByPrice('Gold', false).slice(0, 3), ...tierByPrice('Silver', false).slice(0, 5)].map(p => p.id);

const threePlatinum = (): string[] => tierByPrice('Platinum').slice(0, 3).map(p => p.id);

export interface LegalityFixture {
  name: string;
  state: { phase: string; myTeam: string[]; transfers: unknown[] };
  expect: 'accept' | 'reject';
}

// One place, both sides. Each case's verdict must be identical from the TS validator and the
// SQL RPC. (Captain/vice-lock cases need resulted `matches` rows, so they're unit-tested
// separately; these squad-legality cases need no live results and run against the real RPC.)
export function buildLegalityFixtures(): LegalityFixture[] {
  const legal = legalSquad();
  const dup = [...legal]; dup[1] = dup[0];
  const fake = [...legal]; fake[0] = 'totally_not_a_player';
  const eleven = [...legal, PLAYERS.find(p => !legal.includes(p.id))!.id];
  return [
    { name: 'legal locked squad',           state: { phase: 'pre_round', myTeam: legal,           transfers: [] }, expect: 'accept' },
    { name: 'partial squad during draft',   state: { phase: 'draft',     myTeam: legal.slice(0, 4), transfers: [] }, expect: 'accept' },
    { name: 'over budget',                  state: { phase: 'draft',     myTeam: priciestSquad(), transfers: [] }, expect: 'reject' },
    { name: 'duplicate player',             state: { phase: 'draft',     myTeam: dup,             transfers: [] }, expect: 'reject' },
    { name: 'unknown / fake player id',     state: { phase: 'draft',     myTeam: fake,            transfers: [] }, expect: 'reject' },
    { name: 'too many Platinum (draft)',    state: { phase: 'draft',     myTeam: threePlatinum(), transfers: [] }, expect: 'reject' },
    { name: 'locked but only 9 players',    state: { phase: 'pre_round', myTeam: legal.slice(0, 9), transfers: [] }, expect: 'reject' },
    { name: 'more than 10 players',         state: { phase: 'draft',     myTeam: eleven,          transfers: [] }, expect: 'reject' },
  ];
}
