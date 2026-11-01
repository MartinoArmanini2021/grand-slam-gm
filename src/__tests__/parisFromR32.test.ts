// Paris 2026 from the SECOND round (decided 1 Nov 2026), through the REAL ingest-draw handler.
//
// The first round (R64: 24 matches, the 8 top seeds have a bye) is not scored. It goes to
// opening_round, so the app shows its losers as out while squads are open, exactly like the
// opening round of a 96-player Masters. `matches` gets the scored rounds only, from R32, with the
// unknown side 'tbd' until the first round is played. Fixture: the Wikipedia page on 1 Nov 2026
// (revid 1383251111), the draw published, no match played yet.
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

describe('Paris 2026 scores from the second round', () => {
  it('writes no first-round rows to matches: only R32 and later', async () => {
    const { res, matches } = await firstRun();
    expect(res.status).toBe(200);
    expect(matches.length).toBeGreaterThan(0);
    expect(new Set(matches.map((m) => m.round))).toEqual(new Set(['R32']));
  });

  it('keeps the 24 first-round matches in opening_round, nobody decided yet', async () => {
    const { opening } = await firstRun();
    expect(opening).toHaveLength(24);
    expect(opening.every((m) => m.winner_id === null)).toBe(true);
    const players = new Set(opening.flatMap((m) => [m.p1_id, m.p2_id]));
    expect(players.size).toBe(48);
    expect(players.has('tbd')).toBe(false);
  });

  it('puts the 8 top seeds in R32 against "tbd" and the other R32 slots wait for winners', async () => {
    const { matches, opening } = await firstRun();
    const firstRound = new Set(opening.flatMap((m) => [m.p1_id, m.p2_id]));
    const known = matches.flatMap((m) => [m.p1_id, m.p2_id]).filter((id) => id !== 'tbd');
    // every known R32 player is a bye seed: not in the first round
    expect(known.every((id) => !firstRound.has(id))).toBe(true);
    expect(new Set(known).size).toBe(8);
    // the whole field is covered: 48 in the first round + 8 seeds = 56
    expect(new Set([...firstRound, ...known]).size).toBe(56);
    expect(new Set([...firstRound, ...known])).toEqual(new Set(parisField.map((p) => p.id)));
  });

  // KNOWN LIMIT: before the first round is played, its 48 players have no row in `matches` yet, so
  // the heartbeat lists them as drafted_missing. The watchdog's WALKOVER GAP line only looks once the
  // event is under way (a winner or a started match), so this is silent before the lock; if the R32
  // lock comes while first-round matches are still unplayed, expect a temporary alert on Tuesday,
  // gone as each first-round match finishes (winners appear in R32, losers count as out).
  it('lists exactly the 48 unplayed first-round players as missing, and nobody else', async () => {
    const { health } = await firstRun();
    expect(health.ok).toBe(true);
    expect(health.drafted_missing_count).toBe(48);
  });
});
