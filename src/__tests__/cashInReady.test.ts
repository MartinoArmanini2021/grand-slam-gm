import { describe, it, expect } from 'vitest';
import { useLiveStore } from '../store/liveStore';
import { matchKey } from '../data/liveResults';
import { cashInReady, isEliminated } from '../data/tournament';
import { loadSampleThrough, sampleDraw, sampleResults, roles } from './fixtures/sampleDraw';

// The user's rule: "do not give a chance to cash in until the last match of the round is over."
// A player knocked out MID-round is eliminated, but must NOT be cashable until that round is fully
// played out. An earlier round that's already complete stays cashable. cashInReady encodes both.
describe('cashInReady — cash-in waits for the round to finish', () => {
  it('a player out mid-round is eliminated but NOT yet cashable; an earlier complete round IS', () => {
    loadSampleThrough('R64'); // R64 complete (all 32 decided), R32 drawn but 0 played
    // Reveal ONLY the single R32 match that the r32Exit player loses — the round is now underway.
    const lost = sampleDraw.find(m => m.round === 'R32' && (m.p1Id === roles.r32Exit || m.p2Id === roles.r32Exit))!;
    const k = matchKey(lost.round, lost.slot);
    useLiveStore.setState(s => ({ ...s, results: { ...s.results, [k]: sampleResults[k] } }));

    expect(isEliminated(roles.r32Exit)).toBe(true);   // they ARE knocked out…
    expect(cashInReady(roles.r32Exit)).toBe(false);   // …but R32 isn't finished, so no cash-in yet
    expect(cashInReady(roles.r64Exit)).toBe(true);    // R64 is complete → that exit is cashable
  });

  it('once the round is fully played out, the mid-round exit becomes cashable', () => {
    loadSampleThrough('R32'); // R32 complete, R16 drawn
    expect(cashInReady(roles.r32Exit)).toBe(true);
  });

  it('a still-alive player (the champion) is never cashable', () => {
    loadSampleThrough('R32');
    expect(cashInReady(roles.champion)).toBe(false);
  });
});
