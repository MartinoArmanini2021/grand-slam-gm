// ── How heavy should the Final be? ──────────────────────────────────────────────────────────────
// Job 13's evidence. Sweeps FOUR Final-scoring designs over the SAME simulated tournaments
// (paired runs — identical draws, squads and transfers; only the curve differs) and reports how
// each changes who wins a league and why.
//
//   node scripts/sim-final-weight.mjs             # 12 managers, 15000 tournaments
//   node scripts/sim-final-weight.mjs 12 40000
//
// Model copied from sim-balance.mjs (real Cincinnati field, real prices, real 2/3/5 + $150M rules,
// logistic match odds calibrated to ATP base rates, MAX_TRANSFERS = 3 like production).

import { readFileSync } from 'node:fs';

const N_MANAGERS = Number(process.argv[2]) || 12;
const N_RUNS     = Number(process.argv[3]) || 15000;

const ROUNDS = ['R64', 'R32', 'R16', 'QF', 'SF', 'F'];
const BASE_POINTS = { R64: 1, R32: 2, R16: 5, QF: 10, SF: 20, F: 40 };
const RETURN_RATE = { R64: 0.70, R32: 0.55, R16: 0.40, QF: 0.25, SF: 0, F: 0 };
const CAPTAIN = 2, VICE = 1.5, TRANSFER_CAP = 3;
const BUDGET = 150, QUOTA = { Platinum: 2, Gold: 3, Silver: 5 };
const tierOf = (r) => (r <= 10 ? 'Platinum' : r <= 25 ? 'Gold' : 'Silver');
const upsetMult = (w, l) => (l == null || w <= l ? 1 : 1 + (w - l) / ((w - l) + 30));
const winPoints = (base, w, l) => Math.round(base * upsetMult(w, l));

// The four designs on trial. `bonus` = flat points per finalist HELD (both finalists), no
// armband multiplier and no upset — a reward for the run, not another lottery ticket.
const VARIANTS = [
  { key: 'A · today   1·2·5·10·20·40',   F: 40, bonus: 0 },
  { key: 'B · big F    …·20·60',          F: 60, bonus: 0 },
  { key: 'C · small F  …·20·30',          F: 30, bonus: 0 },
  { key: 'D · today + finalist +10',      F: 40, bonus: 10 },
  // The three curves from the 2026-08-14 investigation, verbatim:
  { key: 'E · flatter 1·2·4·7·12·20',     points: { R64: 1, R32: 2, R16: 4, QF: 7,  SF: 12, F: 20 }, bonus: 0 },
  { key: 'F · linear  1·2·3·5·8·13',      points: { R64: 1, R32: 2, R16: 3, QF: 5,  SF: 8,  F: 13 }, bonus: 0 },
  { key: 'G · steeper 1·3·7·15·32·70',    points: { R64: 1, R32: 3, R16: 7, QF: 15, SF: 32, F: 70 }, bonus: 0 },
  // FORMAT_OPTIONS.md (17 Aug) Format 2 — "early-fat", built to fix the dead first week:
  { key: 'H · early-fat 2·3·5·8·13·20',   points: { R64: 2, R32: 3, R16: 5, QF: 8, SF: 13, F: 20 }, bonus: 0 },
];

// ── field + bracket (verbatim from sim-balance.mjs) ─────────────────────────────────────────────
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
    cheap:      (pool) => [...pool].sort((a, b) => a.price - b.price),
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
  return { matches, exit, champion: alive[0] };
}

// Roster evolution (transfers) depends only on exits and prices — NOT on the points curve — so it
// is computed once per tournament and every variant scores the identical roster history.
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

function scoreVariant(byRound, sim, { F, bonus, points: full }) {
  const { matches, exit } = sim;
  const points = full ?? { ...BASE_POINTS, F };
  const perRound = {};
  let total = 0;
  for (let ri = 0; ri < ROUNDS.length; ri++) {
    const round = ROUNDS[ri];
    const roster = byRound[ri];
    const aliveNow = roster.filter(p => {
      const e = exit[p.id];
      return e === 'W' || ROUNDS.indexOf(e) >= ri;
    }).sort((a, b) => a.rank - b.rank);
    const cap = aliveNow[0], vice = aliveNow[1];
    let got = 0;
    for (const m of matches[round]) {
      if (!roster.includes(m.w)) continue;
      const pts = winPoints(points[round], m.w.rank, m.l.rank);
      got += m.w === cap ? pts * CAPTAIN : m.w === vice ? pts * VICE : pts;
    }
    if (round === 'F' && bonus) {
      const fin = matches.F[0];
      for (const p of [fin.w, fin.l]) if (roster.includes(p)) got += bonus;
    }
    perRound[round] = got; total += got;
  }
  return { total, perRound };
}

// ── run ─────────────────────────────────────────────────────────────────────────────────────────
let seed = 12345;
const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const STRATS = ['chalk', 'value', 'contrarian', 'cheap'];
const managers = Array.from({ length: N_MANAGERS }, (_, i) => ({
  strategy: i < STRATS.length ? STRATS[i] : 'random',
  squad: buildSquad(i < STRATS.length ? STRATS[i] : 'random', rng),
}));

const agg = VARIANTS.map(() => ({
  flips: 0, champOwnerWins: 0, finalShare: 0, margins: [], preLeaderHadLead: 0, latePct: 0,
}));

for (let run = 0; run < N_RUNS; run++) {
  const sim = playTournament(rng);
  const histories = managers.map(m => rosterHistory(m.squad, sim));
  VARIANTS.forEach((v, vi) => {
    const res = histories.map(h => scoreVariant(h, sim, v));
    const totals = res.map(r => r.total);
    const preF = res.map(r => r.total - r.perRound.F);
    const leadPre = preF.indexOf(Math.max(...preF));
    const best = Math.max(...totals);
    const winners = totals.map((t, i) => (t === best ? i : -1)).filter(i => i >= 0);
    if (!winners.includes(leadPre)) agg[vi].flips++;
    const winner = winners[0];
    const owns = histories[winner].some(r => r.includes(sim.champion));
    if (owns) agg[vi].champOwnerWins++;
    agg[vi].finalShare += res[winner].perRound.F / res[winner].total;
    // Share of ALL league points earned from the QF onward — the "is week one worth playing" metric
    let late = 0, all = 0;
    for (const r of res) { late += r.perRound.QF + r.perRound.SF + r.perRound.F; all += r.total; }
    agg[vi].latePct += all ? late / all : 0;
    const sorted = [...totals].sort((a, b) => b - a);
    agg[vi].margins.push(sorted[0] - (sorted[1] ?? 0));
  });
}

const pct = (n) => (100 * n / N_RUNS).toFixed(1) + '%';
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
console.log(`\n  Final-weight sweep — ${N_MANAGERS} managers · ${N_RUNS} tournaments · identical draws per variant\n`);
console.log('  variant                            final flips league   QF-onward share   final share of winner   1st–2nd margin');
console.log('  ' + '-'.repeat(112));
for (let i = 0; i < VARIANTS.length; i++) {
  const a = agg[i];
  console.log('  ' + VARIANTS[i].key.padEnd(34)
    + pct(a.flips).padStart(12) + '        '
    + ((100 * a.latePct / N_RUNS).toFixed(1) + '%').padStart(10) + '          '
    + ((100 * a.finalShare / N_RUNS).toFixed(1) + '%').padStart(12) + '            '
    + mean(a.margins).toFixed(1).padStart(8));
}
console.log('\n  "final flips league" = the manager leading BEFORE the final does not win it.');
console.log('  All four variants scored on the SAME tournaments, squads and transfers — differences are the curve alone.\n');
