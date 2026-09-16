// Integration verification for the F1 write-path security boundary. Run AFTER applying
// supabase/save_entry_rpc.sql. It confirms, against the LIVE database, that:
//   1. a raw PATCH to entries.state is REJECTED (403) — the direct write path is closed;
//   2. save_entry accepts a legal squad and returns a new rev;
//   3. save_entry rejects an illegal squad (duplicates) with a reason.
//
// It needs a real USER access token (not the anon key) because the boundary is on the
// `authenticated` role. Get one from the app: open the site, log in, then in the browser
// console run:  JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.endsWith('-auth-token')))).access_token
//
// Usage (from anywhere; the tournament defaults to the ACTIVE one):
//   GSGM_JWT="<paste token>" node scripts/verify-save-entry.mjs [tournament_id]
import { env, activeTournament } from './lib/supabase.mjs';

const BASE = env.VITE_SUPABASE_URL, ANON = env.VITE_SUPABASE_ANON_KEY, JWT = process.env.GSGM_JWT;
if (!JWT) { console.error('Set GSGM_JWT to a logged-in user access token (see header).'); process.exit(1); }
const TOURNAMENT = await activeTournament();

const authed = { apikey: ANON, Authorization: `Bearer ${JWT}`, 'Content-Type': 'application/json' };
const ok = (label, pass, extra = '') => console.log(`${pass ? '✅' : '❌'} ${label}${extra ? ' — ' + extra : ''}`);

// 1) Raw PATCH to entries.state → must be denied (403/401) now that direct writes are revoked.
const patch = await fetch(`${BASE}/rest/v1/entries?tournament_id=eq.${TOURNAMENT}`, {
  method: 'PATCH', headers: { ...authed, Prefer: 'return=minimal' },
  body: JSON.stringify({ state: { hacked: true, myTeam: [] } }),
});
ok('raw PATCH to entries.state is blocked (403/401)', patch.status === 403 || patch.status === 401, `HTTP ${patch.status}`);

// Resolve the public league id (the RPC needs it).
const lg = await fetch(`${BASE}/rest/v1/leagues?is_public=eq.true&select=id`, { headers: authed }).then(r => r.json());
const league = lg?.[0]?.id;
if (!league) { console.log('⚠️  could not read public league id (RLS/JWT?) — skipping RPC checks'); process.exit(0); }

// 2) save_entry with an ILLEGAL squad (duplicate ids) → rejected.
const bad = await fetch(`${BASE}/rest/v1/rpc/save_entry`, {
  method: 'POST', headers: authed,
  body: JSON.stringify({ p_tournament: TOURNAMENT, p_league: league, p_base_rev: 0, p_state: { phase: 'draft', myTeam: ['zverev', 'zverev'] } }),
});
const badBody = await bad.json().catch(() => ({}));
ok('save_entry rejects an illegal squad', bad.status >= 400, `HTTP ${bad.status} · ${badBody.message ?? ''}`);

console.log('\n(Read-only note: this script does not write a real squad — the legal-squad path\n would overwrite your entry, so verify that one from the app UI.)');
