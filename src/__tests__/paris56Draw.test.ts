import { describe, it, expect } from 'vitest';
import paris2025 from './fixtures/par2025-fulldraw.txt?raw';
import shanghai2025 from './fixtures/sha2025-fulldraw.txt?raw';
import { buildResolver, parseFullDraw, openingRound, sectionRoundsFor, withFirstRoundPending, losersOf } from '../data/drawParser';
import { matchKey } from '../data/liveResults';
import type { RoundId } from '../types';

// ── A 56-player Masters: Paris (added 2026-10-19, before Paris 2026) ─────────────────────────────
// Paris publishes 4 sections, not 8, and its sections start one round LATER (RD1 = R64, RD4 = QF):
// 16 seeds, the top 8 bye the first round. Before this, the parser read every Paris section round
// one step too early ("R128" 24, "R64" 16, …) and the sections' QF doubled the finals bracket's.
// Pinned against the real 2025 page (champion Sinner, final v Auger-Aliassime).

const PARIS: RoundId[] = ['R32', 'R16', 'QF', 'SF', 'F'];   // the proposed scored rounds
const ALL: RoundId[] = ['R64', 'R32', 'R16', 'QF', 'SF', 'F'];

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const rosterOf = (wikitext: string) => {
  const names = new Set<string>();
  for (const m of wikitext.matchAll(/\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]/g)) names.add(m[1].replace(/\s*\([^)]*\)\s*$/, '').trim());
  return [...names].map(n => ({ id: slug(n), name: n }));
};
const resolve = buildResolver(rosterOf(paris2025));
const count = (draw: { round: RoundId }[]) => draw.reduce<Record<string, number>>((a, m) => ((a[m.round] = (a[m.round] ?? 0) + 1), a), {});

describe('sectionRoundsFor — which rounds a section bracket spans', () => {
  it('a 56-draw starts at R64 and ends at the quarter-final', () => {
    expect(sectionRoundsFor(56)).toEqual(['R64', 'R32', 'R16', 'QF']);
  });
  it('96, 128 and unspecified keep the original shape', () => {
    expect(sectionRoundsFor(96)).toEqual(['R128', 'R64', 'R32', 'R16']);
    expect(sectionRoundsFor(128)).toEqual(['R128', 'R64', 'R32', 'R16']);
    expect(sectionRoundsFor()).toEqual(['R128', 'R64', 'R32', 'R16']);
  });
});

describe('the 2025 Paris page, read as a 56-draw', () => {
  const { draw, results } = parseFullDraw(paris2025, { scoredRounds: ALL, resolve, drawSize: 56 });

  it('every round has the right number of matches, all decided', () => {
    expect(count(draw)).toEqual({ R64: 24, R32: 16, R16: 8, QF: 4, SF: 2, F: 1 });
    for (const m of draw) expect(results[matchKey(m.round, m.slot)], `${m.round} ${m.slot}`).toBeDefined();
  });

  it('slots are unique and structural: R64 spans 32 positions, 8 of them byes', () => {
    for (const r of ALL) {
      const slots = draw.filter(m => m.round === r).map(m => m.slot);
      expect(new Set(slots).size, r).toBe(slots.length);
    }
    const r64 = draw.filter(m => m.round === 'R64').map(m => m.slot);
    expect(Math.max(...r64)).toBeLessThan(32);
    expect(draw.filter(m => m.round === 'R32').map(m => m.slot).sort((a, b) => a - b)).toEqual([...Array(16).keys()]);
  });

  it('the final and the champion are right', () => {
    const f = draw.find(m => m.round === 'F')!;
    expect([f.p1Id, f.p2Id].sort()).toEqual(['felixaugeraliassime', 'janniksinner']);
    expect(results[matchKey('F', f.slot)]).toBe('janniksinner');
  });

  it('each R32 winner is in exactly one R16 pairing (rounds chain, nothing duplicated)', () => {
    const r16 = draw.filter(m => m.round === 'R16').flatMap(m => [m.p1Id, m.p2Id]);
    for (const m of draw.filter(m => m.round === 'R32')) {
      expect(r16.filter(id => id === results[matchKey('R32', m.slot)]).length).toBe(1);
    }
  });

  it('read WITHOUT the draw size it is mislabelled — the bug this guards', () => {
    const wrong = parseFullDraw(paris2025, { scoredRounds: ['R128', ...ALL], resolve });
    expect(count(wrong.draw).R128).toBe(24);
  });
});

describe('Paris draw day: the unscored opener and the first scored round', () => {
  it('the opener is R64 when R32 is the first scored round', () => {
    expect(openingRound(PARIS, 56)).toBe('R64');
    expect(openingRound(ALL, 56)).toBeNull();
    expect(openingRound(['R64', 'R32', 'R16', 'QF', 'SF', 'F'])).toBe('R128'); // 96-draw unchanged
  });

  it('the opener read alone gives 24 matches and 24 players out', () => {
    const op = parseFullDraw(paris2025, { scoredRounds: ['R64'], resolve, drawSize: 56 });
    expect(op.draw).toHaveLength(24);
    expect(losersOf(op.draw, op.results)).toHaveLength(24);
  });

  it('withFirstRoundPending keeps every R32 pairing, seeds included', () => {
    const scored = parseFullDraw(paris2025, { scoredRounds: PARIS, resolve, drawSize: 56 }).draw;
    const withPending = withFirstRoundPending(scored, paris2025, PARIS, resolve, 56);
    expect(withPending.filter(m => m.round === 'R32')).toHaveLength(16);
  });

  it('a too-many-sections page is refused rather than renumbered', () => {
    const extra = paris2025 + '\n' + paris2025.slice(paris2025.indexOf('{{16TeamBracket'), paris2025.indexOf('{{16TeamBracket') + 4000);
    expect(() => parseFullDraw(extra, { scoredRounds: ALL, resolve, drawSize: 56 })).toThrow(/at most 4/);
  });
});

describe('the 96-draw is untouched by the 56-draw change', () => {
  it('Shanghai 2025 still reads 32/16/8/4/2/1', () => {
    const r = buildResolver(rosterOf(shanghai2025));
    const { draw } = parseFullDraw(shanghai2025, { scoredRounds: ['R64', 'R32', 'R16', 'QF', 'SF', 'F'], resolve: r, drawSize: 96 });
    expect(count(draw)).toEqual({ R64: 32, R32: 16, R16: 8, QF: 4, SF: 2, F: 1 });
  });
});
