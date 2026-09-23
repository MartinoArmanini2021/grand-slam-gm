// Captain auto-promotion (adopted 2026-09-23, Shanghai onward) — run through the DEPLOYED scorer.
//
// The edge function cannot be imported (it calls Deno.serve at load), so this test cuts its pure
// scoring section out of the source text, transpiles it with esbuild and runs it. What is tested is
// therefore byte-for-byte the code that ships. The SCENARIOS table is duplicated verbatim in the
// app repo (grand-slam-gm src/lib/game/__tests__/armbandAuto.test.ts), which runs the same cases
// through the app engine: same inputs, same totals. Change one table, change both.
import { describe, it, expect } from 'vitest';
import { transformSync } from 'esbuild';
import edgeSrc from '../../supabase/functions/recompute-score/index.ts?raw';

type Hist = { round: string; playerId: string | null }[];
interface EdgeState {
  initialSquad: string[];
  transfers?: { out: string; in: string; round: string }[];
  captainHistory: Hist;
  viceCaptainHistory: Hist;
}
interface Edge {
  scoreEntry: (s: EdgeState, m: unknown[], r: Record<string, number>, played: string[], pts: Record<string, number>, auto?: boolean) => number;
  autoArmbandFor: (tid: string) => boolean;
  curveFor: (tid: string) => Record<string, number>;
}

function loadEdge(): Edge {
  const src = edgeSrc.replace(/\r\n/g, '\n');
  const start = src.indexOf('const LEGACY_POINTS');
  const end = src.indexOf('// ── transient-failure shield');
  if (start < 0 || end < 0 || end < start) throw new Error('recompute-score layout changed: scoring section markers not found');
  const { code } = transformSync(src.slice(start, end), { loader: 'ts' });
  return new Function(`${code}\nreturn { scoreEntry, autoArmbandFor, curveFor };`)() as Edge;
}
const edge = loadEdge();

/* ---------------- shared fixture (keep identical to the app test) ---------------- */

type Row = [round: string, slot: number, p1: string, p2: string, winner: string | null];
const DRAW: Row[] = [
  ['R64', 0, 'a', 'x1', 'a'],
  ['R64', 1, 'b', 'x2', 'b'],
  ['R64', 2, 'c', 'x3', 'x3'],
  ['R64', 3, 'd', 'x4', 'd'],
  ['R64', 4, 'e', 'x5', 'e'],
  ['R64', 5, 'f', 'x6', 'x6'],
  ['R64', 6, 'g', 'x7', 'g'],
  ['R32', 0, 'a', 'y1', 'a'],
  ['R32', 1, 'b', 'y2', 'y2'],
  ['R32', 2, 'd', 'y4', 'd'],
  ['R32', 3, 'e', 'y5', 'e'],
  ['R32', 4, 'g', 'y7', 'g'],
  ['R32', 5, 'x3', 'x6', 'x3'],
];
const RANKS: Record<string, number> = {
  a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 50,
  x1: 100, x2: 100, x3: 100, x4: 100, x5: 100, x6: 100, x7: 100,
  y1: 100, y2: 100, y4: 100, y5: 100, y7: 100,
};
const SQUAD = ['a', 'b', 'c', 'd', 'e', 'f'];
const h = (round: string, playerId: string | null) => ({ round, playerId });

interface Scenario { name: string; state: EdgeState; dropRank?: string; auto: number; legacy: number }

// Format 2: R64 = 2, R32 = 3. No upsets in this draw for squad players.
const SCENARIOS: Scenario[] = [
  { name: 'captain out, vice alive: vice moves up, best survivor becomes vice',
    state: { initialSquad: SQUAD, captainHistory: [h('R64', 'c')], viceCaptainHistory: [h('R64', 'd')] },
    auto: 22.5, legacy: 19.5 },
  { name: 'both out: the two best-ranked survivors take them',
    state: { initialSquad: SQUAD, captainHistory: [h('R64', 'c')], viceCaptainHistory: [h('R64', 'f')] },
    auto: 20, legacy: 17 },
  { name: 'vice out, captain alive: best survivor becomes vice',
    state: { initialSquad: SQUAD, captainHistory: [h('R64', 'e')], viceCaptainHistory: [h('R64', 'c')] },
    auto: 23.5, legacy: 22 },
  { name: "the manager's own live pick always wins",
    state: { initialSquad: SQUAD, captainHistory: [h('R64', 'c'), h('R32', 'e')], viceCaptainHistory: [h('R64', 'd')] },
    auto: 22.5, legacy: 22.5 },
  { name: 'a missing rank sorts last',
    state: { initialSquad: SQUAD, captainHistory: [h('R64', 'c')], viceCaptainHistory: [h('R64', 'f')] },
    dropRank: 'a', auto: 18.5, legacy: 17 },
  { name: 'a sold captain is replaced like an eliminated one',
    state: { initialSquad: SQUAD, transfers: [{ out: 'c', in: 'g', round: 'R64' }], captainHistory: [h('R64', 'c')], viceCaptainHistory: [h('R64', 'd')] },
    auto: 25.5, legacy: 22.5 },
  { name: 'no armband ever set: both filled from the start',
    state: { initialSquad: SQUAD, captainHistory: [], viceCaptainHistory: [] },
    auto: 23, legacy: 17 },
  { name: 'an explicitly cleared vice refills',
    state: { initialSquad: SQUAD, captainHistory: [h('R64', 'e')], viceCaptainHistory: [h('R64', 'd'), h('R32', null)] },
    auto: 24.5, legacy: 23 },
];

/* ---------------- server scorer ---------------- */

const matches = DRAW.map(([round, slot, p1, p2, winner]) => ({ round, slot, p1, p2, winner }));
const played = ['R64', 'R32'];
const ranksFor = (drop?: string) => { const r = { ...RANKS }; if (drop) delete r[drop]; return r; };

describe('captain auto-promotion — shared scenarios (deployed scorer)', () => {
  const pts = edge.curveFor('shanghai_2026');
  for (const sc of SCENARIOS) {
    it(`${sc.name}: auto ${sc.auto}, old rule ${sc.legacy}`, () => {
      const ranks = ranksFor(sc.dropRank);
      expect(edge.scoreEntry(sc.state, matches, ranks, played, pts, true)).toBe(sc.auto);
      expect(edge.scoreEntry(sc.state, matches, ranks, played, pts, false)).toBe(sc.legacy);
    });
  }
});

describe('the three 2026 events keep the old rule', () => {
  it('pinned ids are off, everything else is on', () => {
    expect(edge.autoArmbandFor('montreal_2026')).toBe(false);
    expect(edge.autoArmbandFor('cincinnati_2026')).toBe(false);
    expect(edge.autoArmbandFor('usopen_2026')).toBe(false);
    expect(edge.autoArmbandFor('shanghai_2026')).toBe(true);
  });
  it('the handler passes autoArmbandFor(tournamentId) to scoreEntry', () => {
    expect(edgeSrc).toMatch(/curveFor\(tournamentId!\),\s*autoArmbandFor\(tournamentId!\)\)/);
  });
});
