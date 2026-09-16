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

import { writeFileSync, mkdirSync } from 'node:fs';
import { api, paged, activeTournament } from './lib/supabase.mjs';

const TOURNAMENT = await activeTournament();

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
