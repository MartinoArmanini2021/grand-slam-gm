// ── Job 14: is there a better ranking-difference (upset) bonus? ────────────────────────────────
// FORMAT_OPTIONS.md's parting shot: "the lever, if you want one, is the UPSET MULTIPLIER."
// This sweeps five designs under the ADOPTED Format 2 curve, on identical tournaments, using the
// same skill-edge metric as the 17-Aug study (3 informed drafters vs 3 random ones, pairwise).
//
//   node scripts/sim-upset.mjs             # 15000 tournaments
//
// One design is not a formula change at all: Format 2's early bases are 1/2/3, and INTEGER
// rounding erases small upsets there (round(1 × 1.3) = 1 — no reward). U4 rounds to halves.

import { readFileSync } from 'node:fs';

const N_RUNS = Number(process.argv[2]) || 15000;

const ROUNDS = ['R64', 'R32', 'R16', 'QF', 'SF', 'F'];
const POINTS = { R64: 2, R32: 3, R16: 5, QF: 8, SF: 13, F: 20 };   // Format 2 (adopted)
const RETURN_RATE = { R64: 0.70, R32: 0.55, R16: 0.40, QF: 0.25, SF: 0, F: 0 };
const CAPTAIN = 2, VICE = 1.5, TRANSFER_CAP = 3;
const BUDGET = 150, QUOTA = { Platinum: 2, Gold: 3, Silver: 5 };
const tierOf = (r) => (r <= 10 ? 'Platinum' : r <= 25 ? 'Gold' : 'Silver');

// mult(w, l) — w = winner's rank, l = loser's rank (favourites always ×1)
const VARIANTS = [
  { key: 'U0 · today  1+g/(g+30), whole pts', mult: (g) => 1 + g / (g + 30), round: (x) => Math.round(x) },
  { key: 'U1 · sharper 1+g/(g+15)',           mult: (g) => 1 + g / (g + 15), round: (x) => Math.round(x) },
  { key: 'U2 · double  1+2g/(g+30), max ×3',  mult: (g) => 1 + 2 * g / (g + 30), round: (x) => Math.round(x) },
  { key: 'U3 · ratio   1+.45·ln(w/l), cap ×2.2', ratio: true, round: (x) => Math.round(x) },
  { key: 'U4 · today, HALF-point rounding',   mult: (g) => 1 + g / (g + 30), round: (x) => Math.round(x * 2) / 2 },
];
const multFor = (v, w, l) => {
  if (l == null || w <= l) return 1;
  if (v.ratio) return Math.min(2.2, 1 + 0.45 * Math.log(w / l));
  return v.mult(w - l);
};

const raw = JSON.parse(readFileSync(new URL('../src/data/cincinnati2026Field.json', import.meta.url), 'utf8'));
const priceFor = (ranking, ytd, surfWin) => {
  const rawBase = 55 * Math.pow(Math.max(1, ranking), -0.46);
  const played = ytd ? ytd.wins + ytd.losses : 0;
  const winRate = played >= 8 ? ytd.wins / played : null;
  const formMult = 1 + (winRate != null ? (winRate - 0.5) * 0.9 : 0) + Math.min(0.12, (ytd?.titles ?? 0) * 0.03);
  const surfMult = 1 + (surfWin != null ? (surfWin / 100 - 0.5) * 0.5 : 0);
  return Math.max(4, Math.min(50, Math.round(rawBase * formMult * surfMult)));
};
const FIELD = raw.map(p => ({
  id: p.id, name: p.name, rank: p.ranking, tier: tierOf(p.ranking),
  price: priceFor(p.ranking, p.ytd, p.surface?.hard),
})).sort((a, b) => a.rank - b.rank);
const ENTRANTS = FIELD.slice(0, 64);
function seedOrder(n) {
  let o = [0];
  for (let s = 1; s < n; s *= 2) { const m = s * 2 - 1; o = o.flatMap(x => [x, m - x]); }
  return o;
}
const BRACKET = seedOrder(64).map(i => ENTRANTS[i]);
const K = 0.5;
const pWin = (a, b) => 1 / (1 + Math.exp(-K * (Math.log(b.rank) - Math.log(a.rank))));

function buildSquad(strategy, rng) {
  const pick = { Platinum: [], Gold: [], Silver: [] };
  const pools = {
    Platinum: FIELD.filter(p => p.tier === 'Platinum'),
    Gold:     FIELD.filter(p => p.tier === 'Gold'),
    Silver:   FIELD.filter(p => p.tier === 'Silver'),
  };
  const order = {
    chalk:      (pool) => [...pool].sort((a, b) => a.rank - b.rank),
    value:      (pool) => [...pool].sort((a, b) => a.rank / a.price - b.rank / b.price),
    contrarian: (pool) => [...pool].sort((a, b) => a.rank - b.rank).slice(3),
    random:     (pool) => [...pool].sort(() => rng() - 0.5),
  }[strategy];
  for (const t of ['Platinum', 'Gold', 'Silver']) {
    const cand = order(pools[t]);
    for (const p of cand) { if (pick[t].length < QUOTA[t]) pick[t].push(p); }
  }
  let squad = [...pick.Platinum, ...pick.Gold, ...pick.Silver];
  let guard = 0;
  while (squad.reduce((s, p) => s + p.price, 0) > BUDGET && guard++ < 200) {
    const swapTier = squad.filter(p => p.tier === 'Silver').length ? 'Silver' : 'Gold';
    const worst = squad.filter(p => p.tier === swapTier).sort((a, b) => b.price - a.price)[0];
    const repl = FIELD.filter(p => p.tier === swapTier && !squad.includes(p))
      .sort((a, b) => a.price - b.price)[0];
    if (!repl) break;
    squad = squad.map(p => (p === worst ? repl : p));
  }
  return squad;
}

function playTournament(rng) {
  let alive = BRACKET.slice();
  const matches = {}; const exit = {};
  for (const round of ROUNDS) {
    const next = []; matches[round] = [];
    for (let i = 0; i < alive.length; i += 2) {
      const a = alive[i], b = alive[i + 1];
      const win = rng() < pWin(a, b) ? a : b;
      const lose = win === a ? b : a;
      matches[round].push({ w: win, l: lose });
      exit[lose.id] = round; next.push(win);
    }
    alive = next;
  }
  exit[alive[0].id] = 'W';
  return { matches, exit };
}

function rosterHistory(squad, sim) {
  const { exit } = sim;
  let roster = squad.slice();
  let cash = BUDGET - squad.reduce((s, p) => s + p.price, 0);
  const cashedIn = new Set(); let moves = 0;
  const byRound = [];
  for (let ri = 0; ri < ROUNDS.length; ri++) {
    byRound.push(roster.slice());
    if (ri < ROUNDS.length - 1) {
      for (const p of roster.slice()) {
        const e = exit[p.id];
        if (e === 'W' || ROUNDS.indexOf(e) > ri || cashedIn.has(p.id)) continue;
        const rate = RETURN_RATE[e] ?? 0;
        if (rate === 0 || moves >= TRANSFER_CAP) continue;
        cash += p.price * rate; cashedIn.add(p.id);
        const survivors = FIELD.filter(q => {
          const qe = exit[q.id];
          return (qe === 'W' || ROUNDS.indexOf(qe) > ri) && q.tier === p.tier
            && !roster.includes(q) && q.price <= cash;
        }).sort((a, b) => a.rank - b.rank);
        if (survivors[0]) { cash -= survivors[0].price; roster = roster.map(x => (x === p ? survivors[0] : x)); moves++; }
        else roster = roster.filter(x => x !== p);
      }
    }
  }
  return byRound;
}

// noUpset=true scores the same rounds with every multiplier forced to 1, so the difference is
// exactly what the upset design contributed.
function score(byRound, sim, v, noUpset = false) {
  const { matches, exit } = sim;
  let total = 0, preF = 0;
  for (let ri = 0; ri < ROUNDS.length; ri++) {
    const round = ROUNDS[ri];
    const roster = byRound[ri];
    const aliveNow = roster.filter(p => {
      const e = exit[p.id];
      return e === 'W' || ROUNDS.indexOf(e) >= ri;
    }).sort((a, b) => a.rank - b.rank);
    const cap = aliveNow[0], vice = aliveNow[1];
    for (const m of matches[round]) {
      if (!roster.includes(m.w)) continue;
      const mult = noUpset ? 1 : multFor(v, m.w.rank, m.l.rank);
      const pts = v.round(POINTS[round] * mult);
      const val = m.w === cap ? pts * CAPTAIN : m.w === vice ? pts * VICE : pts;
      total += val;
      if (round !== 'F') preF += val;
    }
  }
  return { total, preF };
}

let seed = 12345;
const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
// The 17-Aug study's cast: three informed drafters vs three random ones.
const managers = [
  ...['chalk', 'value', 'contrarian'].map(s => ({ informed: true, squad: buildSquad(s, rng) })),
  ...[0, 1, 2].map(() => ({ informed: false, squad: buildSquad('random', rng) })),
];

const agg = VARIANTS.map(() => ({ pairWins: 0, pairs: 0, upsetShare: 0, flips: 0, margins: [] }));

for (let run = 0; run < N_RUNS; run++) {
  const sim = playTournament(rng);
  const histories = managers.map(m => rosterHistory(m.squad, sim));
  VARIANTS.forEach((v, vi) => {
    const res = histories.map(h => score(h, sim, v));
    const flat = histories.map(h => score(h, sim, v, true));
    // skill edge, pairwise informed vs random (ties count half)
    for (let i = 0; i < 3; i++) for (let j = 3; j < 6; j++) {
      agg[vi].pairs++;
      if (res[i].total > res[j].total) agg[vi].pairWins++;
      else if (res[i].total === res[j].total) agg[vi].pairWins += 0.5;
    }
    const t = res.reduce((s, r) => s + r.total, 0);
    const f = flat.reduce((s, r) => s + r.total, 0);
    agg[vi].upsetShare += t ? (t - f) / t : 0;
    const totals = res.map(r => r.total);
    const pre = res.map(r => r.preF);
    const leadPre = pre.indexOf(Math.max(...pre));
    const best = Math.max(...totals);
    if (totals[leadPre] !== best) agg[vi].flips++;
    const sorted = [...totals].sort((a, b) => b - a);
    agg[vi].margins.push(sorted[0] - sorted[1]);
  });
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
console.log(`\n  Upset-bonus sweep under Format 2 — 3 informed vs 3 random · ${N_RUNS} identical tournaments\n`);
console.log('  variant                                   skill edge   upset share of pts   final flips   1st–2nd margin');
console.log('  ' + '-'.repeat(106));
for (let i = 0; i < VARIANTS.length; i++) {
  const a = agg[i];
  const edge = 200 * a.pairWins / a.pairs - 100;   // doc scale: +51.5% ≙ informed wins ~75.7% of pairs
  console.log('  ' + VARIANTS[i].key.padEnd(42)
    + ('+' + edge.toFixed(1) + '%').padStart(8) + '        '
    + ((100 * a.upsetShare / N_RUNS).toFixed(1) + '%').padStart(10) + '        '
    + ((100 * a.flips / N_RUNS).toFixed(1) + '%').padStart(8) + '       '
    + mean(a.margins).toFixed(1).padStart(8));
}
console.log('\n  skill edge: same definition and scale as docs/FORMAT_OPTIONS.md (today ≈ +51.5%).');
console.log('  upset share: how much of all points exist because of the bonus (vs the same games at ×1).\n');
