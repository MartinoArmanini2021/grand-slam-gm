// ── The Supabase REST helper the read-only scripts used to paste, one copy each ─────────────────
// Reads the anon credentials from the repo's .env (whatever the working directory), talks to
// PostgREST, pages past its response cap, calls RPCs, and resolves "which tournament?" the one way
// every checker must: the argument if given, else whatever the server says is ACTIVE — never a
// hardcoded default that quietly verifies yesterday's event and reads as reassurance.

import { readFileSync } from 'node:fs';

export const env = Object.fromEntries(
  readFileSync(new URL('../../.env', import.meta.url), 'utf8')
    .split(/\r?\n/).filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]),
);
const BASE = env.VITE_SUPABASE_URL;
const KEY = env.VITE_SUPABASE_ANON_KEY;
if (!BASE || !KEY) throw new Error('.env must define VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');

/** Request headers for the anon role; pass a user JWT to act as that user instead. */
export const headers = (jwt = KEY, extra = {}) => ({ apikey: KEY, Authorization: `Bearer ${jwt}`, ...extra });

/** One GET against PostgREST. Throws with the status and body on anything but 2xx. */
export async function api(path) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, { headers: headers() });
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

/**
 * GET every row, paging past PostgREST's response cap (db-max-rows, ~1000): a bare select would
 * silently return the first page only and a checker would report success on a fraction of the
 * field. Give the path an explicit `order=` so page boundaries are stable.
 */
export async function paged(path, page = 1000) {
  const rows = [];
  for (let from = 0; ; from += page) {
    const res = await fetch(`${BASE}/rest/v1/${path}`, { headers: headers(KEY, { Range: `${from}-${from + page - 1}` }) });
    if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`);
    const batch = await res.json();
    rows.push(...batch);
    if (batch.length < page) return rows;
  }
}

/** POST an RPC (anon by default; pass a user JWT to call as that user). */
export async function rpc(fn, body = {}, jwt = KEY) {
  const res = await fetch(`${BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: headers(jwt, { 'Content-Type': 'application/json' }), body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`rpc/${fn} → ${res.status} ${await res.text()}`);
  return res.json();
}

/**
 * The tournament a script should look at: the first argument that is not a flag, else the one the
 * server says is ACTIVE. Flags are ignored so `--detail` can never be read as a tournament name.
 */
export async function activeTournament(argv = process.argv.slice(2)) {
  const arg = argv.find(a => !a.startsWith('--'));
  const tid = arg ?? await rpc('get_active_tournament');
  if (!tid) throw new Error('No tournament: pass one explicitly or set app_config.active_tournament_id.');
  return tid;
}
