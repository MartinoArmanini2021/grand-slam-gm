import { describe, it, expect } from 'vitest';
import { PLAYERS, getPlayer, priceFor } from '../data/players';
import { getTier, TIER_ORDER, type Tier } from '../data/tiers';
import { isSquadValid, tierCounts, SQUAD_SIZE, STARTING_BUDGET } from '../data/squadRules';

// Field-agnostic helpers: build a legal squad from whatever the live field is (so these
// tests don't hard-code player ids and survive a field/tournament change).
const byTier = (t: Tier) => PLAYERS.filter(p => getTier(p.ranking) === t).sort((a, b) => a.ranking - b.ranking);
const cheapestValidSquad = () =>
  [...byTier('Platinum').slice(0, 2), ...byTier('Gold').slice(0, 3), ...byTier('Silver').slice(0, 5)].map(p => p.id);

describe('squad composition rule (2 Platinum, 3 Gold, 5 Silver of 10)', () => {
  const valid = cheapestValidSquad();
  it('accepts a squad meeting every minimum', () => {
    expect(valid).toHaveLength(SQUAD_SIZE);
    const c = tierCounts(valid);
    expect(c.Platinum).toBe(2);
    expect(c.Gold).toBe(3);
    expect(c.Silver).toBe(5);
    expect(isSquadValid(valid)).toBe(true);
  });
  it('rejects too few Gold', () => {
    // swap a Gold for a 6th Silver → only 2 Gold left (need 3)
    const twoGold = [...byTier('Platinum').slice(0, 2), ...byTier('Gold').slice(0, 2), ...byTier('Silver').slice(0, 6)].map(p => p.id);
    expect(tierCounts(twoGold).Gold).toBe(2);
    expect(isSquadValid(twoGold)).toBe(false);
  });
  it('rejects an under-size squad even if tiers are met', () => {
    expect(isSquadValid(valid.slice(0, 9))).toBe(false);
  });
});

describe('players data integrity', () => {
  it('is the live tournament field (enough players for a full draw)', () => {
    expect(PLAYERS.length).toBeGreaterThanOrEqual(64); // the sample draw seeds 64
    expect(PLAYERS.length).toBeLessThanOrEqual(128);
  });

  it('has unique ids and unique rankings', () => {
    expect(new Set(PLAYERS.map(p => p.id)).size).toBe(PLAYERS.length);
    expect(new Set(PLAYERS.map(p => p.ranking)).size).toBe(PLAYERS.length);
  });

  it('every player has valid stats', () => {
    for (const p of PLAYERS) {
      expect(Array.isArray(p.form)).toBe(true);
      for (const s of [p.surface.hard, p.surface.clay, p.surface.grass]) {
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(100);
      }
      expect(p.price).toBeGreaterThan(0);
    }
  });

  it('getPlayer resolves a known field player, throws on an unknown id', () => {
    const best = [...PLAYERS].sort((a, b) => a.ranking - b.ranking)[0];
    expect(getPlayer(best.id).ranking).toBe(best.ranking);
    expect(() => getPlayer('no-such-player-xyz')).toThrow();
  });
});

describe('pricing curve', () => {
  it('the best-ranked entrant is the most expensive; prices stay in the $4–50M band', () => {
    const best = [...PLAYERS].sort((a, b) => a.ranking - b.ranking)[0];
    const max = Math.max(...PLAYERS.map(p => p.price));
    expect(getPlayer(best.id).price).toBe(max);
    expect(max).toBeLessThanOrEqual(50);
    expect(Math.min(...PLAYERS.map(p => p.price))).toBeGreaterThanOrEqual(4);
  });

  it('the rank base curve is monotonic; detailed prices stay in the $4–50M band', () => {
    // Detailed price = rank base × form × surface, so final prices are NOT strictly
    // monotonic in rank. The rank BASE curve is monotonic; final prices stay in range.
    for (let r = 1; r < 300; r++) expect(priceFor(r + 1)).toBeLessThanOrEqual(priceFor(r));
    for (const p of PLAYERS) {
      expect(p.price).toBeGreaterThanOrEqual(4);
      expect(p.price).toBeLessThanOrEqual(50);
    }
  });

  it('the most expensive legal 2/3/5 squad is unaffordable (budget tension)', () => {
    const priciest = (t: Tier) => PLAYERS.filter(p => getTier(p.ranking) === t).sort((a, b) => b.price - a.price);
    const squad = [...priciest('Platinum').slice(0, 2), ...priciest('Gold').slice(0, 3), ...priciest('Silver').slice(0, 5)];
    const cost = squad.reduce((s, p) => s + p.price, 0);
    expect(cost).toBeGreaterThan(STARTING_BUDGET); // all-elite build infeasible → real trade-off
  });
});

describe('tiers by ranking', () => {
  it('boundaries are correct', () => {
    expect(getTier(1)).toBe('Platinum');
    expect(getTier(10)).toBe('Platinum');
    expect(getTier(11)).toBe('Gold');
    expect(getTier(25)).toBe('Gold');
    expect(getTier(26)).toBe('Silver');
    expect(getTier(32)).toBe('Silver');
  });

  it('order constant is Platinum, Gold, Silver', () => {
    expect(TIER_ORDER).toEqual(['Platinum', 'Gold', 'Silver']);
  });

  it('every player maps to a tier', () => {
    for (const p of PLAYERS) {
      expect(['Platinum', 'Gold', 'Silver']).toContain(getTier(p.ranking));
    }
  });
});
