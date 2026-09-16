// ── Build a tournament's draftable field from its published draw ─────────────────────────────────
// Fetches the real Wikipedia draw (the SAME source the live feed polls), resolves every main-draw
// player through the SAME parser the app uses, matches them to the 300-player stats pool, and writes
// the event's field JSON. Any real entrant outside the pool must be listed in EVENTS[id].manual.
//
//   node scripts/build-field.mjs cincinnati_2026          # write the field
//   node scripts/build-field.mjs usopen_2026 --dry        # report only
//
// ALWAYS follow with the reconcile guard, which is what actually proves the field is right:
//   node scripts/reconcile-field.mjs "<page>" <field.json>
//
// Re-run it LATE. Qualifying finishing (or a withdrawal) changes the field — at Cincinnati the draw
// gained 13 players between the first build and cutover, all of whom would have been undraftable.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { buildResolver, splitBrackets, teamTarget, stripDisambig } from '../src/data/drawParser.ts';
import { getEvent, expandManual } from './lib/events.mjs';
import { tierOf, fetchDraw, norm } from './lib/pricing.mjs';

const [id, ...flags] = process.argv.slice(2);
if (!id) { console.error('usage: node scripts/build-field.mjs <event-id> [--dry] [--page="<wiki title>"]'); process.exit(2); }
const ev = getEvent(id);

// --page rehearses the builder against a DIFFERENT draw than the event's own — the point being to
// run the whole pipeline against a season whose answer is already known (last year's completed
// Slam) before trusting it on a draw published minutes ago.
//
// It FORCES --dry. A field built from the wrong year would look perfectly well-formed and quietly
// replace the real one, and nothing downstream would catch it: reconcile-field would be comparing
// that same wrong page against itself.
const pageFlag = flags.find(f => f.startsWith('--page='));
const page = pageFlag ? pageFlag.slice('--page='.length).replace(/^["']|["']$/g, '') : ev.page;
const DRY = flags.includes('--dry') || !!pageFlag;
if (pageFlag && !flags.includes('--dry')) {
  console.log(`\n  --page given → forcing --dry (never write ${ev.field} from a draw that isn't ${ev.page})`);
}

const root = new URL('../', import.meta.url);
const pool = JSON.parse(readFileSync(new URL('src/data/atp300.json', root), 'utf8'));
const resolve = buildResolver(pool);            // pool rows are { id, name, … } → resolves a wiki cell
const poolById = new Map(pool.map(p => [p.id, p]));

const wikitext = await fetchDraw(page);

// ── 1) Seeds: pool id → seed number, from the ==Seeds== list ─────────────────────────────────────
//     A seed line is bold while the player is ALIVE and loses its bold once he goes out:
//         alive:  {{seeds|1|1}} '''{{flagicon|GER}} [[Alexander Zverev]]'''
//         out:    {{seeds|1|1}} {{flagicon|ITA}} [[Jannik Sinner]] ''(final)''
//     So the apostrophes must be OPTIONAL (`'*`). Requiring them read 32 seeds off a freshly
//     published draw and exactly ONE off a finished one — and this script is meant to be re-run
//     late, when most seeds are out. Caught rehearsing against the 2025 draw, 2026-08-27.
const seedById = new Map();
const seedsStart = wikitext.search(/==\s*Seeds\s*==/i);
const seedsBlock = seedsStart >= 0 ? wikitext.slice(seedsStart, seedsStart + 4000) : '';
for (const m of seedsBlock.matchAll(/\{\{seeds\|(\d+)\|[^}]*\}\}\s*'*\s*(\{\{flagicon\|[^}]*\}\}\s*\[\[[^\]]+\]\])/g)) {
  const pid = resolve(m[2]);
  if (pid && !pid.startsWith('x_') && pid !== 'tbd') seedById.set(pid, Number(m[1]));
}

// ── 2) Every named main-draw player, from the section brackets ───────────────────────────────────
//     Main draw = the 16-team section brackets + the 8-team finals — exactly what the app's
//     parseFullDraw consumes. Everything else (2- and 4-team brackets) is QUALIFYING.
const sections = splitBrackets(wikitext).filter(b => /^(8|16)TeamBracket/i.test(b.type));
const found = new Map();          // pool id → first raw cell seen
const unmatched = new Set();      // normalised names the pool doesn't carry
for (const b of sections) {
  for (const m of b.text.matchAll(/\|\s*RD\d+-team\d+\s*=\s*(.*?)(?=\s*\|\s*RD|\n\s*\||\n\}\}|$)/gm)) {
    const raw = m[1];
    if (!raw || !/\[\[/.test(raw)) continue;    // empty cell / bye / unfilled qualifier slot
    const pid = resolve(raw);
    if (pid === 'tbd') continue;
    if (pid.startsWith('x_')) { unmatched.add(norm(stripDisambig(teamTarget(raw)))); continue; }  // strip "(tennis)" or a manual entry can never match
    if (!found.has(pid)) found.set(pid, raw);
  }
}

// ── 3) Emit ──────────────────────────────────────────────────────────────────────────────────────
const fromPool = [...found.keys()].map(pid => {
  const p = poolById.get(pid);
  // NEVER substitute a number for missing form. A 50 here is indistinguishable from a real 50%,
  // and 0-0 reads as "played, lost none" rather than "unknown". Kokkinakis actually went 2-2 in
  // 2026 and the app showed him as having played no tennis at all. null means UNKNOWN.
  const surface = p.surface ?? null;
  return {
    id: p.id, name: p.name, country: p.country, flag: p.flag,
    age: p.age ?? null, hand: p.hand ?? 'R',
    // The ATP player code is what fetches the official headshot. Without it every player
    // renders as initials — the pool calls it `atpId`, the app's Player shape `atp_id`.
    atpId: p.atpId ?? null,
    photoUrl: p.photoUrl ?? null,
    ranking: p.rank, seed: seedById.get(pid) ?? null,
    surface: surface ? { hard: surface.hard ?? null, clay: surface.clay ?? null, grass: surface.grass ?? null } : null,
    ytd: p.ytd ?? null,
    yearResults: (p.results2026 ?? []).map(r => ({ short: r.short, result: r.result })),
  };
});
// Hand-entered entrants count ONLY if they're really in this draw (a withdrawal drops them).
// Hand-entered entrants get their REAL 2026 form from extra2026.json when the stats run found
// any; otherwise their form stays null (unknown), never a fabricated zero.
const extraPath = 'src/data/extra2026.json';
const extraById = new Map(
  (existsSync(extraPath) ? JSON.parse(readFileSync(extraPath, 'utf8')) : []).map(e => [e.id, e]),
);
const manualIn = (ev.manual ?? []).filter(m => unmatched.has(norm(m.name))).map(m => {
  const base = expandManual(m);
  const x = extraById.get(m.id);
  if (!x) return base;
  return { ...base, surface: x.surface ?? null, ytd: x.ytd ?? null,
    yearResults: (x.results2026 ?? []).map(r => ({ short: r.short, result: r.result })) };
});
const field = [...fromPool, ...manualIn].sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999) || a.ranking - b.ranking);
const stillMissing = [...unmatched].filter(n => !(ev.manual ?? []).some(m => norm(m.name) === n));

console.log(`\n  event:            ${id} — ${ev.label}`);
console.log(`  draw page:        ${page}${pageFlag ? "   ← REHEARSAL, not this event's own page" : ""}`);
console.log(`  seeds parsed:     ${seedById.size}`);
console.log(`  draftable field:  ${field.length}  (${field.filter(p => p.seed != null).length} seeded, ${manualIn.length} hand-entered)`);
console.log(`  NOT covered:      ${stillMissing.length}  (in the draw, in neither the pool nor EVENTS.manual)`);
if (stillMissing.length) {
  console.log('\n  add these to EVENTS.' + id + '.manual if they should be draftable:');
  for (const n of stillMissing.sort()) console.log(`      · ${n}`);
}

if (DRY) {
  console.log('\n  --dry: not writing.\n');
} else {
  writeFileSync(new URL(ev.field, root), JSON.stringify(field, null, 2) + '\n');
  console.log(`\n  ✓ wrote ${field.length} players → ${ev.field}`);
  console.log(`  → next: node scripts/reconcile-field.mjs "${ev.page}" ${ev.field}`);
  console.log(`  → then: node scripts/gen-seed.mjs ${id}\n`);
}
