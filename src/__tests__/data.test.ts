import { describe, it, expect } from 'vitest';
import { PLAYERS, getPlayer } from '../data/players';
import { getTier, TIER_ORDER } from '../data/tiers';

describe('players data integrity', () => {
  it('has exactly 32 players', () => {
    expect(PLAYERS).toHaveLength(32);
  });

  it('has unique ids', () => {
    const ids = new Set(PLAYERS.map(p => p.id));
    expect(ids.size).toBe(32);
  });

  it('has unique rankings 1..32', () => {
    const ranks = PLAYERS.map(p => p.ranking).sort((a, b) => a - b);
    expect(ranks).toEqual(Array.from({ length: 32 }, (_, i) => i + 1));
  });

  it('every player has valid stats', () => {
    for (const p of PLAYERS) {
      expect(p.form).toHaveLength(5);
      expect(p.form.every(f => f === 'W' || f === 'L')).toBe(true);
      for (const s of [p.surface.hard, p.surface.clay, p.surface.grass]) {
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(100);
      }
      expect(p.yearResults.length).toBeGreaterThan(0);
      expect(p.price).toBeGreaterThan(0);
    }
  });

  it('getPlayer returns the right player', () => {
    expect(getPlayer('alcaraz').ranking).toBe(1);
    expect(getPlayer('thompson').ranking).toBe(32);
  });
});

describe('pricing curve', () => {
  it('#1 is $48M and #32 is $4M', () => {
    expect(getPlayer('alcaraz').price).toBe(48);
    expect(getPlayer('thompson').price).toBe(4);
  });

  it('price is non-increasing as ranking worsens', () => {
    const byRank = [...PLAYERS].sort((a, b) => a.ranking - b.ranking);
    for (let i = 1; i < byRank.length; i++) {
      expect(byRank[i].price).toBeLessThanOrEqual(byRank[i - 1].price);
    }
  });

  it('you cannot field 6 with the two most expensive (budget tension)', () => {
    const byPrice = [...PLAYERS].sort((a, b) => b.price - a.price);
    const topTwo = byPrice[0].price + byPrice[1].price;
    const cheapest4 = byPrice.slice(-4).reduce((s, p) => s + p.price, 0);
    expect(topTwo + cheapest4).toBeGreaterThan(100); // infeasible → real trade-off
  });
});

describe('tiers by ranking', () => {
  it('boundaries are correct', () => {
    expect(getTier(1)).toBe('Platinum');
    expect(getTier(6)).toBe('Platinum');
    expect(getTier(7)).toBe('Gold');
    expect(getTier(16)).toBe('Gold');
    expect(getTier(17)).toBe('Silver');
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
