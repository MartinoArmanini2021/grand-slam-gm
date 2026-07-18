import { describe, it, expect } from 'vitest';
import { BACKTEST_SLAMS } from '../data/backtestData';
import { scoreSlam, analyzeSlam, budgetReturn, priceForSeed, PRICE_BY_SEED } from '../data/backtestEngine';
import { PRICE_BY_RANK } from '../data/players';

const slam = (name: string, year: number) => BACKTEST_SLAMS.find(s => s.slam === name && s.year === year)!;

describe('backtest data integrity', () => {
  it('has 4 slams', () => {
    expect(BACKTEST_SLAMS).toHaveLength(4);
  });

  it('each slam has 32 seeds numbered 1..32 and a full late bracket', () => {
    for (const s of BACKTEST_SLAMS) {
      expect(s.seeds).toHaveLength(32);
      expect(s.seeds.map(x => x.seed).sort((a, b) => a - b)).toEqual(Array.from({ length: 32 }, (_, i) => i + 1));
      expect(s.bracket.QF).toHaveLength(4);
      expect(s.bracket.SF).toHaveLength(2);
      expect(s.bracket.F.winner).toBeTruthy();
    }
  });

  it('bracket winners are always one of the two players', () => {
    for (const s of BACKTEST_SLAMS) {
      for (const m of [...s.bracket.QF, ...s.bracket.SF, s.bracket.F]) {
        expect([m.p1, m.p2]).toContain(m.winner);
      }
    }
  });

  it('backtest prices mirror the live game price curve', () => {
    for (let seed = 1; seed <= 32; seed++) {
      expect(PRICE_BY_SEED[seed]).toBe(PRICE_BY_RANK[seed]);
    }
  });
});

describe('backtest scoring — known results', () => {
  it('a champion scores the full 77 base points', () => {
    const rg = slam('Roland Garros', 2026);
    const zverev = scoreSlam(rg).find(p => p.name === 'Alexander Zverev')!;
    expect(zverev.base).toBe(77); // 2+5+10+20+40
    expect(zverev.exit).toBe('W');
  });

  it('Cobolli 2026 RG final run = 37 base + 2 upset = 39 (beat #4 AAA in QF)', () => {
    const rg = slam('Roland Garros', 2026);
    const cobolli = scoreSlam(rg).find(p => p.name === 'Flavio Cobolli')!;
    expect(cobolli.base).toBe(37); // reached F → won R32,R16,QF,SF
    expect(cobolli.upset).toBe(2); // QF: seed 10 beat seed 4 → round((10-4)*0.4)=2
    expect(cobolli.total).toBe(39);
  });

  it('a player out before the last 32 scores nothing', () => {
    const rg = slam('Roland Garros', 2026);
    const sinner = scoreSlam(rg).find(p => p.name === 'Jannik Sinner')!; // out R64
    expect(sinner.total).toBe(0);
  });
});

describe('backtest budget returns', () => {
  it('matches the live game rates, keyed by exit round', () => {
    expect(budgetReturn(20, 'W')).toBe(0);          // champion — kept to the end
    expect(budgetReturn(20, 'F')).toBe(0);          // final over — nothing to spend it on
    expect(budgetReturn(20, 'SF')).toBe(0);         // transfer window already shut
    expect(budgetReturn(20, 'QF')).toBe(20 * 0.35);
    expect(budgetReturn(20, 'R16')).toBe(20 * 0.25);
    expect(budgetReturn(20, 'R32')).toBe(20 * 0.15);
    expect(budgetReturn(20, 'R64')).toBe(0);        // fell before the scored stage
    expect(budgetReturn(20, 'R128')).toBe(0);
  });
});

describe('backtest strategy analysis', () => {
  it('every archetype squad is legal (6 players, <= $100M)', () => {
    for (const s of BACKTEST_SLAMS) {
      const { squads } = analyzeSlam(s);
      for (const sq of squads) {
        expect(sq.players).toHaveLength(6);
        expect(sq.spent).toBeLessThanOrEqual(100);
      }
    }
  });

  it('the Optimal XI is at least as good as every other archetype', () => {
    for (const s of BACKTEST_SLAMS) {
      const { squads } = analyzeSlam(s);
      const optimal = squads.find(x => x.label === 'Optimal XI')!.score;
      for (const sq of squads) expect(optimal).toBeGreaterThanOrEqual(sq.score);
    }
  });

  it('priceForSeed falls back to $4M for unseeded', () => {
    expect(priceForSeed(1)).toBe(48);
    expect(priceForSeed(99)).toBe(4);
  });
});
