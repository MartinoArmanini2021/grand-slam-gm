// ── "Is the scoring right?" — answerable in one command, forever ────────────────────────────────
//
//   node scripts/verify-scores.mjs
//
// Recomputes EVERY entry's score from first principles — matches, rankings, the armband history —
// and compares it against the score the server actually stored. Prints a per-player breakdown so
// any number can be traced to the match that produced it.
//
// WHY THIS EXISTS. On 2026-08-19 the founder saw Cobolli credited with different points to
// different managers and reasonably assumed the scoring was broken. It was not: Cobolli scored 12
// for the manager who had him as vice-captain all tournament and 8.5 for the one who moved the
// armband in the Round of 32. Correct, and completely unexplained by anything on screen.
//
// The problem that caused was not arithmetic, it was TRUST. Nobody should have to take "the scoring
// is fine" on faith, least of all from the person who wrote the scoring. So this makes it checkable
// by anyone, in ten seconds, without reading a line of the codebase.
//
// It reads only anon-readable feeds — matches, player_stats, board_entries — so it needs no secret
// and can be run by anyone with the public key. It is READ-ONLY and writes nothing.

import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/).filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const URL_ = env.VITE_SUPABASE_URL;
const KEY = env.VITE_SUPABASE_ANON_KEY;
// Ignore flags when reading the tournament id, or `--detail` gets treated as a tournament name and
// the script cheerfully reports "0 entries · no discrepancies" — a pass that proves nothing, which
// is the single worst outcome for a verification tool.
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const TOURNAMENT = args[0] ?? 'cincinnati_2026';
const DETAIL = process.argv.includes('--detail');

const api = async (path) => {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`);
  return res.json();
};

// ── the engine, transcribed from supabase/functions/recompute-score ─────────────────────────────
// Deliberately re-implemented rather than imported: a check that shares its implementation with the
// thing it checks can only ever prove the code equals itself. This agreeing with the deployed
// scorer is evidence; the same function called twice is not.
const ROUND_ORDER = ['R128', 'R64', 'R32', 'R16', 'QF', 'SF', 'F'];
const ROUND_POINTS = { R128: 1, R64: 1, R32: 2, R16: 5, QF: 10, SF: 20, F: 40 };
const idx = r => ROUND_ORDER.indexOf(r);
const upset = (w, l) => (l == null || w <= l) ? 1 : 1 + (w - l) / ((w - l) + 30);
const winPoints = (base, w, l) => Math.round(base * upset(w, l));

const leaderOfRecord = (history, round) => {
  const ri = idx(round);
  let best;
  for (const h of history ?? []) {
    const hi = idx(h.round);
    if (hi >= 0 && hi <= ri && (best === undefined || idx(best.round) < hi)) best = h;
  }
  return best?.playerId;
};

const [matches, stats, board] = await Promise.all([
  api(`matches?tournament_id=eq.${TOURNAMENT}&select=round,slot,p1_id,p2_id,winner_id`),
  api(`player_stats?tournament_id=eq.${TOURNAMENT}&select=id,ranking`),
  api(`board_entries?tournament_id=eq.${TOURNAMENT}&select=user_id,score,state`),
]);

const rank = Object.fromEntries(stats.map(p => [p.id, p.ranking]));
const played = ROUND_ORDER.filter(r => matches.some(m => m.round === r && m.winner_id));

let failures = 0;
console.log(`\n  ${TOURNAMENT} — ${board.length} entries · ${matches.length} matches · ${played.length} rounds played\n`);

for (const e of board.sort((a, b) => b.score - a.score)) {
  const st = e.state ?? {};
  const initial = st.initialSquad ?? [];
  if (initial.length === 0) continue;   // never locked → scores 0 by design

  const who = e.user_id.slice(0, 8);
  let total = 0;
  const lines = [];

  for (const round of played) {
    const ri = idx(round);
    let squad = [...initial];
    for (const t of st.transfers ?? []) if (idx(t.round) < ri) squad = squad.map(id => (id === t.out ? t.in : id));
    const cap = leaderOfRecord(st.captainHistory, round);
    const vice = leaderOfRecord(st.viceCaptainHistory, round);
    const base = ROUND_POINTS[round] ?? 0;

    for (const id of squad) {
      const found = matches.filter(m => m.round === round && (m.p1_id === id || m.p2_id === id));
      if (found.length > 1) { console.log(`  ! ${id} appears in ${found.length} ${round} matches — corrupt draw`); failures++; }
      const m = found[0];
      if (!m || m.winner_id !== id) continue;
      const opp = m.p1_id === id ? m.p2_id : m.p1_id;
      const win = winPoints(base, rank[id] ?? 40, rank[opp]);
      const mult = id === cap ? 2 : id === vice ? 1.5 : 1;
      total += win * mult;
      lines.push(`      ${round.padEnd(4)} ${id.padEnd(20)} ${String(win).padStart(2)}` +
                 `${mult === 2 ? ' ×2 (captain)' : mult === 1.5 ? ' ×1.5 (vice)' : '           '}` +
                 ` = ${win * mult}`);
    }
  }

  const ok = Math.abs(total - e.score) < 0.001;
  if (!ok) failures++;
  console.log(`  ${ok ? '✓' : '✗'} ${who}   stored ${String(e.score).padStart(6)}   computed ${String(total).padStart(6)}` +
              `${ok ? '' : '   *** MISMATCH ***'}`);
  if (DETAIL || !ok) lines.forEach(l => console.log(l));
}

const scored = board.filter(b => (b.state?.initialSquad ?? []).length > 0).length;
if (scored === 0) { console.log(`
  NOTHING TO CHECK - no locked entries found for ${TOURNAMENT}. This is NOT a pass.
`); process.exit(2); }
console.log(failures === 0
  ? `\n  Every stored score is exactly reproducible from the results. No discrepancies.\n`
  : `\n  ${failures} DISCREPANCY(S) — investigate before trusting the leaderboard.\n`);
process.exit(failures === 0 ? 0 : 1);
