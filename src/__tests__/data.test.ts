import { describe, it, expect } from 'vitest';
import { PLAYERS, getPlayer } from '../data/players';
import { getTier, TIER_ORDER } from '../data/tiers';

describe('players data integrity', () => {
  it('is the full real Wimbledon 2026 field (52 players: last-32 + notable entrants)', () => {
    expect(PLAYERS.length).toBe(52);
  });

  it('has unique ids and unique rankings', () => {
    expect(new Set(PLAYERS.map(p => p.id)).size).toBe(PLAYERS.length);
    expect(new Set(PLAYERS.map(p => p.ranking)).size).toBe(PLAYERS.length);
  });

  it('every player has valid stats and a real exit round', () => {
    const EXITS = ['W', 'F', 'SF', 'QF', 'R16', 'R32', 'R64', 'R128'];
    for (const p of PLAYERS) {
      expect(Array.isArray(p.form)).toBe(true);
      for (const s of [p.surface.hard, p.surface.clay, p.surface.grass]) {
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(100);
      }
      expect(p.yearResults.length).toBeGreaterThan(0);
      expect(p.price).toBeGreaterThan(0);
      expect(EXITS).toContain(p.exit);
    }
  });

  it('getPlayer returns the right player', () => {
    expect(getPlayer('sinner').ranking).toBe(1);   // champion
    expect(getPlayer('fery').ranking).toBe(178);   // wildcard semi-finalist
  });
});

describe('pricing curve', () => {
  it('the #1 is the $50M ceiling; deep-ranked entrants are single-digit value', () => {
    expect(getPlayer('sinner').price).toBe(50);
    expect(getPlayer('fery').price).toBe(6);
    expect(Math.max(...PLAYERS.map(p => p.price))).toBe(50);
  });

  it('price is non-increasing as ranking worsens', () => {
    const byRank = [...PLAYERS].sort((a, b) => a.ranking - b.ranking);
    for (let i = 1; i < byRank.length; i++) {
      expect(byRank[i].price).toBeLessThanOrEqual(byRank[i - 1].price);
    }
  });

  it('you cannot field 8 with the two most expensive (budget tension)', () => {
    const byPrice = [...PLAYERS].sort((a, b) => b.price - a.price);
    const topTwo = byPrice[0].price + byPrice[1].price;
    const cheapest6 = byPrice.slice(-6).reduce((s, p) => s + p.price, 0);
    expect(topTwo + cheapest6).toBeGreaterThan(100); // infeasible → real trade-off
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
