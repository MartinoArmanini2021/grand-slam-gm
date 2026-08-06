import { describe, it, expect, beforeAll } from 'vitest';
import { buildLegalityFixtures } from './fixtures/entryFixtures';
import { validateSquadLegality, type RosterPricing } from '../data/entryValidation';
import { PLAYERS } from '../data/players';

// ── DRIFT GUARD: the SQL RPC must give the SAME verdict as entryValidation.ts ──────────────
// "The SQL mirrors the TS exactly" is only true until someone edits one side. This runs the
// SHARED fixtures through the LIVE save_entry RPC and asserts each verdict equals the TS
// validator's — so a divergence in either the SQL or the TS fails a test. It ALSO checks the
// raw-PATCH-403 boundary. It needs a real user token (the boundary is on `authenticated`), so
// it SELF-SKIPS without one — the local unit suite stays green; CI supplies GSGM_TEST_JWT (a
// dedicated test user signed in from secrets, so no token is ever hand-pasted per run).
// Prereq for a PASS: add_entry_rev.sql + save_entry_rpc.sql applied to the target database.

const envv = import.meta.env as Record<string, string | undefined>;
const URL = envv.VITE_SUPABASE_URL;
const ANON = envv.VITE_SUPABASE_ANON_KEY;
const g = globalThis as unknown as { process?: { env?: Record<string, string | undefined> } };
const JWT = g.process?.env?.GSGM_TEST_JWT;
const RUN = Boolean(URL && ANON && JWT);

const ROSTER = new Map<string, RosterPricing>(PLAYERS.map(p => [p.id, { id: p.id, price: p.price, ranking: p.ranking }]));
const tsVerdict = (f: ReturnType<typeof buildLegalityFixtures>[number]): 'accept' | 'reject' =>
  validateSquadLegality({ squad: f.state.myTeam, phase: f.state.phase, hasTransfers: f.state.transfers.length > 0, hasCashedIn: false }, ROSTER) === null ? 'accept' : 'reject';

describe.skipIf(!RUN)('save_entry RPC ↔ entryValidation.ts drift (live DB)', () => {
  const H = { apikey: ANON!, Authorization: `Bearer ${JWT}`, 'Content-Type': 'application/json' };
  const uid = RUN ? (JSON.parse(atob(JWT!.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { sub: string }).sub : '';
  let league = '';

  beforeAll(async () => {
    const lg = await (await fetch(`${URL}/rest/v1/leagues?is_public=eq.true&select=id`, { headers: H })).json();
    league = lg?.[0]?.id;
    expect(league, 'public league id (JWT valid + RLS ok?)').toBeTruthy();
  });

  const currentRev = async (): Promise<number> => {
    const rows = await (await fetch(`${URL}/rest/v1/entries?user_id=eq.${uid}&tournament_id=eq.montreal_2026&select=rev`, { headers: H })).json();
    return rows?.[0]?.rev ?? 0;
  };

  it('raw PATCH to entries.state is blocked (403/401) — the write path is closed', async () => {
    const r = await fetch(`${URL}/rest/v1/entries?tournament_id=eq.montreal_2026`, {
      method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ state: { hacked: true } }),
    });
    expect([401, 403]).toContain(r.status);
  });

  it('B3: a crafted p_league is REJECTED (no multi-entry board pollution)', async () => {
    // A legal (empty, draft) squad but a bogus league id — must be rejected on the league,
    // not silently written under a different league_id (which would duplicate the board row).
    const res = await fetch(`${URL}/rest/v1/rpc/save_entry`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ p_tournament: 'montreal_2026', p_league: '00000000-0000-0000-0000-000000000001', p_base_rev: 0, p_state: { phase: 'draft', myTeam: [] } }),
    });
    expect(res.ok).toBe(false);
    expect(JSON.stringify(await res.json().catch(() => ({})))).toMatch(/invalid league/i);
  });

  it.each(buildLegalityFixtures().map(f => [f.name, f] as const))('RPC verdict == TS verdict == expected: %s', async (_name, f) => {
    const res = await fetch(`${URL}/rest/v1/rpc/save_entry`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ p_tournament: 'montreal_2026', p_league: league, p_base_rev: await currentRev(), p_state: f.state }),
    });
    const rpcVerdict: 'accept' | 'reject' = res.ok ? 'accept' : 'reject';
    expect(rpcVerdict, `RPC disagreed with the intended verdict for "${f.name}"`).toBe(f.expect);
    expect(rpcVerdict, `RPC and entryValidation.ts DRIFTED on "${f.name}"`).toBe(tsVerdict(f));
  });
});
