import { describe, it, expect } from 'vitest';
import shanghai2025 from './fixtures/sha2025-fulldraw.txt?raw';
import usOpen2025 from './fixtures/uso2025-fulldraw.txt?raw';
import { buildResolver, parseFullDraw, openingRound, withFirstRoundPending, losersOf } from '../data/drawParser';
import type { RoundId } from '../types';

// ── A 96-player Masters from the day its draw is published (added 2026-09-24, before Shanghai) ──
// Shanghai is the first 96-player event the current app runs. Two things the scored rounds alone
// cannot show, both pinned here against the real 2025 Shanghai page (a men-only "– Singles" page):
//   1. the first scored round (R64: each seed against an opening-round winner) must exist from draw
//      day, the unknown side 'tbd', with the SAME slot it keeps once the opponent is known;
//   2. the unscored opening round is read on its own, so its losers can be shown as out while the
//      draft is still open — and they are never mistaken for players missing from the draw.

const MASTERS: RoundId[] = ['R64', 'R32', 'R16', 'QF', 'SF', 'F'];
const SLAM: RoundId[] = ['R128', 'R64', 'R32', 'R16', 'QF', 'SF', 'F'];

// A roster built from the page itself, so every name resolves: this tests the DRAW SHAPE.
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const rosterOf = (wikitext: string) => {
  const names = new Set<string>();
  for (const m of wikitext.matchAll(/\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]/g)) names.add(m[1].replace(/\s*\([^)]*\)\s*$/, '').trim());
  return [...names].map(n => ({ id: slug(n), name: n }));
};
const resolve = buildResolver(rosterOf(shanghai2025));
const cell = /(\|\s*RD(\d)-team\d+\s*=)(.*?)(?=\s*\|\s*RD|$)/gm;

// The same page as it looked on draw day: seeds placed in the second round, nobody has played, and
// nothing is known beyond that. Each bracket is rewound by its type — on a Wikipedia draw page the
// Finals bracket comes BEFORE the eight sections, and the 4-team qualifying brackets are left alone.
function drawDay(wikitext: string): string {
  const opener = parseFullDraw(wikitext, { scoredRounds: ['R128'], resolve }).draw;
  const openerIds = new Set(opener.flatMap(m => [m.p1Id, m.p2Id]));
  const starts = [...wikitext.matchAll(/\{\{(\d+)TeamBracket/g)];
  let out = wikitext.slice(0, starts[0]?.index ?? wikitext.length);
  starts.forEach((m, i) => {
    const text = wikitext.slice(m.index, starts[i + 1]?.index ?? wikitext.length);
    if (m[1] === '16') {
      out += text.replace(cell, (_all, head: string, rd: string, raw: string) => {
        if (rd === '1') return head + raw.replace(/'''/g, '');                                            // no results yet
        if (rd === '2') return openerIds.has(resolve(raw)) ? head + ' ' : head + raw.replace(/'''/g, ''); // seeds only
        return head + ' ';                                                                                 // nothing later
      });
    } else if (m[1] === '8') {
      out += text.replace(cell, (_all, head: string) => head + ' ');                                       // no finals yet
    } else {
      out += text;                                                                                          // qualifying
    }
  });
  return out;
}

describe('openingRound — which round nobody scores', () => {
  it('a 96-draw Masters: the sections\' first round', () => {
    expect(openingRound(MASTERS)).toBe('R128');
  });
  it('a Slam: none, its first round is scored', () => {
    expect(openingRound(SLAM)).toBeNull();
  });
});

describe('draw day at a Masters (2025 Shanghai, rewound)', () => {
  const dd = drawDay(shanghai2025);
  const strict = parseFullDraw(dd, { scoredRounds: MASTERS, resolve });
  const pending = withFirstRoundPending(strict.draw, dd, MASTERS, resolve);
  const openerIds = new Set(parseFullDraw(shanghai2025, { scoredRounds: ['R128'], resolve }).draw.flatMap(m => [m.p1Id, m.p2Id]));

  it('the strict parse sees no draw at all — the gap this closes', () => {
    expect(strict.draw).toHaveLength(0);
  });

  it('with the pending rows: all 32 second-round matches, one side each still to be decided', () => {
    expect(pending).toHaveLength(32);
    expect(pending.every(m => m.round === 'R64')).toBe(true);
    expect(pending.map(m => m.slot).sort((a, b) => a - b)).toEqual([...Array(32).keys()]);
    for (const m of pending) {
      expect([m.p1Id, m.p2Id].filter(id => id === 'tbd'), `slot ${m.slot}`).toHaveLength(1);
      const known = m.p1Id === 'tbd' ? m.p2Id : m.p1Id;
      expect(openerIds.has(known), `slot ${m.slot}: ${known} is a seed, not an opening-round player`).toBe(false);
    }
    expect(Object.keys(strict.results)).toHaveLength(0);
  });

  it('each pending match keeps its slot once the opponent is known (slots are structural)', () => {
    const full = parseFullDraw(shanghai2025, { scoredRounds: ['R64'], resolve }).draw;
    for (const m of pending) {
      const later = full.find(f => f.slot === m.slot)!;
      const known = m.p1Id === 'tbd' ? m.p2Id : m.p1Id;
      expect([later.p1Id, later.p2Id], `slot ${m.slot}`).toContain(known);
    }
  });

  it('adds nothing once every pairing is complete', () => {
    const full = parseFullDraw(shanghai2025, { scoredRounds: MASTERS, resolve });
    expect(withFirstRoundPending(full.draw, shanghai2025, MASTERS, resolve)).toHaveLength(full.draw.length);
  });
});

describe('the unscored opening round (2025 Shanghai)', () => {
  const opener = openingRound(MASTERS)!;
  const op = parseFullDraw(shanghai2025, { scoredRounds: [opener], resolve });
  const scored = parseFullDraw(shanghai2025, { scoredRounds: MASTERS, resolve }).draw;
  const inScored = new Set(scored.flatMap(m => [m.p1Id, m.p2Id]));

  it('reads all 32 opening-round matches, all decided', () => {
    expect(op.draw).toHaveLength(32);
    expect(Object.keys(op.results)).toHaveLength(32);
  });

  it('its 32 losers never appear in a scored round; its 32 winners each open in the second round', () => {
    const losers = losersOf(op.draw, op.results);
    expect(new Set(losers).size).toBe(32);
    for (const id of losers) expect(inScored.has(id), `${id} lost the opening round`).toBe(false);
    const r64 = scored.filter(m => m.round === 'R64').flatMap(m => [m.p1Id, m.p2Id]);
    for (const w of Object.values(op.results)) expect(r64.filter(id => id === w), w).toHaveLength(1);
  });

  it('an undecided pairing has no loser', () => {
    const dd = parseFullDraw(drawDay(shanghai2025), { scoredRounds: [opener], resolve });
    expect(dd.draw).toHaveLength(32);
    expect(losersOf(dd.draw, dd.results)).toEqual([]);
  });
});

describe('a Slam is untouched (2025 US Open)', () => {
  const slamResolve = buildResolver(rosterOf(usOpen2025));
  it('every first-round pairing is complete, so nothing is added', () => {
    const full = parseFullDraw(usOpen2025, { scoredRounds: SLAM, resolve: slamResolve });
    expect(withFirstRoundPending(full.draw, usOpen2025, SLAM, slamResolve)).toHaveLength(full.draw.length);
  });
});
