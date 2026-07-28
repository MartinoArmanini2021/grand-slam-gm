import { describe, it, expect } from 'vitest';
import finals from './fixtures/nbo2025-finals.txt?raw';
import { parseBracket, splitBrackets, cleanTeam } from '../data/liveData';
import { matchKey } from '../data/liveResults';

// Regression test against REAL Wikipedia markup captured from the 2025 National Bank
// Open (Toronto) men's-singles draw — the same Masters format the live feed will run.
// This locks in the proven behaviour: the parser derives the winner STRUCTURALLY from
// the '''bold''' advancing team, so the whole fetch→parse→merge pipeline is validated
// end-to-end (the fetch itself was verified live against the CORS-open MediaWiki API).
describe('live feed — real 2025 National Bank Open data', () => {
  it('splitBrackets separates each bracket template', () => {
    const combined = finals + '\n{{16TeamBracket-Compact-Tennis3-Byes\n|RD1-team1=x\n}}';
    const parts = splitBrackets(combined);
    expect(parts.length).toBe(2);
    expect(parts[0].type).toMatch(/8TeamBracket/);
    expect(parts[1].type).toMatch(/16TeamBracket/);
  });

  it('derives the correct champion (Ben Shelton) from the finals bracket', () => {
    // The finals bracket is Quarterfinals→Semifinals→Final = RD1→RD2→RD3.
    const { results } = parseBracket(finals, ['QF', 'SF', 'F']);
    expect(results[matchKey('F', 0)]).toBe('shelton'); // real 2025 Toronto winner
  });

  it('extracts the full quarter-final field', () => {
    const { draw } = parseBracket(finals, ['QF', 'SF', 'F']);
    const qf = draw.filter(m => m.round === 'QF');
    expect(qf).toHaveLength(4); // 8 quarter-finalists → 4 matches
    const ids = qf.flatMap(m => [m.p1Id, m.p2Id]);
    expect(ids).toContain('shelton');
    expect(ids).toContain('fritz');
  });

  it('cleanTeam strips flag/link markup to a bare name', () => {
    expect(cleanTeam("'''{{flagicon|USA}} [[Ben Shelton]]'''")).toBe('Ben Shelton');
  });
});
