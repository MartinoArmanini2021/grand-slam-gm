import { describe, it, expect } from 'vitest';
import { useLiveStore } from '../store/liveStore';
import { matchKey } from '../data/liveResults';
import { cashInOpen, isEliminated } from '../data/tournament';
import { loadSampleThrough, sampleDraw, sampleResults, roles } from './fixtures/sampleDraw';

// The user's rule: money is shown across all rounds, but the cash-in ACTION happens at the end of
// the CURRENT round. One gate for the whole squad — while any round is underway cash-in is shut
// (even for players who fell in an earlier, already-complete round); it reopens at the round break.
describe('cashInOpen — cash in only at a round break', () => {
  it('between rounds (current round complete, next drawn but unplayed) → OPEN', () => {
    loadSampleThrough('R32'); // R32 complete, R16 drawn, 0 played → at a break
    expect(cashInOpen()).toBe(true);
  });

  it('while a round is underway → SHUT for everyone, even earlier-round exits', () => {
    loadSampleThrough('R32');
    const oneR16 = sampleDraw.find(m => m.round === 'R16')!; // reveal a single R16 result → R16 underway
    const k = matchKey(oneR16.round, oneR16.slot);
    useLiveStore.setState(s => ({ ...s, results: { ...s.results, [k]: sampleResults[k] } }));

    expect(cashInOpen()).toBe(false);
    // The R32 exit is still eliminated (money shown), but cannot be cashed mid-R16.
    expect(isEliminated(roles.r32Exit)).toBe(true);
  });

  it('reopens once that round is fully played out', () => {
    loadSampleThrough('R16'); // R16 complete, QF drawn → next break
    expect(cashInOpen()).toBe(true);
  });
});
