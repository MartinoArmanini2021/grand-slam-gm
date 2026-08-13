// ── Build the Cincinnati 2026 men's-singles field from the published draw ─────────────────────────
// Fetches the real Wikipedia draw (the SAME source the live feed polls), resolves every main-draw
// player through the SAME parser the app uses, matches them to the 300-player stats pool (atp300.json),
// and emits src/data/cincinnati2026Field.json in the montreal2026Field.json schema.
//
//   node scripts/build-cincinnati-field.mjs           # writes the field + prints a report
//   node scripts/build-cincinnati-field.mjs --dry     # report only, no write
//
// Then ALWAYS validate against the live draw:
//   node scripts/reconcile-field.mjs "2026 Cincinnati Open – Men's singles" src/data/cincinnati2026Field.json

import { readFileSync, writeFileSync } from 'node:fs';
import { buildResolver, splitBrackets, teamTarget } from '../src/data/drawParser.ts';

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[-\s]+/g, ' ').trim();

const PAGE = "2026 Cincinnati Open – Men's singles";
const OUT = new URL('../src/data/cincinnati2026Field.json', import.meta.url);
const DRY = process.argv.includes('--dry');

// Real main-draw entrants who are NOT in the top-300 stats pool (wildcards this week). Bio is
// real; 2026 form is left neutral (ytd 0/0/0, surface 50) since we have no verified match data —
// their rank (>300) floors the price + puts them in the bottom tier regardless, so a big upset
// win still scores a big multiplier. Names MUST match the Wikipedia link target exactly.
const MANUAL = [
  { id: 'monfils',    name: 'Gaël Monfils',       country: 'France',    flag: '🇫🇷', age: 39, hand: 'R', ranking: 327, seed: null,
    surface: { hard: 50, clay: 50, grass: 50 }, ytd: { wins: 0, losses: 0, titles: 0 }, yearResults: [] },
  { id: 'kokkinakis', name: 'Thanasi Kokkinakis', country: 'Australia', flag: '🇦🇺', age: 30, hand: 'R', ranking: 443, seed: null,
    surface: { hard: 50, clay: 50, grass: 50 }, ytd: { wins: 0, losses: 0, titles: 0 }, yearResults: [] },
];

const pool = JSON.parse(readFileSync(new URL('../src/data/atp300.json', import.meta.url), 'utf8'));
const resolve = buildResolver(pool); // pool has { id, name } → resolves a raw wiki cell to a pool id
const poolById = new Map(pool.map((p) => [p.id, p]));

// Fetch the draw wikitext via the CORS-open MediaWiki API (identical to reconcile-field.mjs).
const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(PAGE)}`
  + `&prop=wikitext&formatversion=2&format=json&origin=*`;
const json = await (await fetch(url)).json();
const wikitext = json?.parse?.wikitext;
if (typeof wikitext !== 'string') {
  console.error(`could not load draw page "${PAGE}": ${json?.error?.info ?? 'not found'}`);
  process.exitCode = 2;
} else {
  // ── 1) Seeds: map pool id → seed number from the ==Seeds== list ──────────────────────────────
  // Lines look like:  {{seeds|1|1}} '''{{flagicon|GER}} [[Alexander Zverev]]'''
  const seedById = new Map();
  const seedsStart = wikitext.search(/==\s*Seeds\s*==/i);
  const seedsBlock = seedsStart >= 0 ? wikitext.slice(seedsStart, seedsStart + 3000) : '';
  for (const m of seedsBlock.matchAll(/\{\{seeds\|(\d+)\|[^}]*\}\}\s*'''?\s*(\{\{flagicon\|[^}]*\}\}\s*\[\[[^\]]+\]\])/g)) {
    const seed = Number(m[1]);
    const id = resolve(m[2]);
    if (id && !id.startsWith('x_') && id !== 'tbd') seedById.set(id, seed);
  }

  // ── 2) Every named main-draw player: collect from the 16-team section brackets ────────────────
  // (the 8TeamBracket finals is empty pre-play; the 4TeamBrackets are qualifying — both ignored,
  //  exactly as the app's parseFullDraw does.)
  const sections = splitBrackets(wikitext).filter((b) => /^16TeamBracket/i.test(b.type));
  const found = new Map(); // pool id → raw cell (first seen)
  const unmatched = new Set();
  for (const b of sections) {
    for (const m of b.text.matchAll(/\|\s*RD\d+-team\d+\s*=\s*(.*?)(?=\s*\|\s*RD|\n\s*\||\n\}\}|$)/gm)) {
      const raw = m[1];
      if (!raw || !/\[\[/.test(raw)) continue;         // empty cell / bye / unfilled qualifier slot
      const id = resolve(raw);
      if (id === 'tbd') continue;
      if (id.startsWith('x_')) { unmatched.add(norm(teamTarget(raw))); continue; }
      if (!found.has(id)) found.set(id, raw);
    }
  }

  // ── 3) Emit a field entry per pool-matched player ─────────────────────────────────────────────
  const poolField = [...found.keys()].map((id) => {
    const p = poolById.get(id);
    const surface = p.surface ?? { hard: 50, clay: 50, grass: 50 };
    return {
      id: p.id,
      name: p.name,
      country: p.country,
      flag: p.flag,
      age: p.age ?? null,
      hand: p.hand ?? 'R',
      ranking: p.rank,
      seed: seedById.get(id) ?? null,
      surface: { hard: surface.hard ?? 50, clay: surface.clay ?? 50, grass: surface.grass ?? 50 },
      ytd: p.ytd ?? { wins: 0, losses: 0, titles: 0 },
      yearResults: (p.results2026 ?? []).map((r) => ({ short: r.short, result: r.result })),
    };
  });

  // Add the hand-entered wildcards ONLY if they're actually in this draw (keeps the field faithful:
  // a withdrawal drops them automatically instead of shipping a phantom).
  const manualIn = MANUAL.filter((p) => unmatched.has(norm(p.name)));
  const field = [...poolField, ...manualIn].sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999) || a.ranking - b.ranking);
  const stillMissing = [...unmatched].filter((n) => !MANUAL.some((p) => norm(p.name) === n));

  // ── Report ────────────────────────────────────────────────────────────────────────────────────
  const seededOut = field.filter((p) => p.seed != null).length;
  console.log(`\n  draw page:        ${PAGE}`);
  console.log(`  seeds parsed:     ${seedById.size} / 32`);
  console.log(`  draftable field:  ${field.length}  (${seededOut} seeded, ${manualIn.length} hand-entered wildcards)`);
  console.log(`  still NOT covered: ${stillMissing.length}  (qualifiers / lucky losers not in pool or MANUAL)`);
  if (stillMissing.length) {
    console.log('\n  players in the draw but NOT draftable (add to MANUAL[] if they should be):');
    for (const n of stillMissing.sort()) console.log(`      · ${n}`);
  }
  if (seedById.size !== 32) console.log(`\n  ⚠ expected 32 seeds, parsed ${seedById.size} — check the seeds regex.`);

  if (DRY) {
    console.log('\n  --dry: not writing.\n');
  } else {
    writeFileSync(OUT, JSON.stringify(field, null, 2) + '\n');
    console.log(`\n  ✓ wrote ${field.length} players → src/data/cincinnati2026Field.json`);
    console.log(`  → next: node scripts/reconcile-field.mjs "${PAGE}" src/data/cincinnati2026Field.json\n`);
  }
}
