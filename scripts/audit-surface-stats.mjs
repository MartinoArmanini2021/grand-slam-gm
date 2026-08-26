// ── Are the per-surface win percentages trustworthy enough to price a player on? ─────────────────
//
//   node scripts/audit-surface-stats.mjs [surface]      # default: hard (the US Open)
//
// Price = f(rank, form, SURFACE WIN %), and the surface term swings a price by up to ±25%
// (surfMult = 1 + (pct/100 − 0.5) × 0.5) — on a $40M player that is $10M, the difference between
// affordable and not. Only the EVENT's surface matters, so this audits one surface at a time.
//
// The builder falls back to a player's overall season when he has fewer than four matches on a
// surface — the right call, but invisible until surfaceRecord was added. This reports how often the
// number you are pricing on is really that surface's record, and where the fallback moves money.
// READ-ONLY.

import { readFileSync } from 'node:fs';

const SURFACE = (process.argv[2] ?? 'hard').toLowerCase();
if (!['hard', 'clay', 'grass'].includes(SURFACE)) {
  console.error('usage: node scripts/audit-surface-stats.mjs [hard|clay|grass]');
  process.exit(2);
}

const pool = JSON.parse(readFileSync(new URL('../src/data/atp300.json', import.meta.url), 'utf8'));
const surfMult = (pct) => 1 + (pct / 100 - 0.5) * 0.5;
const played = (p) => (p.ytd?.wins ?? 0) + (p.ytd?.losses ?? 0);

const withData = pool.filter((p) => p.surface && p.surface[SURFACE] != null);
const rec = (p) => p.surfaceRecord?.[SURFACE];
const real = withData.filter((p) => rec(p)?.real);
const fallback = withData.filter((p) => rec(p) && !rec(p).real);
const unknown = pool.filter((p) => !p.surface || p.surface[SURFACE] == null);

console.log(`\n  ${SURFACE.toUpperCase()} — the surface that prices this event\n`);
console.log(`  ${pool.length} players in the pool`);
console.log(`    ${String(real.length).padStart(3)}  priced on their own ${SURFACE} record (4+ matches)`);
console.log(`    ${String(fallback.length).padStart(3)}  priced on their overall season standing in (thin ${SURFACE} sample)`);
console.log(`    ${String(unknown.length).padStart(3)}  no 2026 data at all — priced on ranking alone`);

// Does the number behave like a win percentage should? Sorted by price, the expensive players
// should mostly sit above 50% — if they did not, the pricing model would be inverted somewhere.
const top = [...withData].sort((a, b) => b.price - a.price).slice(0, 20);
const above = top.filter((p) => p.surface[SURFACE] > 50).length;
console.log(`\n  sanity: ${above}/20 of the most expensive players are above 50% on ${SURFACE}`);

console.log(`\n  the 14 priciest, with the evidence behind the number:`);
console.log(`    ${'player'.padEnd(24)} ${'rank'.padStart(4)} ${'price'.padStart(6)}  ${SURFACE}%   record      basis`);
for (const p of top.slice(0, 14)) {
  const r = rec(p);
  const basis = r?.real ? `${r.w}-${r.l} on ${SURFACE}` : `season ${p.ytd.wins}-${p.ytd.losses} (only ${(r?.w ?? 0) + (r?.l ?? 0)} on ${SURFACE})`;
  console.log(`    ${p.name.padEnd(24)} ${String(p.rank).padStart(4)} ${('$' + p.price + 'M').padStart(6)}`
    + `  ${String(p.surface[SURFACE]).padStart(3)}%  ${r ? `${r.w}-${r.l}`.padEnd(10) : '—'.padEnd(10)}  ${r?.real ? 'own record' : basis}`);
}

// Where the fallback is doing real financial work: an expensive player whose surface figure is not
// actually his surface record, and whose price moves meaningfully because of it.
const moved = fallback
  .map((p) => ({ p, swing: p.price * Math.abs(surfMult(p.surface[SURFACE]) - 1) }))
  .filter((x) => x.swing >= 1.5)
  .sort((a, b) => b.swing - a.swing);

console.log(`\n  fallback figures moving $1.5M or more — the ones worth a second look: ${moved.length}`);
for (const { p, swing } of moved.slice(0, 10)) {
  const r = rec(p);
  console.log(`    ${p.name.padEnd(24)} ${String(p.surface[SURFACE]).padStart(3)}% from a ${p.ytd.wins}-${p.ytd.losses} season`
    + ` · only ${r.w + r.l} ${SURFACE} match${r.w + r.l === 1 ? '' : 'es'} · ${'$' + p.price + 'M'} · ±$${swing.toFixed(1)}M`);
}

// Implausible: a percentage that cannot be produced by the record claimed for it.
const broken = withData.filter((p) => {
  const r = rec(p);
  if (!r?.real) return false;
  const expect = Math.round((r.w / (r.w + r.l)) * 100);
  return Math.abs(expect - p.surface[SURFACE]) > 1;
});
console.log(`\n  figures that do not match their own record: ${broken.length}${broken.length ? ' ← investigate' : ' (none)'}`);
for (const p of broken.slice(0, 5)) {
  const r = rec(p);
  console.log(`    ${p.name}  says ${p.surface[SURFACE]}% but record is ${r.w}-${r.l}`);
}
console.log('');
