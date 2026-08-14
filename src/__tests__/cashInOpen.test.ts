import { describe, it, expect, vi, afterAll } from 'vitest';
import { useLiveStore } from '../store/liveStore';
import { matchKey } from '../data/liveResults';
import { cashInOpen, isEliminated, roundStarted, transferWindowOpen, liveLeaderRound, liveRoundStatus } from '../data/tournament';
import { loadSampleThrough, sampleDraw, sampleResults, roles } from './fixtures/sampleDraw';
import { TOURNAMENT } from '../data/tournamentConfig';

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

// THE BUG this fixes: the feed only records a match once it FINISHES, so a round can be live (matches
// on court) with ZERO recorded results. Relying on results alone left the market open + captains
// editable during live play. roundStarted() closes it at the round's SCHEDULED start, result or not.
describe('roundStarted — market shuts when a round goes live by schedule, before any result', () => {
  // R16's scheduled start is 2026-08-08T16:30:00Z; put the clock just after it, with R16 undrawn of
  // any result (loadSampleThrough('R32') leaves R16 drawn but unplayed).
  afterAll(() => { vi.setSystemTime(new Date('2026-07-01T00:00:00Z')); }); // restore the suite clock

  it('R16 live (scheduled start passed) with 0 results → started, market shut, leaders advance', () => {
    loadSampleThrough('R32');
    // Derive the clock from the ACTIVE tournament's own schedule rather than a hardcoded Montréal
    // date — otherwise this silently stops testing anything the moment the active event changes.
    vi.setSystemTime(new Date(Date.parse(TOURNAMENT.schedule!.R16!) + 90 * 60_000)); // 90 min in

    const r16HasResult = sampleDraw.some(m => m.round === 'R16' && useLiveStore.getState().results[matchKey('R16', m.slot)]);
    expect(r16HasResult).toBe(false);          // no finished R16 match yet…
    expect(roundStarted('R16')).toBe(true);    // …but it's started by the clock
    // Underway (locked) by SCHEDULE, but not `live` — no result has landed, so nothing user-facing
    // may claim the R16 is being played. This is the exact shape of the finals-day wording bug.
    expect(liveRoundStatus()).toEqual({ round: 'R16', underway: true, live: false });
    expect(cashInOpen()).toBe(false);          // market shut while R16 is live
    expect(transferWindowOpen()).toBe(false);
    expect(liveLeaderRound()).toBe('QF');      // you now set your QF captain, not R16's
  });

  it('same state but clock BEFORE R16 start → still a break, market open', () => {
    loadSampleThrough('R32');
    vi.setSystemTime(new Date('2026-08-08T12:00:00Z')); // before 16:30Z
    expect(roundStarted('R16')).toBe(false);
    expect(cashInOpen()).toBe(true);
    expect(liveLeaderRound()).toBe('R16');
  });
});
