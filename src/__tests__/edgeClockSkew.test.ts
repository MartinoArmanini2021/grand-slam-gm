// "JWT issued at future" (PGRST303) and frozen events, through the REAL handlers (26 Oct 2026).
//
// After a cold start the edge box's clock can run ahead of the database's, and PostgREST refuses the
// function's own service key with 401 PGRST303 for a moment. That used to fail the run at the freeze
// check and write an ok:false heartbeat on a FROZEN event (US Open, 27 Sep and 26 Oct). Now:
//   • a PGRST303 401 is retried like a 5xx (about a second apart, 3 attempts); any other 401 is not;
//   • when a run fails before the freeze check finished, a fresh read decides: frozen → no heartbeat,
//     not frozen or unreadable → the failure heartbeat, as before.
import { describe, expect, it } from 'vitest';
import recomputeSrc from '../../supabase/functions/recompute-score/index.ts?raw';
import ingestSrc from '../../supabase/functions/ingest-draw/index.ts?raw';
import montrealField from '../data/montreal2026Field.json';
import cincinnatiField from '../data/cincinnati2026Field.json';
import usopenField from '../data/usopen2026Field.json';
import { EXPIRED, SKEW, cronRequest, loadEdge, ok, type Reply, type Router } from './edgeHarness';

const FIELDS = { montrealField, cincinnatiField, usopenField };
const ID = 'usopen_2026';

const FUNCTIONS = [
  { name: 'recompute-score', src: recomputeSrc, health: 'scoring_health', extra: { assertServiceRole: () => null } },
  { name: 'ingest-draw', src: ingestSrc, health: 'ingest_health', extra: FIELDS },
] as const;

/** tournament_status answers in order; the heartbeat upsert is always accepted. */
const statusThen = (...replies: Reply[]): Router => (call, nth) => {
  if (call.table === 'tournament_status') return replies[nth - 1];
  if (call.method === 'POST' && (call.table === 'scoring_health' || call.table === 'ingest_health')) return ok([]);
  // recompute-score's not-frozen path: nothing to score
  if (call.method === 'GET' && ['matches', 'player_stats', 'entries'].includes(call.table)) return ok([]);
  return undefined;
};
const FROZEN_ROW = ok([{ tournament_id: ID }]);
const NOT_FROZEN = ok([]);

describe.each(FUNCTIONS)('$name: clock-skew refusal and frozen events', ({ src, health, extra }) => {
  it('one PGRST303, then 200: retried after about a second, and the run succeeds', async () => {
    const h = loadEdge(src, statusThen(SKEW, FROZEN_ROW), extra);
    const res = await h.handler(cronRequest({ tournamentId: ID }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, skipped: 'completed' });
    expect(h.to('tournament_status')).toHaveLength(2);
    expect(h.waits[0]).toBe(1000);
    expect(h.to(health)).toHaveLength(0);
  });

  it('three PGRST303 on an event that is NOT frozen: gives up after 3 attempts and writes the failure heartbeat', async () => {
    const h = loadEdge(src, statusThen(SKEW, SKEW, SKEW, NOT_FROZEN), extra);
    const res = await h.handler(cronRequest({ tournamentId: ID }));
    expect(res.status).toBe(500);
    expect(h.to('tournament_status')).toHaveLength(4); // 3 attempts + the fresh re-read
    const beats = h.to(health, 'POST');
    expect(beats).toHaveLength(1);
    expect(beats[0].body).toMatchObject({ tournament_id: ID, ok: false });
    expect(String((beats[0].body as { error: string }).error)).toContain('JWT issued at future');
  });

  it('the freeze read fails on a FROZEN event: the fresh read finds it frozen, so no heartbeat', async () => {
    const h = loadEdge(src, statusThen(SKEW, SKEW, SKEW, FROZEN_ROW), extra);
    const res = await h.handler(cronRequest({ tournamentId: ID }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, skipped: 'completed' });
    expect(h.to(health)).toHaveLength(0);
  });

  it('any other 401 is not retried, and a failed re-read still writes the failure heartbeat', async () => {
    const h = loadEdge(src, statusThen(EXPIRED, EXPIRED), extra);
    const res = await h.handler(cronRequest({ tournamentId: ID }));
    expect(res.status).toBe(500);
    expect(h.to('tournament_status')).toHaveLength(2); // the read, then the re-read: no retries
    expect(h.waits).toHaveLength(0);
    expect(h.to(health, 'POST')).toHaveLength(1);
  });
});

describe('recompute-score: the not-frozen path is unchanged', () => {
  it('reads the status once, scores, and writes an ok heartbeat', async () => {
    const h = loadEdge(recomputeSrc, statusThen(NOT_FROZEN), { assertServiceRole: () => null });
    const res = await h.handler(cronRequest({ tournamentId: 'paris_2026' }));
    expect(res.status).toBe(200);
    expect(h.to('tournament_status')).toHaveLength(1);
    expect(h.to('scoring_health', 'POST')[0].body).toMatchObject({ tournament_id: 'paris_2026', ok: true });
  });

  it('a failure AFTER the freeze check writes the heartbeat without re-reading the status', async () => {
    const route: Router = (call, nth) =>
      call.table === 'matches' ? { status: 500, body: { code: 'XX000', message: 'boom' } } : statusThen(NOT_FROZEN)(call, nth);
    const h = loadEdge(recomputeSrc, route, { assertServiceRole: () => null });
    const res = await h.handler(cronRequest({ tournamentId: 'paris_2026' }));
    expect(res.status).toBe(500);
    expect(h.to('tournament_status')).toHaveLength(1);
    expect(h.to('scoring_health', 'POST')[0].body).toMatchObject({ ok: false });
  });
});
