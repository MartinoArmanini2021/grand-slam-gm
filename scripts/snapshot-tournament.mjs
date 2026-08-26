// ── Freeze a finished tournament into a file, before the config moves on ────────────────────────
//
//   node scripts/snapshot-tournament.mjs [tournament_id]
//
// The moment app_config.active_tournament_id repoints, recompute-score stops covering the old
// event forever: its entries.score rows become the permanent historical record, and nothing
// recomputes them again. If a ranking row, a match row or an entry state is ever edited after
// that, the leaderboard silently becomes unreproducible and NOBODY would know — there would be
// no earlier copy to diff against.
//
// So before every cutover, write down what the truth was: every score, every squad state, every
// result, every ranking that produced them. Read-only; writes one JSON file under snapshots/.
//
// Re-verify a snapshot at any time with: node scripts/verify-scores.mjs <tournament_id>
// (it recomputes from the same inputs — a mismatch against the file means something moved).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/).filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const URL_ = env.VITE_SUPABASE_URL;
const KEY = env.VITE_SUPABASE_ANON_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const api = async (path) => {
  const res = await fetch(`${URL_}/rest/v1/${path}`, { headers: H });
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`);
  return res.json();
};
// Page past PostgREST's response cap so a large field is never silently truncated.
const paged = async (path, page = 1000) => {
  const rows = [];
  for (let from = 0; ; from += page) {
    const res = await fetch(`${URL_}/rest/v1/${path}`, {
      headers: { ...H, Range: `${from}-${from + page - 1}` },
    });
    if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`);
    const batch = await res.json();
    rows.push(...batch);
    if (batch.length < page) return rows;
  }
};
const rpc = async (fn) => {
  const res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: '{}',
  });
  if (!res.ok) throw new Error(`rpc/${fn} → ${res.status} ${await res.text()}`);
  return res.json();
};

const arg = process.argv.slice(2).find(a => !a.startsWith('--'));
const TOURNAMENT = arg ?? await rpc('get_active_tournament');
if (!TOURNAMENT) throw new Error('No tournament: pass one explicitly or set app_config.active_tournament_id.');

const [matches, stats, board, profiles] = await Promise.all([
  api(`matches?tournament_id=eq.${TOURNAMENT}&select=round,slot,p1_id,p2_id,winner_id,score_line&order=round,slot`),
  paged(`player_stats?tournament_id=eq.${TOURNAMENT}&select=id,ranking,price,tier&order=id.asc`),
  paged(`board_entries?tournament_id=eq.${TOURNAMENT}&select=user_id,score,state&order=user_id.asc`),
  paged(`public_profiles?select=id,username,team_name,team_emblem&order=id.asc`),
]);

const nameOf = Object.fromEntries(profiles.map(p => [p.id, `${p.team_emblem ?? ''} ${p.team_name ?? ''}`.trim()]));
const decided = matches.filter(m => m.winner_id).length;
const finalRow = matches.find(m => m.round === 'F');
const standings = board
  .filter(e => (e.state?.initialSquad ?? []).length > 0)
  .sort((a, b) => b.score - a.score)
  .map((e, i) => ({ rank: i + 1, user_id: e.user_id, manager: nameOf[e.user_id] ?? '', score: e.score }));

const snapshot = {
  tournament_id: TOURNAMENT,
  taken_at: new Date().toISOString(),
  complete: !!finalRow?.winner_id,
  champion: finalRow?.winner_id ?? null,
  counts: { matches: matches.length, decided, entries: board.length, scored: standings.length, players: stats.length },
  standings,
  // Everything the score is a function of. Keep all three: a score is only
  // reproducible with the results, the rankings (upset multiplier) AND the states.
  matches,
  player_stats: stats,
  entries: board,
};

mkdirSync(new URL('../snapshots/', import.meta.url), { recursive: true });
const out = new URL(`../snapshots/${TOURNAMENT}.json`, import.meta.url);
writeFileSync(out, JSON.stringify(snapshot, null, 2));

console.log(`\n  ${TOURNAMENT} — snapshot written to snapshots/${TOURNAMENT}.json`);
console.log(`  ${snapshot.complete ? `complete · champion ${snapshot.champion}` : 'NOT COMPLETE — the final has no winner yet'}`);
console.log(`  ${decided}/${matches.length} matches decided · ${standings.length} scored entries · ${stats.length} players\n`);
for (const s of standings) {
  console.log(`  ${String(s.rank).padStart(2)}. ${(s.manager || s.user_id.slice(0, 8)).padEnd(24)} ${String(s.score).padStart(7)}`);
}
console.log('');
if (!snapshot.complete) process.exitCode = 2;   // a snapshot of an unfinished event is not an archive
