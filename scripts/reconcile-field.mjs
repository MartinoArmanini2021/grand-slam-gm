// ── Field ⇆ draw reconciliation guard ────────────────────────────────────────
// The Montréal 2026 field shipped from a snapshot of the ORIGINAL entry list and drifted
// from the final draw — 3 withdrawn players were still draftable (silent zero-score picks)
// and 25 real main-draw players were missing. This guard makes that impossible to repeat:
// it fetches the tournament's published Wikipedia draw, resolves every main-draw player
// through the SAME parser the app uses, and fails (exit 1) unless the field matches exactly —
//   • MISSING  = in the real draw but NOT draftable   (users can't pick a real entrant)
//   • PHANTOM  = draftable but NOT in the draw         (withdrew → can never score)
// Run it before shipping any tournament field (e.g. the US Open):
//   node scripts/reconcile-field.mjs "2025 US Open – Men's singles" src/data/usopen2026Field.json
//
// Imports the shared TS parser directly (Node ≥22.18 strips the type-only syntax), so there
// is ZERO reconciliation logic duplicated from the app.

import { readFileSync } from 'node:fs';
import { buildResolver, splitBrackets, cleanTeam, teamTarget } from '../src/data/drawParser.ts';

const [page, fieldPath] = process.argv.slice(2);
if (!page || !fieldPath) {
  console.error('usage: node scripts/reconcile-field.mjs "<Wikipedia draw page>" <field.json>');
  process.exit(2);
}

const field = JSON.parse(readFileSync(fieldPath, 'utf8'));
if (!Array.isArray(field) || !field.every((p) => p?.id && p?.name)) {
  console.error(`field file ${fieldPath} must be an array of { id, name, ... }`);
  process.exit(2);
}
const resolve = buildResolver(field);
const rosterIds = new Set(field.map((p) => p.id));

// Fetch the draw wikitext via the CORS-open MediaWiki API — the exact source the app polls.
const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(page)}`
  + `&prop=wikitext&formatversion=2&format=json&origin=*`;
const json = await (await fetch(url)).json();
const wikitext = json?.parse?.wikitext;
// NB: set process.exitCode and let the loop drain rather than calling process.exit() — on
// Windows/Node, exiting while the undici fetch socket is still open trips a libuv assertion
// that masks the exit code. A guard MUST report failure reliably, so we never hard-exit here.
if (typeof wikitext !== 'string') {
  console.error(`could not load draw page "${page}": ${json?.error?.info ?? 'not found'}`);
  process.exitCode = 2;
} else {
  // MAIN DRAW = exactly the brackets the app's parseFullDraw consumes: the 16-team section
  // brackets (R128/R64/R32/R16) plus the 8-team finals (QF/SF/F). Everything else — 2- AND
  // 4-team brackets — is QUALIFYING (Cincinnati's qualifying uses 4-team brackets), which never
  // counts as main draw. Matching the app parser keeps this guard exact for both a 96 Masters
  // (8×16 + finals) and a 128 Slam.
  const brackets = splitBrackets(wikitext).filter((b) => /^(8|16)TeamBracket/i.test(b.type));
  const drawById = new Map(); // id → display name
  for (const b of brackets) {
    for (const m of b.text.matchAll(/\|\s*RD\d+-team\d+\s*=\s*(.*?)(?=\s*\|\s*RD|\n\s*\||\n\}\}|$)/gm)) {
      const raw = m[1];
      const clean = cleanTeam(raw);
      if (!clean || /^bye$/i.test(clean)) continue; // empty cell / bye
      const id = resolve(raw);
      if (id !== 'tbd' && !drawById.has(id)) drawById.set(id, teamTarget(raw).replace(/\s*\([^)]*\)$/, ''));
    }
  }

  const missing = [...drawById].filter(([id]) => !rosterIds.has(id));
  const phantom = field.filter((p) => !drawById.has(p.id));

  console.log(`\n  draw page:      ${page}`);
  console.log(`  field file:     ${fieldPath}`);
  console.log(`  main-draw size: ${drawById.size}`);
  console.log(`  draftable:      ${field.length}`);
  console.log(`  MISSING:        ${missing.length}   (in draw, not draftable)`);
  console.log(`  PHANTOM:        ${phantom.length}   (draftable, withdrew / not in draw)`);

  if (missing.length) {
    console.log('\n  ✗ MISSING — real entrants users cannot draft:');
    for (const [, name] of missing.sort((a, b) => a[1].localeCompare(b[1]))) console.log(`      + ${name}`);
  }
  if (phantom.length) {
    console.log('\n  ✗ PHANTOM — draftable players who are not in the draw:');
    for (const p of phantom.sort((a, b) => (a.ranking ?? 999) - (b.ranking ?? 999))) {
      console.log(`      - ${p.name}${p.ranking ? ` (rank ${p.ranking})` : ''}`);
    }
  }

  const ok = missing.length === 0 && phantom.length === 0;
  console.log(ok
    ? '\n  ✓ field reconciles exactly with the published draw.\n'
    : '\n  ✗ field does NOT match the draw — fix the field before shipping.\n');
  process.exitCode = ok ? 0 : 1;
}
