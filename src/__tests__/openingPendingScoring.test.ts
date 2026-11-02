// A short draw's opening round still in play after the lock (2 Nov 2026).
//
// Paris 2026 plays 9 of its 24 unscored first-round matches on Tuesday, the same day the second
// round (the first scored one) begins. A captain who has not played yet is in no match row, so the
// scorer used to call them out and auto-promote the vice to ×2 until their match ended. The deployed
// handler now reads public.opening_round and treats an UNDECIDED opening match as "both still in".
import { describe, it, expect } from 'vitest';
import edgeSrc from '../../supabase/functions/recompute-score/index.ts?raw';
import { cronRequest, loadEdge, ok, type Router } from './edgeHarness';

const RANKS = [{ id: 'zverev', ranking: 2 }, { id: 'djokovic', ranking: 12 }, { id: 'buse', ranking: 32 }, { id: 'vacherot', ranking: 31 }];
const R32 = [{ round: 'R32', slot: 0, p1_id: 'zverev', p2_id: 'buse', winner_id: 'zverev' }];
const ENTRY = {
  user_id: 'u1',
  state: {
    initialSquad: ['zverev', 'djokovic'],
    captainHistory: [{ round: 'R32', playerId: 'djokovic' }],
    viceCaptainHistory: [{ round: 'R32', playerId: 'zverev' }],
  },
};

function run(opening: { p1_id: string; p2_id: string }[]) {
  const route: Router = (call) => {
    if (call.table === 'tournament_status') return ok([]);
    if (call.method === 'GET' && call.table === 'matches') return ok(R32);
    if (call.method === 'GET' && call.table === 'opening_round') return ok(opening);
    if (call.method === 'GET' && call.table === 'player_stats') return ok(RANKS);
    if (call.method === 'GET' && call.table === 'entries') return ok([ENTRY]);
    if (call.method === 'POST' && (call.table === 'rpc/apply_entry_scores' || call.table === 'scoring_health')) return ok([]);
    return undefined;
  };
  return loadEdge(edgeSrc, route, { assertServiceRole: () => null });
}

const scoreOf = (h: ReturnType<typeof run>) =>
  (h.to('rpc/apply_entry_scores', 'POST')[0].body as { p_scores: { score: number }[] }).p_scores[0].score;

describe('recompute-score: an opening-round match still to play', () => {
  it('asks only for undecided opening matches of this tournament', async () => {
    const h = run([]);
    expect((await h.handler(cronRequest({ tournamentId: 'paris_2026' }))).status).toBe(200);
    const q = h.to('opening_round')[0].url.searchParams;
    expect(q.get('tournament_id')).toBe('eq.paris_2026');
    expect(q.get('winner_id')).toBe('is.null');
  });

  it('a captain yet to play keeps the armband: the vice scores ×1.5, not ×2', async () => {
    const pending = run([{ p1_id: 'djokovic', p2_id: 'vacherot' }]);
    expect((await pending.handler(cronRequest({ tournamentId: 'paris_2026' }))).status).toBe(200);
    // Zverev (2) beats Buse (32) in R32: base 3, no upset → 3 × 1.5 = 4.5
    expect(scoreOf(pending)).toBe(4.5);
  });

  it('once the captain is out of the opening round, the vice is promoted as before', async () => {
    const out = run([]); // decided: Djokovic lost, so he is in no row at all
    expect((await out.handler(cronRequest({ tournamentId: 'paris_2026' }))).status).toBe(200);
    expect(scoreOf(out)).toBe(6);
  });
});
