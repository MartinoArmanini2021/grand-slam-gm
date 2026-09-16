// ── Invariant audit over every stored entry state ────────────────────────────────────────────────
//
//   node scripts/audit-entry-states.mjs [tournament_id ...]      (default: the ACTIVE event)
//
// verify-scores proves the TOTALS reconcile. That is necessary and not sufficient: a state can
// reconcile today and still be malformed in ways that bite later, or that the client and the server
// would read DIFFERENTLY. This checks the shape of the data itself, from first principles.
//
// Each check below exists because the code could actually produce it, not because it is tidy:
//
//  1. DUPLICATE round records. The client resolves an armband by taking the LAST matching record
//     (`r >= captainRound`); the deployed server takes the FIRST (`indexOf(best.round) < hi`). Those
//     agree only while at most one record exists per round. A duplicate would score differently on
//     the leaderboard than the app displays — the exact class of bug that started this whole project.
//  2. UNKNOWN rounds. The server drops any history record whose round is not in its ROUND_ORDER
//     (the `hi >= 0` filter) — silently. A stray "R96" stamp means an armband the manager set and
//     the app honours, that the leaderboard never pays.
//  3. CAPTAIN === VICE in the same round: one player cannot wear both; armbandState now refuses it.
//  4. MALFORMED transfers: an empty `in`/`out`, or a round the server cannot order.
//  5. SELF-TRANSFER (out === in) — a no-op that still consumes a transfer.
//  6. TRANSFER OF A PLAYER NOT IN THE SQUAD at that round — the swap silently does nothing.
//  7. initialSquad size/duplicates — the frozen snapshot is what scores; a dupe double-counts.
// READ-ONLY.

import { paged, activeTournament } from './lib/supabase.mjs';

// The server's order, verbatim. Anything outside it is invisible to the scorer.
const ROUND_ORDER = ['R128', 'R64', 'R32', 'R16', 'QF', 'SF', 'F'];
const idx = (r) => ROUND_ORDER.indexOf(r);
const SQUAD_SIZE = 10;

const ids = process.argv.slice(2).filter(a => !a.startsWith('--'));
// No hardcoded default: an unnamed run audits whatever the server says is ACTIVE, like every other
// checker. A default pinned to finished events would audit history and report the live one clean.
const TOURNAMENTS = ids.length ? ids : [await activeTournament([])];

let problems = 0;
const flag = (who, msg) => { problems++; console.log(`  ✗ ${who}  ${msg}`); };

for (const tid of TOURNAMENTS) {
  // paged: board_entries grows with the player base and PostgREST caps one response at ~1000 rows.
  const board = await paged(`board_entries?tournament_id=eq.${tid}&select=user_id,score,state&order=user_id.asc`);
  console.log(`\n  ${tid} — ${board.length} entries`);

  for (const e of board) {
    const who = e.user_id.slice(0, 8);
    const st = e.state ?? {};
    const initial = st.initialSquad ?? [];
    if (initial.length === 0) continue;             // never locked — nothing to audit

    // 7 — the frozen snapshot
    if (initial.length !== SQUAD_SIZE) flag(who, `initialSquad has ${initial.length} players, expected ${SQUAD_SIZE}`);
    const dupSquad = initial.filter((id, i) => initial.indexOf(id) !== i);
    if (dupSquad.length) flag(who, `initialSquad repeats ${[...new Set(dupSquad)].join(', ')} — that player scores twice`);

    // 1 & 2 — armband histories
    for (const [label, hist] of [['captain', st.captainHistory], ['vice', st.viceCaptainHistory]]) {
      const rows = hist ?? [];
      const rounds = rows.map(h => h.round);
      const dupes = [...new Set(rounds.filter((r, i) => rounds.indexOf(r) !== i))];
      if (dupes.length) {
        flag(who, `${label}History has TWO records for ${dupes.join(', ')} — client reads the last, the server reads the first`);
      }
      for (const h of rows) {
        if (idx(h.round) < 0) {
          flag(who, `${label}History stamps round "${h.round}", which the server does not know — that armband is never paid`);
        }
      }
    }

    // 3 — one player, two armbands
    const roundsSeen = [...new Set([
      ...(st.captainHistory ?? []).map(h => h.round),
      ...(st.viceCaptainHistory ?? []).map(h => h.round),
    ])];
    const recAt = (hist, round) => {
      let best;
      for (const h of hist ?? []) {
        const hi = idx(h.round);
        if (hi >= 0 && hi <= idx(round) && (best === undefined || idx(best.round) <= hi)) best = h;
      }
      return best?.playerId ?? null;
    };
    for (const r of roundsSeen) {
      const c = recAt(st.captainHistory, r), v = recAt(st.viceCaptainHistory, r);
      if (c && v && c === v) flag(who, `${c} is BOTH captain and vice in ${r}`);
    }

    // 4, 5, 6 — transfers
    for (const [i, t] of (st.transfers ?? []).entries()) {
      if (!t.in) flag(who, `transfer #${i + 1} has an empty "in" — that squad slot scores nothing forever`);
      if (!t.out) flag(who, `transfer #${i + 1} has an empty "out"`);
      if (t.in && t.out && t.in === t.out) flag(who, `transfer #${i + 1} swaps ${t.in} for himself`);
      if (idx(t.round) < 0) flag(who, `transfer #${i + 1} is stamped round "${t.round}", unknown to the server`);
      // the squad as it stood when the swap took effect
      let squad = [...initial];
      for (const p of st.transfers ?? []) {
        if (p === t) break;
        const j = squad.indexOf(p.out);
        if (j >= 0) squad[j] = p.in;
      }
      if (t.out && !squad.includes(t.out)) {
        flag(who, `transfer #${i + 1} sells ${t.out}, who was not in the squad at that point — the swap does nothing`);
      }
    }
  }
}

console.log(problems === 0
  ? `\n  Every stored state is well-formed. No client/server divergence is possible from the data.\n`
  : `\n  ${problems} PROBLEM(S) found — see above.\n`);
// Set the code and let the loop drain: process.exit() here races the closing fetch handle on Windows
// and aborts with a libuv assertion, masking the code (the same lesson reconcile-field learned).
process.exitCode = problems === 0 ? 0 : 1;
