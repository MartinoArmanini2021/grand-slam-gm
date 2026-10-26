// The 56-draw parser (fd6078f, 9418f56) changed nothing for the draws we already ran (26 Oct 2026).
//
// The REAL ingest-draw handler is run (edgeHarness) on the 2026 Wikipedia pages for Montréal,
// Cincinnati and the US Open, as a fresh ingest (no stored winners, no overrides), and the rows it
// would upsert into `matches` are compared with the archived snapshots: round, slot, both players and
// the winner. The snapshots equal the live `matches` rows (md5 of the same rows, checked 26 Oct:
// cincinnati fb314064…, montreal d3c8a51d…, usopen 50fe2c51…).
//
// Fixtures: Wikipedia wikitext fetched 26 Oct 2026 (revids nbo 1371430995, cin 1371750238,
// uso 1380212005).
import { describe, expect, it } from 'vitest';
import ingestSrc from '../../supabase/functions/ingest-draw/index.ts?raw';
import montrealField from '../data/montreal2026Field.json';
import cincinnatiField from '../data/cincinnati2026Field.json';
import usopenField from '../data/usopen2026Field.json';
import nbo from './fixtures/nbo2026-fulldraw.txt?raw';
import cin from './fixtures/cin2026-fulldraw.txt?raw';
import uso from './fixtures/uso2026-fulldraw.txt?raw';
import montrealSnap from '../../snapshots/montreal_2026.json';
import cincinnatiSnap from '../../snapshots/cincinnati_2026.json';
import usopenSnap from '../../snapshots/usopen_2026.json';
import { cronRequest, loadEdge, ok, type Router } from './edgeHarness';

type Row = { round: string; slot: number; p1_id: string; p2_id: string; winner_id: string | null };
const key = (r: Row) => `${r.round}|${r.slot}|${r.p1_id}|${r.p2_id}|${r.winner_id ?? ''}`;

const CASES = [
  { id: 'montreal_2026', wikitext: nbo, snap: montrealSnap.matches as Row[], n: 63 },
  { id: 'cincinnati_2026', wikitext: cin, snap: cincinnatiSnap.matches as Row[], n: 63 },
  { id: 'usopen_2026', wikitext: uso, snap: usopenSnap.matches as Row[], n: 127 },
];

describe.each(CASES)('ingest-draw on $id reproduces the stored matches', ({ id, wikitext, snap, n }) => {
  it(`writes the same ${n} rows: round, slot, players and winner`, async () => {
    const route: Router = (call) => {
      if (call.table === 'en.wikipedia.org') return ok({ parse: { wikitext } });
      if (call.table === 'tournament_status') return ok([]); // treat as not frozen, to run the parse
      if (call.method === 'GET' && ['matches', 'match_overrides', 'opening_round'].includes(call.table)) return ok([]);
      if (call.method === 'POST' && ['matches', 'opening_round', 'ingest_health'].includes(call.table)) return ok([]);
      return undefined;
    };
    const h = loadEdge(ingestSrc, route, { montrealField, cincinnatiField, usopenField });
    const res = await h.handler(cronRequest({ tournamentId: id }));
    expect(res.status, await res.clone().text()).toBe(200);

    const writes = h.to('matches', 'POST');
    expect(writes).toHaveLength(1);
    const rows = (writes[0].body as Row[]).map(key).sort();
    const stored = snap.map(key).sort();
    expect(stored).toHaveLength(n);
    expect(rows).toEqual(stored);
  });
});
