import { describe, it, expect } from 'vitest';
import { useLiveStore } from '../store/liveStore';
import { matchKey } from '../data/liveResults';
import { liveRoundStatus } from '../data/tournament';
import { TOURNAMENT } from '../data/tournamentConfig';
import { loadSampleThrough, sampleDraw, sampleResults } from './fixtures/sampleDraw';

// Guards the "Up Next / Underway" status box against the bug the user caught: a COMPLETE round
// (R64 done, 32/32) must not read as "R64 underway" just because it still holds results — the
// next round (R32, drawn but unplayed) is what's "Up Next". A round is "underway" only while it
// has some results but isn't finished.
describe('liveRoundStatus — Underway vs Up Next', () => {
  it('before any play, the first round is Up Next', () => {
    loadSampleThrough(null); // full draw, no results
    expect(liveRoundStatus()).toEqual({ round: 'R64', underway: false, live: false });
  });

  it('a COMPLETE round is NOT underway — the next round is Up Next (the R64→R32 case)', () => {
    loadSampleThrough('R64'); // R64 32/32 done; R32 drawn but 0 played
    expect(liveRoundStatus()).toEqual({ round: 'R32', underway: false, live: false });
  });

  it('a partially-played round IS underway', () => {
    loadSampleThrough('R64');
    const oneR32 = sampleDraw.find(m => m.round === 'R32')!; // reveal a single R32 result
    const k = matchKey(oneR32.round, oneR32.slot);
    useLiveStore.setState(s => ({ ...s, results: { ...s.results, [k]: sampleResults[k] } }));
    // A recorded result is EVIDENCE of play → both flags true.
    expect(liveRoundStatus()).toEqual({ round: 'R32', underway: true, live: true });
  });

  it('returns null once the whole draw is played out', () => {
    loadSampleThrough('F');
    expect(liveRoundStatus()).toBeNull();
  });

  // The bug the user caught on finals day: the Final's scheduled time is an ESTIMATE (the
  // finals-day order of play publishes late). Once it passed, the app announced "The Final is
  // underway" while the Final had not been played. `underway` must still lock (fail-safe), but
  // `live` must stay false so nothing user-facing claims play is happening without evidence.
  it('a round whose ESTIMATED start has passed is underway (locked) but NOT live', () => {
    loadSampleThrough('SF'); // SF complete, Final drawn, 0 results
    const realNow = Date.now;
    try {
      const fStart = Date.parse(TOURNAMENT.schedule!.F!);
      Date.now = () => fStart + 60_000; // one minute past the estimated start
      const st = liveRoundStatus();
      expect(st).toEqual({ round: 'F', underway: true, live: false });
    } finally {
      Date.now = realNow;
    }
  });
});
