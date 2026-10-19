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

// All six rounds are scored (owner's decision, 20 Oct 2026): the top 8 seeds' R64 byes score zero.
const PARIS: RoundId[] = ['R64', 'R32', 'R16', 'QF', 'SF', 'F'];
const ALL = PARIS;

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

// The 2025 page as it looked on draw day: first-round pairings known, nobody has played, the 8 bye
// seeds already placed in the second round, nothing later. Qualifying brackets are left alone.
const cell = /(\|\s*RD(\d)-team\d+\s*=)(.*?)(?=\s*\|\s*RD|$)/gm;
function drawDay(wikitext: string): string {
  const r64 = new Set(parseFullDraw(wikitext, { scoredRounds: ['R64'], resolve, drawSize: 56 }).draw.flatMap(m => [m.p1Id, m.p2Id]));
  const starts = [...wikitext.matchAll(/\{\{(\d+)TeamBracket/g)];
  let out = wikitext.slice(0, starts[0]?.index ?? wikitext.length);
  starts.forEach((m, i) => {
    const text = wikitext.slice(m.index, starts[i + 1]?.index ?? wikitext.length);
    if (m[1] === '16') {
      out += text.replace(cell, (_all, head: string, rd: string, raw: string) => {
        if (rd === '1') return head + raw.replace(/'''/g, '');
        if (rd === '2') return r64.has(resolve(raw)) ? head + ' ' : head + raw.replace(/'''/g, '');
        return head + ' ';
      });
    } else if (m[1] === '8') {
      out += text.replace(cell, (_all, head: string) => head + ' ');
    } else {
      out += text;
    }
  });
  return out;
}

describe('Paris draw day: six scored rounds, byes included', () => {
  it('no unscored opener: R64 is the first scored round', () => {
    expect(openingRound(PARIS, 56)).toBeNull();
    expect(openingRound(['R64', 'R32', 'R16', 'QF', 'SF', 'F'])).toBe('R128'); // 96-draw unchanged
    expect(openingRound(['R32', 'R16', 'QF', 'SF', 'F'], 56)).toBe('R64');
  });

  const dd = drawDay(paris2025);
  const strict = parseFullDraw(dd, { scoredRounds: PARIS, resolve, drawSize: 56 }).draw;
  const day1 = withFirstRoundPending(strict, dd, PARIS, resolve, 56);

  it('the rewound page has no results and 8 seeds waiting in the second round', () => {
    expect(Object.keys(parseFullDraw(dd, { scoredRounds: PARIS, resolve, drawSize: 56 }).results)).toHaveLength(0);
    expect(count(day1)).toEqual({ R64: 24, R32: 8 });
  });

  it('every bye seed has a row from draw day: his R32 pairing, opponent tbd', () => {
    const r32 = day1.filter(m => m.round === 'R32');
    for (const m of r32) expect([m.p1Id, m.p2Id].filter(id => id === 'tbd')).toHaveLength(1);
    const byeSeeds = r32.flatMap(m => [m.p1Id, m.p2Id]).filter(id => id !== 'tbd');
    expect(byeSeeds).toContain('carlosalcaraz');
    expect(byeSeeds).toContain('janniksinner');
    expect(new Set(byeSeeds).size).toBe(8);
  });

  it('all 56 players are in the draw on day one, so none reads as out of it', () => {
    const ids = new Set(day1.flatMap(m => [m.p1Id, m.p2Id]).filter(id => id !== 'tbd'));
    expect(ids.size).toBe(56);
  });

  it('a bye seed keeps the same R32 slot once his opponent is known', () => {
    const full = parseFullDraw(paris2025, { scoredRounds: ['R32'], resolve, drawSize: 56 }).draw;
    for (const m of day1.filter(x => x.round === 'R32')) {
      const seed = m.p1Id === 'tbd' ? m.p2Id : m.p1Id;
      expect(full.find(f => f.slot === m.slot && (f.p1Id === seed || f.p2Id === seed)), seed).toBeDefined();
    }
  });

  it('on the finished page nothing is added twice', () => {
    const scored = parseFullDraw(paris2025, { scoredRounds: PARIS, resolve, drawSize: 56 }).draw;
    expect(withFirstRoundPending(scored, paris2025, PARIS, resolve, 56)).toHaveLength(scored.length);
  });

  it('a too-many-sections page is refused rather than renumbered', () => {
    const extra = paris2025 + '\n' + paris2025.slice(paris2025.indexOf('{{16TeamBracket'), paris2025.indexOf('{{16TeamBracket') + 4000);
    expect(() => parseFullDraw(extra, { scoredRounds: ALL, resolve, drawSize: 56 })).toThrow(/at most 4/);
  });

  it('losersOf still works on the scored first round', () => {
    const op = parseFullDraw(paris2025, { scoredRounds: ['R64'], resolve, drawSize: 56 });
    expect(losersOf(op.draw, op.results)).toHaveLength(24);
  });
});

describe('the 96-draw is untouched: no bye rows are invented at Shanghai', () => {
  it('Shanghai 2025 on draw day still gets only its R64 pairings', () => {
    const r = buildResolver(rosterOf(shanghai2025));
    const MASTERS: RoundId[] = ['R64', 'R32', 'R16', 'QF', 'SF', 'F'];
    const scored = parseFullDraw(shanghai2025, { scoredRounds: MASTERS, resolve: r, drawSize: 96 }).draw;
    expect(withFirstRoundPending(scored, shanghai2025, MASTERS, r, 96)).toHaveLength(scored.length);
  });
});

describe('the 96-draw is untouched by the 56-draw change', () => {
  it('Shanghai 2025 still reads 32/16/8/4/2/1', () => {
    const r = buildResolver(rosterOf(shanghai2025));
    const { draw } = parseFullDraw(shanghai2025, { scoredRounds: ['R64', 'R32', 'R16', 'QF', 'SF', 'F'], resolve: r, drawSize: 96 });
    expect(count(draw)).toEqual({ R64: 32, R32: 16, R16: 8, QF: 4, SF: 2, F: 1 });
  });
});
