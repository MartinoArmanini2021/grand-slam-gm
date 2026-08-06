import { describe, it, expect } from 'vitest';
import { sanitizeState } from '../store/gameStore';
import { PLAYERS } from '../data/players';

// Guards the live-squad self-heal in sanitizeState against the corruption seen in production:
// an entry truncated from 10 → 4 (dropping still-alive players) with cashedIn lost, while the
// transfer log stayed intact. The heal must rebuild the squad from the invariant
// (current = acquired − cashed) and re-record the transferred-out players as cashed.
describe('sanitizeState — live squad self-heal', () => {
  const P = PLAYERS.map(p => p.id);

  it('rebuilds a squad truncated below its acquired-minus-cashed size, and restores cashedIn', () => {
    const init = P.slice(0, 10);
    const boughtA = P[10], boughtB = P[11];
    const outA = init[0], outB = init[7];
    const s: Parameters<typeof sanitizeState>[0] = {
      phase: 'pre_round',
      initialSquad: [...init],
      myTeam: [boughtA, init[1], boughtB, init[9]], // corrupt: only 4, dropped valid alive ids
      transfers: [{ out: outA, in: boughtA, round: 'R64' }, { out: outB, in: boughtB, round: 'R64' }],
      cashedIn: undefined,
    } as never;
    sanitizeState(s);
    const expected = new Set([...init, boughtA, boughtB].filter(id => id !== outA && id !== outB));
    expect(s.myTeam).toHaveLength(10);
    expect(new Set(s.myTeam)).toEqual(expected);
    expect(s.myTeam).not.toContain(outA);
    expect(s.myTeam).not.toContain(outB);
    expect(new Set(s.cashedIn)).toEqual(new Set([outA, outB]));
  });

  it('leaves a consistent, untouched squad exactly as-is', () => {
    const init = P.slice(0, 10);
    const s: Parameters<typeof sanitizeState>[0] = {
      phase: 'pre_round', initialSquad: [...init], myTeam: [...init], transfers: [], cashedIn: [],
    } as never;
    sanitizeState(s);
    expect(new Set(s.myTeam)).toEqual(new Set(init));
    expect(s.myTeam).toHaveLength(10);
    expect(s.cashedIn).toEqual([]);
  });

  it('does not touch a draft-phase squad', () => {
    const s: Parameters<typeof sanitizeState>[0] = {
      phase: 'draft', initialSquad: [], myTeam: [P[0], P[1], P[2]], transfers: [], cashedIn: [],
    } as never;
    sanitizeState(s);
    expect(s.myTeam).toEqual([P[0], P[1], P[2]]);
  });
});
