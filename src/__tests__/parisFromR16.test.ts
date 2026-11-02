// Paris 2026 from the LAST 16 (decided 2 Nov 2026; from the second round 1–2 Nov), through the REAL
// ingest-draw handler.
//
// The first round (R64: 24 matches, the 8 top seeds have a bye) is not scored and goes to
// opening_round, as before. The second round (R32) is not scored either and is stored nowhere:
// `matches` gets the scored rounds only, from R16, and the app opens squads only once all eight
// Last 16 pairings are known. Fixture: the Wikipedia page on 1 Nov 2026 (revid 1383251111), the draw
// published, no match played yet, so no Last 16 pairing is known.
import { describe, expect, it } from 'vitest';
import ingestSrc from '../../supabase/functions/ingest-draw/index.ts?raw';
import montrealField from '../data/montreal2026Field.json';
import cincinnatiField from '../data/cincinnati2026Field.json';
import usopenField from '../data/usopen2026Field.json';
import parisField from '../data/paris2026Field.json';
import wikitext from './fixtures/par2026-fulldraw.txt?raw';
import { cronRequest, loadEdge, ok, type Router } from './edgeHarness';

type Row = { round: string; slot: number; p1_id: string; p2_id: string; winner_id: string | null };
type HealthRow = { ok: boolean; drafted_missing_count: number; matches_written: number };

async function firstRun() {
  const route: Router = (call) => {
    if (call.table === 'en.wikipedia.org') return ok({ parse: { wikitext } });
    if (call.table === 'tournament_status') return ok([]);
    if (call.method === 'GET' && ['matches', 'match_overrides', 'opening_round'].includes(call.table)) return ok([]);
    if (call.method === 'POST' && ['matches', 'opening_round', 'ingest_health'].includes(call.table)) return ok([]);
    return undefined;
  };
  const h = loadEdge(ingestSrc, route, { montrealField, cincinnatiField, usopenField, parisField });
  const res = await h.handler(cronRequest({ tournamentId: 'paris_2026' }));
  const body = await res.json();
  const matches = (h.to('matches', 'POST')[0]?.body ?? []) as Row[];
  const opening = (h.to('opening_round', 'POST')[0]?.body ?? []) as Row[];
  const health = h.to('ingest_health', 'POST')[0]?.body as HealthRow;
  return { res, body, matches, opening, health };
}

describe('Paris 2026 scores from the Last 16', () => {
  it('writes no first- or second-round rows to matches (none at all on draw day)', async () => {
    const { res, matches } = await firstRun();
    expect(res.status).toBe(200);
    expect(matches.filter((m) => m.round === 'R64' || m.round === 'R32')).toHaveLength(0);
    expect(matches).toHaveLength(0);
  });

  it('keeps the 24 first-round matches in opening_round, nobody decided yet', async () => {
    const { opening } = await firstRun();
    expect(opening).toHaveLength(24);
    expect(opening.every((m) => m.winner_id === null)).toBe(true);
    const players = new Set(opening.flatMap((m) => [m.p1_id, m.p2_id]));
    expect(players.size).toBe(48);
    expect(players.has('tbd')).toBe(false);
  });

  it('raises no walkover gap: first- and second-round players are accounted for by the page', async () => {
    const { health } = await firstRun();
    expect(health.ok).toBe(true);
    expect(health.drafted_missing_count).toBe(0);
  });
});
