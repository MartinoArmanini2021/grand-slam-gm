// ── Do the two scoring engines agree? ────────────────────────────────────────────────────────────
//
// Runs the LIVE engine (supabase/functions/recompute-score) and the LOVABLE rebuild's engine
// (src/lib/game/engine.ts in the Lovable project) over the SAME real Cincinnati data — the actual
// matches, the actual rankings, the actual four scoring entries — and diffs the results.
//
// This exists because "does the rebuild reproduce the game?" is not a judgement call. Either the
// numbers match or they do not, and if they do not, adopting it silently re-scores four real
// managers mid-tournament.
//
//   node scripts/compare-engines.mjs
//
// Data captured from production 2026-08-18 (read-only). Both engines are transcribed faithfully
// from their sources; where the two differ, that difference is the finding.

// ── the real data, fetched LIVE ─────────────────────────────────────────────────────────────────
//
// This used to be a snapshot pasted in by hand. That made the check worthless the moment the draw
// moved on: it went on cheerfully reporting agreement about a tournament state that no longer
// existed. A parity check frozen in the past is worse than none, because it reads as reassurance.
//
// Reads the same anon-visible feeds the apps do. READ-ONLY.
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/).filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const api = async (path) => {
  const res = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}` },
  });
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`);
  return res.json();
};

// Same two rules as verify-scores.mjs: no hardcoded tournament default (an unnamed run checks
// whatever the server says is ACTIVE), and board_entries is paged past PostgREST's response cap
// so the diff never silently compares a fraction of the field.
const rpc = async (fn) => {
  const res = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  if (!res.ok) throw new Error(`rpc/${fn} → ${res.status} ${await res.text()}`);
  return res.json();
};
const paged = async (path, page = 1000) => {
  const rows = [];
  for (let from = 0; ; from += page) {
    const res = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}`,
        Range: `${from}-${from + page - 1}`,
      },
    });
    if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`);
    const batch = await res.json();
    rows.push(...batch);
    if (batch.length < page) return rows;
  }
};
const TOURNAMENT = process.argv.slice(2).find(a => !a.startsWith('--')) ?? await rpc('get_active_tournament');
if (!TOURNAMENT) throw new Error('No tournament: pass one explicitly or set app_config.active_tournament_id.');

const [matchRows, statRows, boardRows] = await Promise.all([
  api(`matches?tournament_id=eq.${TOURNAMENT}&select=round,slot,p1_id,p2_id,winner_id`),
  api(`player_stats?tournament_id=eq.${TOURNAMENT}&select=id,ranking`),
  paged(`board_entries?tournament_id=eq.${TOURNAMENT}&select=user_id,score,state&order=user_id.asc`),
]);

const MATCHES = matchRows.map(m => ({
  round: m.round, slot: m.slot, p1: m.p1_id, p2: m.p2_id, winner: m.winner_id,
}));

const RANKS = Object.fromEntries(statRows.map(p => [p.id, p.ranking]));

// Only entries that actually locked a squad — an unlocked one scores 0 by design in both engines,
// so including it would pad the "agreement" count with rows that cannot disagree.
const ENTRIES = boardRows
  .filter(e => (e.state?.initialSquad ?? []).length > 0)
  .sort((a, b) => b.score - a.score)
  .map(e => ({
    who: e.user_id.slice(0, 8),
    stored: e.score,
    initialSquad: e.state.initialSquad ?? [],
    transfers: e.state.transfers ?? [],
    captainHistory: e.state.captainHistory ?? [],
    viceCaptainHistory: e.state.viceCaptainHistory ?? [],
  }));

if (ENTRIES.length === 0) {
  console.log(`\n  NOTHING TO COMPARE — no locked entries for ${TOURNAMENT}. This is NOT a pass.\n`);
  process.exit(2);
}

// ── ENGINE A — live, transcribed from supabase/functions/recompute-score/index.ts ────────────────
const A_ORDER = ['R128','R64','R32','R16','QF','SF','F'];
// Job 13: engine A (the deployed scorer) selects its curve per tournament. Engine B (the Lovable
// client) stays on the legacy curve until its cutover deploy — update B when that ships.
const A_LEGACY  = { R128:1, R96:0, R64:1, R32:2, R16:5, QF:10, SF:20, F:40 };
const A_FORMAT2 = { R128:1, R96:0, R64:2, R32:3, R16:5, QF:8, SF:13, F:20 };
const A_POINTS = ['montreal_2026', 'cincinnati_2026'].includes(TOURNAMENT) ? A_LEGACY : A_FORMAT2;
const A_upset = (w, l) => (l == null || w <= l) ? 1 : 1 + (w - l) / ((w - l) + 30);
// THE KEY LINE: base x upset is rounded to a WHOLE NUMBER first; the captain/vice multiplier is
// applied afterwards. That ordering is what makes half-points exist (vice x1.5 of an odd number).
const A_winPoints = (base, w, l) => Math.round(base * A_upset(w, l));
const A_idx = r => A_ORDER.indexOf(r);

function A_leaderOfRecord(history, round) {
  const ri = A_idx(round);
  let best;
  for (const h of history ?? []) {
    const hi = A_idx(h.round);
    if (hi >= 0 && hi <= ri && (best === undefined || A_idx(best.round) < hi)) best = h;
  }
  return best?.playerId;
}

function engineA(entry, matches, ranks) {
  const played = A_ORDER.filter(r => matches.some(m => m.round === r && m.winner));
  const rank = id => ranks[id] ?? 40;
  let total = 0;
  const byRound = {};
  for (const round of played) {
    const ri = A_idx(round);
    let squad = [...entry.initialSquad];
    for (const t of entry.transfers ?? []) if (A_idx(t.round) < ri) squad = squad.map(id => (id === t.out ? t.in : id));
    const captain = A_leaderOfRecord(entry.captainHistory, round);
    const vice = A_leaderOfRecord(entry.viceCaptainHistory, round);
    const base = A_POINTS[round] ?? 0;
    const rm = matches.filter(m => m.round === round);
    let sub = 0;
    for (const id of squad) {
      const m = rm.find(x => x.p1 === id || x.p2 === id);
      if (!m || m.winner !== id) continue;
      const opp = m.p1 === id ? m.p2 : m.p1;
      const pts = A_winPoints(base, rank(id), ranks[opp]);
      sub += id === captain ? pts * 2 : id === vice ? pts * 1.5 : pts;
    }
    byRound[round] = sub; total += sub;
  }
  return { total, byRound };
}

// ── ENGINE B — the Lovable rebuild, transcribed from its src/lib/game/engine.ts ──────────────────
const B_ORDER = ['R128','R96','R64','R32','R16','QF','SF','F'];
// Job 13, client half (shipped 2026-08-26): the Lovable engine now selects its curve PER
// TOURNAMENT exactly as the deployed scorer does — curveFor(tid), legacy events pinned forever.
// So engine B reads the same map engine A does. If these two ever diverge again, that divergence
// IS the finding this script exists to surface — do not paper over it by sharing one constant.
const B_LEGACY  = { R128:1, R96:0, R64:1, R32:2, R16:5, QF:10, SF:20, F:40 };
const B_FORMAT2 = { R128:1, R96:0, R64:2, R32:3, R16:5, QF:8, SF:13, F:20 };
const B_POINTS = ['montreal_2026', 'cincinnati_2026'].includes(TOURNAMENT) ? B_LEGACY : B_FORMAT2;
const B_idx = r => { const i = B_ORDER.indexOf(r); return i <= 1 ? 0 : i - 1; };
const B_round2 = n => Math.round(n * 100) / 100;
const B_upset = (w, l) => { if (!w || !l) return 1; const gap = w - l; return gap <= 0 ? 1 : 1 + gap / (gap + 30); };

function B_squadForRound(e, round) {
  const squad = [...e.initial_squad];
  const target = B_idx(round);
  for (const t of e.transfers) {
    if (B_idx(t.effective_round) > target) continue;
    const i = squad.indexOf(t.out_player);
    if (i >= 0) squad[i] = t.in_player;
  }
  return squad;
}
function B_captainForRound(e, round) {
  // CORRECTED 2026-08-18: captain and vice resolve INDEPENDENTLY, each tracking the latest pick
  // that actually specifies that field, so changing only the vice no longer drops the captain.
  const target = B_idx(round);
  let captain = null, vice = null, cr = -1, vr = -1;
  for (const p of e.captain_picks) {
    if (B_idx(p.round) > target) continue;
    const r = B_idx(p.round);
    if (p.captain && r >= cr) { captain = p.captain; cr = r; }
    if (p.vice && r >= vr) { vice = p.vice; vr = r; }
  }
  return { captain, vice };
}
function engineB(e, matches, ranks) {
  let total = 0; const byRound = {};
  for (const round of B_ORDER) {
    const inRound = matches.filter(m => m.round === round && m.winner);
    if (inRound.length === 0) continue;
    const base = B_POINTS[round];
    const squad = B_squadForRound(e, round);
    const { captain, vice } = B_captainForRound(e, round);
    let points = 0;
    for (const m of inRound) {
      const winner = m.winner;
      if (!squad.includes(winner)) continue;
      const loser = m.p1 === winner ? m.p2 : m.p1;
      const upset = B_upset(ranks[winner], loser ? ranks[loser] : null);
      const role = winner === captain ? 'captain' : winner === vice ? 'vice' : null;
      const roleMult = role === 'captain' ? 2 : role === 'vice' ? 1.5 : 1;
      // CORRECTED 2026-08-18: round base x upset to a whole number FIRST, then apply the role.
      const win = Math.round(base * upset);
      points += win * roleMult;
    }
    points = B_round2(points);
    byRound[round] = points; total = B_round2(total + points);
  }
  return { total, byRound };
}

// Faithful translation of a live entry into the Lovable shape.
function toB(entry) {
  return {
    initial_squad: entry.initialSquad,
    // Engine A applies a transfer from the round AFTER the one it is logged against
    // (`A_idx(t.round) < ri`); engine B applies it AT its effective_round. Same rule, shifted name.
    transfers: (entry.transfers ?? []).map(t => ({
      effective_round: A_ORDER[A_idx(t.round) + 1] ?? t.round,
      out_player: t.out, in_player: t.in,
    })),
    // A keeps captain and vice as INDEPENDENT histories; B stores them as one pick per round.
    // Merged here per round so the comparison isolates the arithmetic rather than this difference.
    captain_picks: [...new Set([...(entry.captainHistory ?? []), ...(entry.viceCaptainHistory ?? [])].map(h => h.round))]
      .map(round => ({
        round,
        captain: A_leaderOfRecord(entry.captainHistory, round) ?? null,
        vice: A_leaderOfRecord(entry.viceCaptainHistory, round) ?? null,
      })),
  };
}

// ── run ──────────────────────────────────────────────────────────────────────────────────────────
console.log('\n  Cincinnati 2026 — the SAME matches, ranks and entries through both engines\n');
console.log('  manager     stored   live engine   Lovable engine   difference');
console.log('  ' + '-'.repeat(64));
let mismatches = 0;
for (const e of ENTRIES) {
  const a = engineA(e, MATCHES, RANKS);
  const b = engineB(toB(e), MATCHES, RANKS);
  const diff = B_round2(b.total - a.total);
  if (Math.abs(diff) > 0.001) mismatches++;
  console.log(
    '  ' + e.who.padEnd(11) +
    String(e.stored).padStart(5) +
    String(a.total).padStart(13) +
    String(b.total).padStart(17) +
    (diff === 0 ? '            —' : ('  ' + (diff > 0 ? '+' : '') + diff).padStart(13)),
  );
}
console.log('  ' + '-'.repeat(64));
console.log(`\n  ${mismatches} of ${ENTRIES.length} managers would be scored differently.\n`);

// Per-round detail for the first mismatch, so the cause is visible rather than asserted.
for (const e of ENTRIES) {
  const a = engineA(e, MATCHES, RANKS), b = engineB(toB(e), MATCHES, RANKS);
  if (Math.abs(b.total - a.total) < 0.001) continue;
  console.log(`  Where ${e.who} diverges:`);
  for (const r of ['R64','R32']) {
    console.log(`    ${r}:  live ${a.byRound[r] ?? 0}   Lovable ${b.byRound[r] ?? 0}`);
  }
  break;
}
console.log('');
