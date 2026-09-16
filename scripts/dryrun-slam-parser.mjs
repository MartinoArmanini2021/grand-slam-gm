// ── Job 22: can our draw reader actually read a GRAND SLAM page? ─────────────────────────────────
//
//   node scripts/dryrun-slam-parser.mjs ["2025 US Open – Men's singles"]
//
// ingest-draw has only ever parsed 96-player MASTERS draws. A Slam differs in ways that could
// silently produce a wrong draw on the biggest weekend of the year:
//   · 128 players, no byes — the opening round IS R128 and IS scored (Masters drop it)
//   · 64 first-round matches per… no: 8 sections x 8 = 64, so every section carries 8 R128 pairings
//   · the finals bracket still holds QF/SF/F
// The parser was WRITTEN anticipating this ("Both a 96-draw Masters and a 128-draw Slam publish
// exactly 8" sections) but has never been run against a real Slam page. Assumption, not evidence.
//
// So: fetch a real, COMPLETED Slam draw and assert the shape and the champion. Read-only, touches
// no database. If this passes, draw day holds no parser surprises; if it fails, we find out with
// days to spare instead of minutes.

// The parser is TypeScript; Node 22.18+ strips type annotations natively, so it imports like any
// other module — no ts-node, no loader registration, no build step (build-field.mjs does the same).
import { buildResolver, parseFullDraw } from '../src/data/drawParser.ts';
import { fetchDraw } from './lib/wiki.mjs';

const PAGE = process.argv.slice(2).find(a => !a.startsWith('--')) ?? "2025 US Open – Men's singles";

const wikitext = await fetchDraw(PAGE);

console.log(`\n  page: ${PAGE}`);
console.log(`  wikitext: ${wikitext.length.toLocaleString()} chars`);

// Shape probe FIRST, without the parser: how many section brackets does a Slam publish?
const templates = [...wikitext.matchAll(/\{\{\s*([0-9]+TeamBracket[^\s|}]*)/gi)].map(m => m[1]);
const counts = templates.reduce((acc, t) => ((acc[t] = (acc[t] ?? 0) + 1), acc), {});
console.log('  bracket templates:', JSON.stringify(counts));

// The roster: a Slam draw names 128 players we have no field file for yet, so resolve names to
// themselves (slugified). This tests the DRAW SHAPE, which is what could break — name matching
// against a real field is exercised separately by the existing parser tests.
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 40);

const SLAM_ROUNDS = ['R128', 'R64', 'R32', 'R16', 'QF', 'SF', 'F'];
const { draw, results, meta } = parseFullDraw(wikitext, {
  scoredRounds: SLAM_ROUNDS,
  resolve: (raw) => slug(raw) || 'unknown',
  includeIncomplete: true,
});

const EXPECTED = { R128: 64, R64: 32, R32: 16, R16: 8, QF: 4, SF: 2, F: 1 };
const byRound = {};
for (const m of draw) byRound[m.round] = (byRound[m.round] ?? 0) + 1;

console.log('\n  round      parsed   expected');
console.log('  ' + '-'.repeat(32));
let ok = true;
for (const r of SLAM_ROUNDS) {
  const got = byRound[r] ?? 0;
  const want = EXPECTED[r];
  const good = got === want;
  if (!good) ok = false;
  console.log(`  ${r.padEnd(8)} ${String(got).padStart(6)}   ${String(want).padStart(8)}  ${good ? 'ok' : '  <-- MISMATCH'}`);
}

// Slots must be unique within a round, or results overwrite each other.
for (const r of SLAM_ROUNDS) {
  const slots = draw.filter(m => m.round === r).map(m => m.slot);
  const dupes = slots.filter((s, i) => slots.indexOf(s) !== i);
  if (dupes.length) { ok = false; console.log(`  ! ${r}: duplicate slots ${[...new Set(dupes)].join(', ')}`); }
  const expectedSlots = [...Array(EXPECTED[r]).keys()];
  const missing = expectedSlots.filter(s => !slots.includes(s));
  if (missing.length) { ok = false; console.log(`  ! ${r}: missing slots ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}`); }
}

// Result keys are `${round}_${slot}` (see liveResults.matchKey). `meta` deliberately holds ONLY
// players the resolver could not match ("x_" ids), so with the slug resolver below it is empty —
// that is the parser working, not failing.
const finalMatch = draw.find(m => m.round === 'F');
const champId = finalMatch ? results[`F_${finalMatch.slot}`] : null;
const champName = champId ? (meta[champId]?.name ?? champId) : null;
console.log(`\n  champion parsed: ${champName ?? 'NONE'}`);
if (finalMatch) console.log(`  final:           ${finalMatch.p1Id} vs ${finalMatch.p2Id}`);
const decided = Object.keys(results).length;
console.log(`  decided matches: ${decided} of ${draw.length}`);
console.log(`  unmatched names: ${Object.keys(meta).length} (0 expected with the slug resolver)`);
// Spot-check a first-round match and a semi-final, so the report shows real pairings.
for (const r of ['R128', 'SF']) {
  const s = draw.find(m => m.round === r);
  if (s) console.log(`  sample ${r.padEnd(4)}:    ${s.p1Id} vs ${s.p2Id} -> ${results[`${r}_${s.slot}`] ?? 'undecided'}`);
}

if (!champName) ok = false;

// ── The real draw-day risk: NAME RESOLUTION ─────────────────────────────────────────────────────
// A Slam publishes its sections with the COMPACT template, which renders abbreviated display names
// ("J. Sinner") while the finals bracket spells them out ("Jannik Sinner"). Our roster holds full
// names, so if the resolver keyed off the DISPLAY text a player would resolve in the final and not
// in the first round — the same man appearing as two people, which is how a draw silently corrupts.
// Re-parse with the PRODUCTION resolver over a small roster of known 2025 entrants and check they
// are found in BOTH the compact sections and the finals bracket.
const probeRoster = [
  { id: 'sinner', name: 'Jannik Sinner' },
  { id: 'alcaraz', name: 'Carlos Alcaraz' },
  { id: 'augeraliassime', name: 'Félix Auger-Aliassime' },
  { id: 'djokovic', name: 'Novak Djokovic' },
  { id: 'kopriva', name: 'Vít Kopřiva' },
];
const probe = parseFullDraw(wikitext, {
  scoredRounds: SLAM_ROUNDS,
  resolve: buildResolver(probeRoster),
  includeIncomplete: true,
});
console.log('\n  name resolution with the production resolver:');
let namesOk = true;
for (const p of probeRoster) {
  const rounds = [...new Set(probe.draw.filter(m => m.p1Id === p.id || m.p2Id === p.id).map(m => m.round))];
  const inCompact = rounds.some(r => ['R128', 'R64', 'R32', 'R16'].includes(r));
  const reachedFinals = ['QF', 'SF', 'F'].some(r => rounds.includes(r));
  // Everyone in the roster must at least appear in their opening (compact) match.
  if (!inCompact) { namesOk = false; ok = false; }
  console.log(`    ${p.name.padEnd(24)} ${inCompact ? 'compact ok' : 'NOT FOUND in sections'}`
    + `${reachedFinals ? ' · reached the finals bracket' : ''}  [${rounds.join(' ') || '—'}]`);
}
const unresolved = Object.keys(probe.meta).length;
console.log(`    ${String(unresolved).padStart(3)} players outside this probe roster fell back to x_ ids (expected: the other 123)`);
if (!namesOk) console.log('    ^ a name that resolves in one bracket but not the other splits one player in two.');

console.log(ok
  ? '\n  PASS — the Slam draw parses to the expected 128 shape with a champion.\n'
  : '\n  FAIL — see the mismatches above. Do NOT point ingest-draw at a Slam until this passes.\n');
process.exit(ok ? 0 : 1);
