import { describe, it, expect } from 'vitest';
import { buildResolver, parseFullDraw } from '../data/drawParser';
import type { RoundId } from '../types';

// REGRESSION GUARD for the live-Montréal scoring freeze (2026-08): parseFullDraw used to number
// a round's slots by densely packing only the COMPLETE pairings, so a match's (round, slot) shifted
// every time an earlier match finished. The ingest keys public.matches by (round, slot) and applies
// a never-regress merge — so a shifting slot carried a recorded winner onto a different pairing,
// tripping the winner-in-pairing DB CHECK (freezing the ingest) and mis-scoring. Slots must now be
// STRUCTURAL: a given pairing keeps the same slot no matter how many neighbours are decided.
describe('parseFullDraw — stable structural slots', () => {
  const resolve = buildResolver([
    { id: 'a', name: 'A' }, { id: 'c', name: 'C' }, { id: 'd', name: 'D' },
  ]);
  const SCORED = ['R64', 'R32', 'R16'] as RoundId[];
  // One 16-team section, Round-of-64 (section RD2): pair 0 is still INCOMPLETE (A vs a TBD
  // first-round winner), pair 1 is COMPLETE (C beat D). Pair 1 sits at structural slot 1.
  const wt = `{{16TeamBracket-Compact-Tennis3
| RD2-team1=[[A]]
| RD2-team2=
| RD2-team3='''[[C]]'''
| RD2-team4=[[D]]
}}`;

  const cdSlot = (includeIncomplete: boolean) => {
    const { draw } = parseFullDraw(wt, { scoredRounds: SCORED, resolve, includeIncomplete });
    return draw.find((m) => m.round === 'R64' && (m.p1Id === 'c' || m.p2Id === 'c'))?.slot;
  };

  it('gives a completed pairing the same slot whether or not its neighbour is decided', () => {
    // ingest mode drops the incomplete pair 0; display mode keeps it as A-vs-TBD. Either way the
    // C-vs-D pairing must stay at slot 1 — never collapse to a dense 0 when pair 0 is absent.
    expect(cdSlot(false)).toBe(1); // ingest mode (incomplete neighbour skipped)
    expect(cdSlot(true)).toBe(1);  // display mode (incomplete neighbour shown)
    expect(cdSlot(false)).toBe(cdSlot(true));
  });

  it('records the winner under that same stable slot', () => {
    const { results } = parseFullDraw(wt, { scoredRounds: SCORED, resolve, includeIncomplete: false });
    expect(results['R64_1']).toBe('c'); // not R64_0
  });
});
