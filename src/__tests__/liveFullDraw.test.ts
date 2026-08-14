import { describe, it, expect } from 'vitest';
import fullDraw from './fixtures/nbo2025-fulldraw.txt?raw';
import { parseFullDraw } from '../data/liveData';
import { matchKey } from '../data/liveResults';
import { TOURNAMENT } from '../data/tournamentConfig';

// Full-page stitching test against the REAL 2025 National Bank Open men's-singles draw
// (the same 96-player Masters format the 2026 live feed will run). The page is 8 section
// brackets + 1 finals bracket; parseFullDraw must reconstruct the tournament's six scored
// rounds with globally-unique slots and the correct advancement — the piece that was an
// unfinished TODO before Aug 1. Fetched live from the CORS-open MediaWiki API and frozen
// as a fixture so this stays deterministic.
describe('live feed — full 96-draw stitching (real 2025 NBO page)', () => {
  const { draw, results } = parseFullDraw(fullDraw);
  const count = (r: string) => draw.filter(m => m.round === r).length;

  it('reconstructs all six scored rounds with the right match counts', () => {
    expect(count('R64')).toBe(32);
    expect(count('R32')).toBe(16);
    expect(count('R16')).toBe(8);
    expect(count('QF')).toBe(4);
    expect(count('SF')).toBe(2);
    expect(count('F')).toBe(1);
  });

  // CHANGED 2026-08-14: the client now READS the unscored opening round. It is played while the
  // draft is still open, so without it the market happily sold players who had already gone home.
  // Reading it is safe because scoring looks the base up in TOURNAMENT.rounds, which excludes it —
  // a win there is worth 0 (pinned in openingRound.test.ts). The SERVER ingest still omits it, so
  // public.matches stays scored-rounds-only and recompute-score can never pay for it.
  it('READS the unscored opening round, so eliminations are known during the draft', () => {
    expect(count('R128')).toBe(32);
  });

  it('derives the correct champion (Ben Shelton, 2025 Toronto)', () => {
    expect(results[matchKey('F', 0)]).toBe('shelton');
  });

  it('resolves a winner for every match — the 2025 draw is complete', () => {
    const total = 32 + 32 + 16 + 8 + 4 + 2 + 1; // 95 = the opening round + the six scored ones
    expect(draw).toHaveLength(total);
    expect(Object.keys(results)).toHaveLength(total);
  });

  it('numbers slots globally & contiguously within each round (no collisions)', () => {
    for (const round of TOURNAMENT.rounds) {
      const slots = draw.filter(m => m.round === round).map(m => m.slot).sort((a, b) => a - b);
      expect(slots).toEqual([...slots.keys()]); // 0,1,2,… — unique and contiguous
    }
  });

  it('stitches rounds correctly — every semi-finalist won a quarter-final', () => {
    const qfWinners = new Set(draw.filter(m => m.round === 'QF').map(m => results[matchKey('QF', m.slot)]));
    const sfPlayers = draw.filter(m => m.round === 'SF').flatMap(m => [m.p1Id, m.p2Id]);
    for (const p of sfPlayers) expect(qfWinners.has(p)).toBe(true);
  });
});
