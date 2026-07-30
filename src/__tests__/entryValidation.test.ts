import { describe, it, expect } from 'vitest';
import saveEntrySql from '../../supabase/save_entry_rpc.sql?raw';
import { validateSquadLegality, validateCaptainLock, type RosterPricing } from '../data/entryValidation';
import { PLAYERS } from '../data/players';
import { getTier, type Tier } from '../data/tiers';

const ROSTER = new Map<string, RosterPricing>(PLAYERS.map(p => [p.id, { id: p.id, price: p.price, ranking: p.ranking }]));

// Build the CHEAPEST legal squad (2 Platinum, 3 Gold, 5 Silver, under budget) so the tests
// don't depend on specific ids — just on the rules.
function legalSquad(): string[] {
  const byTier = (t: Tier) => PLAYERS.filter(p => getTier(p.ranking) === t).sort((a, b) => a.price - b.price);
  return [...byTier('Platinum').slice(0, 2), ...byTier('Gold').slice(0, 3), ...byTier('Silver').slice(0, 5)].map(p => p.id);
}
function priciestSquad(): string[] {
  const byTier = (t: Tier) => PLAYERS.filter(p => getTier(p.ranking) === t).sort((a, b) => b.price - a.price);
  return [...byTier('Platinum').slice(0, 2), ...byTier('Gold').slice(0, 3), ...byTier('Silver').slice(0, 5)].map(p => p.id);
}
const draft = (squad: string[]) => ({ squad, phase: 'draft', hasTransfers: false });
const locked = (squad: string[]) => ({ squad, phase: 'pre_round', hasTransfers: false });

describe('validateSquadLegality — legal cases pass', () => {
  it('a complete legal squad passes both draft and locked', () => {
    expect(validateSquadLegality(draft(legalSquad()), ROSTER)).toBeNull();
    expect(validateSquadLegality(locked(legalSquad()), ROSTER)).toBeNull();
  });
  it('a PARTIAL squad is allowed while drafting (auto-save builds it up)', () => {
    expect(validateSquadLegality(draft(legalSquad().slice(0, 4)), ROSTER)).toBeNull();
    expect(validateSquadLegality(draft([]), ROSTER)).toBeNull();
  });
});

describe('validateSquadLegality — illegal squads rejected (F1 core)', () => {
  it('rejects the wrong SIZE when locked', () => {
    expect(validateSquadLegality(locked(legalSquad().slice(0, 9)), ROSTER)).toMatch(/exactly 10/i);
  });
  it('rejects MORE than 10 players (even in draft)', () => {
    const eleven = [...legalSquad(), PLAYERS.find(p => !legalSquad().includes(p.id))!.id];
    expect(validateSquadLegality(draft(eleven), ROSTER)).toMatch(/exceed 10/i);
  });
  it('rejects OVER BUDGET', () => {
    const reason = validateSquadLegality(draft(priciestSquad()), ROSTER);
    expect(reason).toMatch(/budget/i);
  });
  it('rejects a broken TIER quota when locked', () => {
    const plats = PLAYERS.filter(p => getTier(p.ranking) === 'Platinum').slice(0, 3).map(p => p.id);
    const rest = legalSquad().filter(id => getTier(ROSTER.get(id)!.ranking) !== 'Platinum').slice(0, 7);
    expect(validateSquadLegality(locked([...plats, ...rest]), ROSTER)).toMatch(/platinum|tier|exactly/i);
  });
  it('rejects too many of a tier even mid-draft', () => {
    const plats = PLAYERS.filter(p => getTier(p.ranking) === 'Platinum').slice(0, 3).map(p => p.id);
    expect(validateSquadLegality(draft(plats), ROSTER)).toMatch(/too many platinum/i);
  });
  it('rejects DUPLICATES', () => {
    const s = legalSquad(); s[1] = s[0];
    expect(validateSquadLegality(draft(s), ROSTER)).toMatch(/duplicate/i);
  });
  it('rejects a FAKE / unknown player id', () => {
    const s = legalSquad(); s[0] = 'totally_not_a_player';
    expect(validateSquadLegality(draft(s), ROSTER)).toMatch(/unknown player/i);
  });
});

describe('validateCaptainLock — no retroactive picks (F1(2))', () => {
  const resulted = new Set(['R64', 'R32']);
  it('passes when a resulted round\'s pick is unchanged', () => {
    const stored = [{ round: 'R64', playerId: 'zverev' }];
    const incoming = [{ round: 'R64', playerId: 'zverev' }, { round: 'R16', playerId: 'fritz' }];
    expect(validateCaptainLock(incoming, stored, resulted, 'captain')).toBeNull();
  });
  it('REJECTS changing the captain of a round that already has results', () => {
    const stored = [{ round: 'R64', playerId: 'zverev' }];
    const incoming = [{ round: 'R64', playerId: 'shelton' }]; // changed after the fact
    expect(validateCaptainLock(incoming, stored, resulted, 'captain')).toMatch(/R64 captain.*already been played/i);
  });
  it('REJECTS retroactively ADDING a captain for a resulted round', () => {
    const incoming = [{ round: 'R32', playerId: 'medvedev' }]; // none was stored
    expect(validateCaptainLock(incoming, [], resulted, 'captain')).toMatch(/R32 captain.*already been played/i);
  });
});

// PARITY: the seeded player_stats price/tier in save_entry_rpc.sql MUST equal what the client
// shows (PLAYERS[i].price / getTier). If this drifts, a legal client squad could be server-
// rejected (or vice versa). Re-seed by regenerating the INSERT block from PLAYERS.
describe('save_entry_rpc.sql seed ↔ PLAYERS parity', () => {
  const sql = saveEntrySql;
  const seeded = new Map<string, { ranking: number; price: number; tier: string }>();
  for (const m of sql.matchAll(/\('([a-z0-9_]+)',\s*(\d+),\s*(\d+),\s*'(\w+)'\)/g)) {
    seeded.set(m[1], { ranking: Number(m[2]), price: Number(m[3]), tier: m[4] });
  }

  it('seeds every one of the 74 roster players, and only those', () => {
    expect(seeded.size).toBe(PLAYERS.length);
    for (const p of PLAYERS) expect(seeded.has(p.id)).toBe(true);
  });
  it('every seeded price/tier/ranking matches the client', () => {
    for (const p of PLAYERS) {
      const s = seeded.get(p.id)!;
      expect(s.price).toBe(p.price);
      expect(s.ranking).toBe(p.ranking);
      expect(s.tier).toBe(getTier(p.ranking));
    }
  });
});
