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
//   node scripts/build-field.mjs paris_2026 && node scripts/gen-seed.mjs paris_2026
//
// SOURCE: livetennis.io/rankings/atp-rankings (PIF ATP Rankings, singles), read 2026-10-26, published
// 2026-10-19 (the newest list out at 18:00 UTC on 26 Oct; Wikipedia's table carried the same date).
// The source shows the players it has profiles for, so a few ranks are missing (69, 83, 85, 91, 95,
// 96, 100) and it adds a handful past 100. Hence rank → name, not a dense list. Pool players it does
// not list fill the free ranks in their previous relative order: best-known order, not a claim.

import { readFileSync, writeFileSync } from 'node:fs';

const DRY = process.argv.includes('--dry');
const AS_OF = '2026-10-19';

// rank → name, exactly as published. Name matching below is accent- and word-order-insensitive,
// because this source writes some names surname-first ("Martin Etcheverry Tomas").
const RANKINGS = {
  1: 'Jannik Sinner', 2: 'Alexander Zverev', 3: 'Carlos Alcaraz', 4: 'Ben Shelton', 5: 'Daniil Medvedev',
  6: 'Flavio Cobolli', 7: 'Felix Auger-Aliassime', 8: 'Alex De Minaur', 9: 'Frances Tiafoe', 10: 'Arthur Fils',
  11: 'Rafael Jodar', 12: 'Novak Djokovic', 13: 'Alejandro Davidovich Fokina', 14: 'Taylor Fritz', 15: 'Tommy Paul',
  16: 'Jakub Mensik', 17: 'Brandon Nakashima', 18: 'Learner Tien', 19: 'Alexander Bublik', 20: 'Jiri Lehecka',
  21: 'Francisco Cerundolo', 22: 'Andrey Rublev', 23: 'Luciano Darderi', 24: 'Casper Ruud', 25: 'Karen Khachanov',
  26: 'Lorenzo Musetti', 27: 'Alexander Blockx', 28: 'Joao Fonseca', 29: 'Tomas Martin Etcheverry', 30: 'Hubert Hurkacz',
  31: 'Alejandro Tabilo', 32: 'Valentin Vacherot', 33: 'Ignacio Buse', 34: 'Arthur Fery', 35: 'Ugo Humbert',
  36: 'Matteo Arnaldi', 37: 'Alex Michelsen', 38: 'Botic Van De Zandschulp', 39: 'Stefanos Tsitsipas', 40: 'Cameron Norrie',
  41: 'Zizou Bergs', 42: 'Daniel Merida Aguilar', 43: 'Matteo Berrettini', 44: 'Arthur Gea', 45: 'Mariano Navone',
  46: 'Quentin Halys', 47: 'Denis Shapovalov', 48: 'Luca van Assche', 49: 'Sebastian Baez', 50: 'Thiago Agustin Tirante',
  51: 'Jaume Munar', 52: 'Nuno Borges', 53: 'Juan Manuel Cerundolo', 54: 'Adolfo Daniel Vallejo', 55: 'Raphael Collignon',
  56: 'Jaime Faria', 57: 'Miomir Kecmanovic', 58: 'Jan-Lennard Struff', 59: 'Yannick Hanfmann', 60: 'Tallon Griekspoor',
  61: 'Arthur Rinderknech', 62: 'Roman Andres Burruchaga', 63: 'Ethan Quinn', 64: 'Fabian Marozsan', 65: 'Daniel Altmaier',
  66: 'Vit Kopriva', 67: 'Martin Landaluce', 68: 'Mattia Bellucci', 70: 'Roman Safiullin', 71: 'Facundo Diaz Acosta',
  72: 'Tomas Machac', 73: 'James Duckworth', 74: 'Pablo Carreno-Busta', 75: 'Camilo Ugo Carabelli', 76: 'Hamad Medjedovic',
  77: 'Zachary Svajda', 78: 'Kamil Majchrzak', 79: 'Adrian Mannarino', 80: 'Alex Molcan', 81: 'Sebastian Korda',
  82: 'Aleksandar Kovacevic', 84: 'Marin Cilic', 86: 'Rinky Hijikata', 87: 'Jacob Fearnley', 88: 'Marcos Giron',
  89: 'Lorenzo Sonego', 90: 'Marco Trungelliti', 92: 'Coleman Wong Chak Lam', 93: 'Hugo Gaston', 94: 'Corentin Moutet',
  97: 'Adam Walton', 98: 'Terence Atmane', 99: 'Jenson Brooksby', 102: 'Jesper De Jong', 107: 'Martin Damm',
  108: 'Alexander Shevchenko', 109: 'Sho Shimabukuro', 110: 'Valentin Royer', 113: 'Jan Choinski', 116: 'Aleksandar Vukic',
};

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
Object.entries(RANKINGS).forEach(([r, raw]) => {
  const rank = Number(r);
  const name = ALIAS[raw] ?? raw;
  const p = byNorm.get(norm(name)) ?? bySorted.get(sorted(name)) ?? null;
  if (!p) { unmatched.push(`${rank}. ${name}`); return; }
  if (claimed.has(p.id)) { unmatched.push(`${rank}. ${name} (would collide with ${claimed.get(p.id)} on id "${p.id}")`); return; }
  claimed.set(p.id, rank);
  if (p.rank !== rank) changes.push({ id: p.id, name: p.name, from: p.rank, to: rank });
  p.rank = rank;
});

// A player absent from the published list carries a rank from the old snapshot that is known-wrong
// AND may collide with whoever now holds it (ranks must be unique; data.test.ts pins that). Re-seat
// every such player into the ranks the source leaves free, lowest first, keeping their previous
// relative order. Unlisted players are low-ranked by definition, so the effect on price is nil.
const TOP = Math.max(...Object.keys(RANKINGS).map(Number));
const taken = new Set(claimed.values());
const free = [];
for (let r = 1; free.length < pool.length; r++) if (!taken.has(r)) free.push(r);
const tail = pool.filter(p => !claimed.has(p.id)).sort((a, b) => a.rank - b.rank);
let reseated = 0;
tail.forEach((p, i) => {
  const next = free[i];
  if (p.rank !== next) { if (p.rank <= TOP) reseated++; p.rank = next; }
});

console.log(`\n  source:   livetennis.io PIF ATP Rankings (singles), as of ${AS_OF}`);
console.log(`  covered:  ${Object.keys(RANKINGS).length} players, ranks 1–${TOP}`);
console.log(`  matched:  ${claimed.size}   unmatched: ${unmatched.length}`);
if (unmatched.length) { console.log('\n  ✗ NOT matched to a pool player (left untouched):'); unmatched.forEach(u => console.log('      ' + u)); }

console.log(`  not in the source, re-seated into the free ranks: ${reseated}`);
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
  console.log('  → next: node scripts/build-field.mjs paris_2026 && node scripts/gen-seed.mjs paris_2026\n');
}
