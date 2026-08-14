// ── Apply a current ATP ranking snapshot to the master pool ──────────────────────────────────────
// WHY: src/data/atp300.json was generated from an ATP snapshot dated 2026-07-20 — BEFORE Washington
// and Montréal. Rankings drive three things, so a stale rank is not cosmetic:
//   • the UPSET MULTIPLIER in scoring (a too-low rank makes a win look like a bigger upset than it
//     was, and inflates that player's points),
//   • the TIER (Platinum / Gold / Silver) that the 2/3/5 squad quota is built on,
//   • the PRICE.
// Jódar was the tell: seeded 12 at Cincinnati but carried at rank 25 here — 14 places stale after
// his Washington final and Montréal semi-final.
//
//   node scripts/apply-rankings.mjs --dry     # report every change, write nothing
//   node scripts/apply-rankings.mjs           # write src/data/atp300.json
//
// Then rebuild the dependent artefacts:
//   node scripts/build-field.mjs cincinnati_2026 && node scripts/gen-seed.mjs cincinnati_2026
//
// SOURCE: livetennis.io/rankings/atp-rankings (PIF ATP Rankings, singles), read 2026-08-14.
// Only the top 100 is covered — that is 83 of the 96 Cincinnati entrants, i.e. every seed and every
// player whose tier/price could realistically move. Players outside it keep their existing rank and
// are listed in the report, never silently altered.

import { readFileSync, writeFileSync } from 'node:fs';

const DRY = process.argv.includes('--dry');
const AS_OF = '2026-08-14';

// rank → name, exactly as published. Name matching below is accent- and word-order-insensitive,
// because this source writes some names surname-first ("Martin Etcheverry Tomas").
const RANKINGS = [
  'Jannik Sinner', 'Carlos Alcaraz', 'Alexander Zverev', 'Felix Auger-Aliassime', 'Novak Djokovic',
  'Ben Shelton', 'Daniil Medvedev', 'Alex De Minaur', 'Taylor Fritz', 'Flavio Cobolli',
  'Rafael Jodar', 'Learner Tien', 'Alexander Bublik', 'Jiri Lehecka', 'Lorenzo Musetti',
  'Jakub Mensik', 'Casper Ruud', 'Andrey Rublev', 'Valentin Vacherot', 'Luciano Darderi',
  'Arthur Fils', 'Brandon Nakashima', 'Frances Tiafoe', 'Tommy Paul', 'Francisco Cerundolo',
  'Joao Fonseca', 'Alejandro Davidovich Fokina', 'Arthur Rinderknech', 'Alejandro Tabilo', 'Ugo Humbert',
  'Martin Etcheverry Tomas', 'Alexander Blockx', 'Zizou Bergs', 'Matteo Arnaldi', 'Cameron Norrie',
  'Ignacio Buse', 'Arthur Fery', 'Raphael Collignon', 'Karen Khachanov', 'Daniel Merida Aguilar',
  'Alex Michelsen', 'Matteo Berrettini', 'Jan-Lennard Struff', 'Mariano Navone', 'Terence Atmane',
  'Jaume Munar', 'Nuno Borges', 'Denis Shapovalov', 'Stefanos Tsitsipas', 'Agustin Tirante Thiago',
  'Manuel Cerundolo Juan', 'Adrian Mannarino', 'Sebastian Baez', 'Luca van Assche', 'Yannick Hanfmann',
  'Tallon Griekspoor', 'Quentin Halys', 'Ethan Quinn', 'Botic Van De Zandschulp', 'Corentin Moutet',
  'Andres Burruchaga Roman', 'Tomas Machac', 'Fabian Marozsan', 'Sebastian Korda', 'Daniel Altmaier',
  'Miomir Kecmanovic', 'Martin Landaluce', 'Kamil Majchrzak', 'Hubert Hurkacz', 'Daniel Vallejo Adolfo',
  'Vit Kopriva', 'Pablo Carreno-Busta', 'Hamad Medjedovic', 'Jenson Brooksby', 'Alex Molcan',
  'Camilo Ugo Carabelli', 'Jan Choinski', 'Valentin Royer', 'Jaime Faria', 'Marin Cilic',
  'Mattia Bellucci', 'Marton Fucsovics', 'Marcos Giron', 'Zachary Svajda', 'Arthur Gea',
  'James Duckworth', 'Facundo Diaz Acosta', 'Lorenzo Sonego', 'Alexander Shevchenko', 'Sho Shimabukuro',
  'Marco Trungelliti', 'Giovanni Mpetshi Perricard', 'Coleman Wong Chak Lam', 'Martin Damm', 'Rinky Hijikata',
  'Aleksandar Kovacevic', 'Hugo Gaston', 'Adam Walton', 'Aleksandar Vukic', 'Benjamin Bonzi',
];

// Source spellings that differ from the pool's by more than accents/word order, so neither the
// exact nor the sorted-words key can bridge them. Explicit, so a bad guess can't slip through.
const ALIAS = {
  'Daniel Merida Aguilar': 'Daniel Merida',       // source appends the second surname
  'Alexander Shevchenko': 'Aleksandr Shevchenko', // transliteration differs
  'Coleman Wong Chak Lam': 'Coleman Wong',        // source appends the Cantonese given name
};

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const sorted = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean).sort().join('');

const poolUrl = new URL('../src/data/atp300.json', import.meta.url);
const pool = JSON.parse(readFileSync(poolUrl, 'utf8'));

// Index the pool both ways so a surname-first source name still resolves to one player.
const byNorm = new Map(), bySorted = new Map();
for (const p of pool) {
  byNorm.set(norm(p.name), p);
  const k = sorted(p.name);
  if (!bySorted.has(k)) bySorted.set(k, p); else bySorted.set(k, null); // ambiguous → refuse
}

const changes = [], unmatched = [];
const claimed = new Map(); // pool id → new rank, to catch two source names hitting one player
RANKINGS.forEach((raw, i) => {
  const rank = i + 1;
  const name = ALIAS[raw] ?? raw;
  const p = byNorm.get(norm(name)) ?? bySorted.get(sorted(name)) ?? null;
  if (!p) { unmatched.push(`${rank}. ${name}`); return; }
  if (claimed.has(p.id)) { unmatched.push(`${rank}. ${name} (would collide with ${claimed.get(p.id)} on id "${p.id}")`); return; }
  claimed.set(p.id, rank);
  if (p.rank !== rank) changes.push({ id: p.id, name: p.name, from: p.rank, to: rank });
  p.rank = rank;
});

// A player absent from the published top 100 is, by definition, NOT in the top 100 — so any rank
// ≤100 they still carry from the old snapshot is known-wrong AND collides with whoever now holds it
// (ranks must be unique; data.test.ts pins that). Re-seat the whole tail behind the authoritative
// 100, preserving its previous relative order. The pool is "the top 300", so a dense 1..N ordering
// is the correct shape; the tail is best-known-order rather than a claim of exact rank, and every
// tail player is bottom-tier at the price floor, so the practical effect is nil.
const tail = pool.filter(p => !claimed.has(p.id)).sort((a, b) => a.rank - b.rank);
let reseated = 0;
tail.forEach((p, i) => {
  const next = RANKINGS.length + 1 + i;
  if (p.rank !== next) { if (p.rank <= RANKINGS.length) reseated++; p.rank = next; }
});

console.log(`\n  source:   livetennis.io PIF ATP Rankings (singles), as of ${AS_OF}`);
console.log(`  covered:  top ${RANKINGS.length}`);
console.log(`  matched:  ${claimed.size}   unmatched: ${unmatched.length}`);
if (unmatched.length) { console.log('\n  ✗ NOT matched to a pool player (left untouched):'); unmatched.forEach(u => console.log('      ' + u)); }

console.log(`  dropped out of the top ${RANKINGS.length} (had a stale sub-${RANKINGS.length} rank, re-seated behind it): ${reseated}`);
console.log(`\n  rank changes: ${changes.length}`);
for (const c of changes.sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from)).slice(0, 25)) {
  const d = c.to - c.from;
  console.log(`      ${c.name.padEnd(28)} ${String(c.from).padStart(3)} → ${String(c.to).padStart(3)}  (${d > 0 ? '+' : ''}${d})`);
}
if (changes.length > 25) console.log(`      … +${changes.length - 25} more`);

if (DRY) { console.log('\n  --dry: nothing written.\n'); }
else {
  writeFileSync(poolUrl, JSON.stringify(pool) + '\n');
  console.log(`\n  ✓ wrote src/data/atp300.json (${changes.length} ranks updated, as of ${AS_OF})`);
  console.log('  → next: node scripts/build-field.mjs cincinnati_2026 && node scripts/gen-seed.mjs cincinnati_2026\n');
}
