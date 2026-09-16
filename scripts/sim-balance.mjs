// ── Scoring-balance simulator ────────────────────────────────────────────────────────────────────
// Answers: is the competition balanced, or do the late rounds (esp. the Final's ×40) decide
// everything? Runs a full Monte-Carlo league using the REAL field, REAL prices, REAL squad rules
// and the REAL scoring engine, then reports engagement metrics.
//
//   node scripts/sim-balance.mjs                 # default: 12 managers, 20k tournaments
//   node scripts/sim-balance.mjs 10 40000        # managers, runs
//   node scripts/sim-balance.mjs 12 20000 --alt  # also test alternative points curves
//   node scripts/sim-balance.mjs 22 5000 --slam --budget=200
//       --slam       the CURRENT game: US Open field, 128-draw (R128 start), Format 2 curve
//                    1·2·3·5·8·13·20 and the R128 75% refund. Default stays the Cincinnati
//                    64-draw on the legacy curve so the 2026-08-14 results remain reproducible.
//       --budget=N   starting budget in $M (default 150) — the same run answers "what if $200M?"
//
// Match model: P(A beats B) = logistic(k · ln(rankB/rankA)), k=0.5 — calibrated so #1 beats #10
// ≈76%, #1 beats #100 ≈91%, #10 beats #50 ≈69%, which matches ATP hard-court base rates closely.

import { readFileSync } from 'node:fs';

const N_MANAGERS = Number(process.argv[2]) || 12;
const N_RUNS     = Number(process.argv[3]) || 20000;
const TEST_ALT   = process.argv.includes('--alt');
const SLAM       = process.argv.includes('--slam');
const BUDGET_ARG = process.argv.find(a => a.startsWith('--budget='));

// ── the REAL rules ────────────────────────────────────────────────────────────────────────────
const ROUNDS      = SLAM ? ['R128', 'R64', 'R32', 'R16', 'QF', 'SF', 'F'] : ['R64', 'R32', 'R16', 'QF', 'SF', 'F'];
const ROUND_POINTS= SLAM ? { R128: 1, R64: 2, R32: 3, R16: 5, QF: 8, SF: 13, F: 20 }
                         : { R64: 1, R32: 2, R16: 5, QF: 10, SF: 20, F: 40 };
const RETURN_RATE = SLAM ? { R128: 0.75, R64: 0.70, R32: 0.55, R16: 0.40, QF: 0.25, SF: 0, F: 0 }
                         : { R64: 0.70, R32: 0.55, R16: 0.40, QF: 0.25, SF: 0, F: 0 };
const CAPTAIN = 2, VICE = 1.5;
let TRANSFER_CAP = Infinity;   // max re-signings per tournament (swept below)
const BUDGET = BUDGET_ARG ? Number(BUDGET_ARG.split('=')[1]) : 150;
const SQUAD = 10;
const DRAW = SLAM ? 128 : 64;  // players in the first scored round's bracket
const QUOTA = { Platinum: 2, Gold: 3, Silver: 5 };
const tierOf = (r) => (r <= 10 ? 'Platinum' : r <= 25 ? 'Gold' : 'Silver');
const UPSET_HALF = 30;
const upsetMult = (w, l) => (l == null || w <= l ? 1 : 1 + (w - l) / ((w - l) + UPSET_HALF));
const winPoints = (base, w, l) => Math.round(base * upsetMult(w, l));

// ── field: the real entrants (Cincinnati by default, US Open with --slam), real prices ─────────
const FIELD_FILE = SLAM ? '../src/data/usopen2026Field.json' : '../src/data/cincinnati2026Field.json';
const raw = JSON.parse(readFileSync(new URL(FIELD_FILE, import.meta.url), 'utf8'));
const priceFor = (ranking, ytd, surfWin) => {                   // mirrors players.ts priceBreakdown
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

// The DRAW who contest the first scored round, seeded into a standard bracket (1vN, 2vN-1 … nested).
const ENTRANTS = FIELD.slice(0, DRAW);
function seedOrder(n) {                                          // standard single-elim seeding
  let o = [0];
  for (let s = 1; s < n; s *= 2) { const m = s * 2 - 1; o = o.flatMap(x => [x, m - x]); }
  return o;
}
const BRACKET = seedOrder(DRAW).map(i => ENTRANTS[i]);           // index = draw slot

// ── match model ───────────────────────────────────────────────────────────────────────────────
const K = 0.5;
const pWin = (a, b) => 1 / (1 + Math.exp(-K * (Math.log(b.rank) - Math.log(a.rank))));

// ── manager archetypes (all must satisfy 2/3/5 + $150M) ───────────────────────────────────────
function buildSquad(strategy, rng) {
  const pick = { Platinum: [], Gold: [], Silver: [] };
  const pools = {
    Platinum: FIELD.filter(p => p.tier === 'Platinum'),
    Gold:     FIELD.filter(p => p.tier === 'Gold'),
    Silver:   FIELD.filter(p => p.tier === 'Silver'),
  };
  const order = {
    chalk:      (pool) => [...pool].sort((a, b) => a.rank - b.rank),                 // best players
    value:      (pool) => [...pool].sort((a, b) => a.rank / a.price - b.rank / b.price), // rank per $
    cheap:      (pool) => [...pool].sort((a, b) => a.price - b.price),               // spend least
    contrarian: (pool) => [...pool].sort((a, b) => a.rank - b.rank).slice(3),        // skip the very top
    random:     (pool) => [...pool].sort(() => rng() - 0.5),
  }[strategy];
  // Greedy in the strategy's order, with the feasibility check a real manager makes: take a
  // player only if the CHEAPEST possible fill of every seat still open afterwards fits under
  // the cap. Every strategy therefore ends with a legal, full 2/3/5 squad. (The old version
  // drafted first and "repaired" by downgrading Silvers only — once they were all $4M it spun
  // on no-op swaps and returned squads of up to $194M under a $150M cap.)
  const TIERS = ['Platinum', 'Gold', 'Silver'];
  const cheapestFill = (taken) =>
    TIERS.reduce((s, t) => {
      const open = QUOTA[t] - pick[t].length - (taken.tier === t ? 1 : 0);
      const rest = pools[t].filter(p => p !== taken && !pick[t].includes(p)).sort((a, b) => a.price - b.price);
      return s + rest.slice(0, open).reduce((x, p) => x + p.price, 0);
    }, 0);
  let cost = 0;
  for (const t of TIERS) {
    for (const p of order(pools[t])) {
      if (pick[t].length >= QUOTA[t]) break;
      if (cost + p.price + cheapestFill(p) > BUDGET) continue;
      pick[t].push(p);
      cost += p.price;
    }
  }
  return [...pick.Platinum, ...pick.Gold, ...pick.Silver];
}

// ── one tournament ────────────────────────────────────────────────────────────────────────────
// Returns { winnerByRound: {round: [{winner, loser}]}, exit: {id: round} }
function playTournament(rng) {
  let alive = BRACKET.slice();
  const matches = {};
  const exit = {};
  for (const round of ROUNDS) {
    const next = [];
    matches[round] = [];
    for (let i = 0; i < alive.length; i += 2) {
      const a = alive[i], b = alive[i + 1];
      const win = rng() < pWin(a, b) ? a : b;
      const lose = win === a ? b : a;
      matches[round].push({ w: win, l: lose });
      exit[lose.id] = round;
      next.push(win);
    }
    alive = next;
  }
  exit[alive[0].id] = 'W';
  return { matches, exit, champion: alive[0] };
}

// ── score a manager over one tournament ───────────────────────────────────────────────────────
// Captain = highest-ranked ALIVE squad member at each round (what a sensible manager does);
// vice = next best alive. Optionally cash in eliminated players at each break and re-sign.
function scoreManager(squad, sim, { transfers }) {
  const { matches, exit } = sim;
  let roster = squad.slice();
  let cash = BUDGET - squad.reduce((s, p) => s + p.price, 0);
  const perRound = {};
  let total = 0;
  const cashedIn = new Set();
  let moves = 0;

  for (let ri = 0; ri < ROUNDS.length; ri++) {
    const round = ROUNDS[ri];
    // leaders of record: best-ranked still-alive players in the roster
    const aliveNow = roster.filter(p => {
      const e = exit[p.id];
      return e === 'W' || ROUNDS.indexOf(e) >= ri;
    }).sort((a, b) => a.rank - b.rank);
    const cap = aliveNow[0], vice = aliveNow[1];

    let got = 0;
    for (const m of matches[round]) {
      if (!roster.includes(m.w)) continue;
      const pts = winPoints(ROUND_POINTS[round], m.w.rank, m.l.rank);
      got += m.w === cap ? pts * CAPTAIN : m.w === vice ? pts * VICE : pts;
    }
    perRound[round] = got;
    total += got;

    // budget recovery at the break: cash in the fallen, sign the best affordable alive player
    if (transfers && ri < ROUNDS.length - 1) {
      for (const p of roster.slice()) {
        const e = exit[p.id];
        if (e === 'W' || ROUNDS.indexOf(e) > ri || cashedIn.has(p.id)) continue;
        const rate = RETURN_RATE[e] ?? 0;
        if (rate === 0 || moves >= TRANSFER_CAP) continue;
        cash += p.price * rate;
        cashedIn.add(p.id);
        // sign the best still-alive player in the same tier we can afford
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
  return { total, perRound, ownsChampion: roster.includes(sim.champion) || squad.includes(sim.champion) };
}

// ── run the league ────────────────────────────────────────────────────────────────────────────
let seed = 12345;
const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

const STRATS = ['chalk', 'value', 'contrarian', 'cheap'];
const managers = Array.from({ length: N_MANAGERS }, (_, i) => {
  const strategy = i < STRATS.length ? STRATS[i] : 'random';
  return { i, strategy, squad: buildSquad(strategy, rng) };
});
// Every simulated squad must be one the server would accept — otherwise the "best drafter" is a cheat.
for (const m of managers) {
  const cost = m.squad.reduce((s, p) => s + p.price, 0);
  const n = (t) => m.squad.filter(p => p.tier === t).length;
  if (m.squad.length !== SQUAD || n('Platinum') !== 2 || n('Gold') !== 3 || n('Silver') !== 5 || cost > BUDGET)
    throw new Error(`illegal squad for ${m.strategy}: ${m.squad.length} players ${n('Platinum')}/${n('Gold')}/${n('Silver')} $${cost}M > $${BUDGET}M`);
}

function runLeague({ transfers }) {
  const stats = managers.map(m => ({
    ...m, wins: 0, totals: [], roundSums: Object.fromEntries(ROUNDS.map(r => [r, 0])),
    champWins: 0, spend: m.squad.reduce((s, p) => s + p.price, 0),
  }));
  let leaderAfterSFwins = 0, decidedByFinal = 0, sumTop = 0, sumMed = 0, sumBot = 0;
  const rankCorrPairs = [];

  for (let run = 0; run < N_RUNS; run++) {
    const sim = playTournament(rng);
    const res = stats.map(s => scoreManager(s.squad, sim, { transfers }));
    res.forEach((r, i) => {
      stats[i].totals.push(r.total);
      for (const rd of ROUNDS) stats[i].roundSums[rd] += r.perRound[rd];
      if (r.ownsChampion) stats[i].champWins++;
    });
    const totals = res.map(r => r.total);
    const best = Math.max(...totals);
    const winners = totals.map((t, i) => (t === best ? i : -1)).filter(i => i >= 0);
    winners.forEach(i => { stats[i].wins += 1 / winners.length; });

    // pre-Final standings vs final standings
    const preF = res.map(r => r.total - r.perRound.F);
    const leadPre = preF.indexOf(Math.max(...preF));
    if (winners.includes(leadPre)) leaderAfterSFwins++;
    else decidedByFinal++;
    rankCorrPairs.push([preF, totals]);

    const sorted = [...totals].sort((a, b) => b - a);
    sumTop += sorted[0]; sumMed += sorted[Math.floor(sorted.length / 2)]; sumBot += sorted[sorted.length - 1];
  }

  // Spearman-ish: correlation between pre-Final score and final score across managers, averaged
  let corr = 0;
  for (const [a, b] of rankCorrPairs) {
    const ma = a.reduce((x, y) => x + y, 0) / a.length, mb = b.reduce((x, y) => x + y, 0) / b.length;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < a.length; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
    if (da > 0 && db > 0) corr += num / Math.sqrt(da * db);
  }
  corr /= rankCorrPairs.length;

  return { stats, leaderAfterSFwins, decidedByFinal, corr, sumTop, sumMed, sumBot };
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
const pct = (n) => `${(n * 100).toFixed(1)}%`;

function report(label, R) {
  const { stats } = R;
  console.log(`\n${'═'.repeat(86)}\n  ${label}\n${'═'.repeat(86)}`);
  console.log('\n  MANAGER OUTCOMES');
  console.log('  strategy      spend   avg pts    sd   league wins   owned champion');
  for (const s of stats) {
    console.log(`  ${s.strategy.padEnd(12)} $${String(s.spend).padStart(3)}M  ${mean(s.totals).toFixed(1).padStart(7)} ${sd(s.totals).toFixed(1).padStart(6)}   ${pct(s.wins / N_RUNS).padStart(7)}       ${pct(s.champWins / N_RUNS).padStart(7)}`);
  }
  const allAvg = stats.map(s => mean(s.totals));
  console.log(`\n  spread of manager averages: best ${Math.max(...allAvg).toFixed(1)} · worst ${Math.min(...allAvg).toFixed(1)} · gap ${(Math.max(...allAvg) - Math.min(...allAvg)).toFixed(1)} pts`);
  console.log(`  typical league: winner ${(R.sumTop / N_RUNS).toFixed(1)} · median ${(R.sumMed / N_RUNS).toFixed(1)} · last ${(R.sumBot / N_RUNS).toFixed(1)}`);

  console.log('\n  WHERE POINTS COME FROM (average per manager, per round)');
  const tot = ROUNDS.reduce((s, r) => s + mean(stats.map(m => m.roundSums[r] / N_RUNS)), 0);
  for (const r of ROUNDS) {
    const v = mean(stats.map(m => m.roundSums[r] / N_RUNS));
    const bar = '█'.repeat(Math.round(v / tot * 60));
    console.log(`  ${r.padEnd(4)} ${v.toFixed(1).padStart(6)} pts  ${String(Math.round(v / tot * 100)).padStart(3)}%  ${bar}`);
  }

  console.log('\n  IS IT DECIDED EARLY OR LATE?');
  console.log(`  leader before the Final goes on to win: ${pct(R.leaderAfterSFwins / N_RUNS)}`);
  console.log(`  the Final flips the league:             ${pct(R.decidedByFinal / N_RUNS)}`);
  console.log(`  correlation pre-Final score → final:    ${R.corr.toFixed(3)}`);
}

// ── draft convergence: do the squads look alike? (built once from the fixed seed) ──────────────
{
  let shared = 0, pairs = 0;
  for (let a = 0; a < managers.length; a++) for (let b = a + 1; b < managers.length; b++) {
    shared += managers[a].squad.filter(p => managers[b].squad.includes(p)).length; pairs++;
  }
  const topPlat = FIELD.filter(p => p.tier === 'Platinum').sort((a, b) => b.price - a.price).slice(0, 2);
  const bothStars = managers.filter(m => topPlat.every(p => m.squad.includes(p))).length;
  const distinct = new Set(managers.flatMap(m => m.squad.map(p => p.id))).size;
  const avgSpend = managers.reduce((s, m) => s + m.squad.reduce((x, p) => x + p.price, 0), 0) / managers.length;
  console.log(`\n  DRAFT CONVERGENCE — ${managers.length} squads: ${distinct} distinct players · two squads share ${(shared / pairs).toFixed(2)} on average · ${bothStars} hold both ${topPlat.map(p => p.name).join(' + ')} · avg spend $${avgSpend.toFixed(1)}M`);
  for (const m of managers.slice(0, STRATS.length))
    console.log(`  ${m.strategy.padEnd(11)} ${m.squad.map(p => `${p.name.split(' ').pop()} ${p.price}`).join(', ')}`);
}

console.log(`\n  Field: ${FIELD.length} draftable · ${ENTRANTS.length} in the ${ROUNDS[0]} bracket${SLAM ? ' (US Open, Format 2 curve)' : ' (Cincinnati, legacy curve)'}`);
console.log(`  League: ${N_MANAGERS} managers · ${N_RUNS.toLocaleString()} simulated tournaments`);
console.log(`  Squad: ${SQUAD} players (2 Platinum / 3 Gold / 5 Silver) · $${BUDGET}M`);
{
  const cheapest = ['Platinum', 'Gold', 'Silver'].reduce((s, t) =>
    s + FIELD.filter(p => p.tier === t).sort((a, b) => a.price - b.price).slice(0, QUOTA[t]).reduce((x, p) => x + p.price, 0), 0);
  const dearest = ['Platinum', 'Gold', 'Silver'].reduce((s, t) =>
    s + FIELD.filter(p => p.tier === t).sort((a, b) => b.price - a.price).slice(0, QUOTA[t]).reduce((x, p) => x + p.price, 0), 0);
  console.log(`  Cheapest legal squad $${cheapest}M · dearest $${dearest}M · headroom under the cap $${BUDGET - cheapest}M`);
}

const A = runLeague({ transfers: false });
report('A · STATIC SQUADS (no cash-in, no transfers)', A);
const B = runLeague({ transfers: true });
report('B · WITH BUDGET RECOVERY (cash in the fallen, re-sign each break)', B);

// ── the headline question: what is the Final actually worth? ───────────────────────────────────
console.log(`\n${'═'.repeat(86)}\n  THE FINAL'S WEIGHT — is ×40 vs ×1 defensible?\n${'═'.repeat(86)}`);
const poolOf = (pts) => ROUNDS.map(r => ({ r, matches: DRAW / 2 / 2 ** ROUNDS.indexOf(r), pool: pts[r] * (DRAW / 2 / 2 ** ROUNDS.indexOf(r)) }));
console.log('\n  round  matches  base  TOTAL POOL  concentration (pts to a single player)');
for (const x of poolOf(ROUND_POINTS)) {
  console.log(`  ${x.r.padEnd(5)}  ${String(x.matches).padStart(7)}  ${String(ROUND_POINTS[x.r]).padStart(4)}  ${String(x.pool).padStart(10)}  ${String(ROUND_POINTS[x.r]).padStart(3)} pts to each of ${x.matches} winner(s)`);
}

// ── budget-recovery sweep: does cashing-in erase the value of drafting well? ────────────────────
console.log(`\n${'═'.repeat(86)}\n  BUDGET RECOVERY — how much does it flatten the league?\n${'═'.repeat(86)}`);
console.log('\n  The "draft skill gap" = average points of the best drafter minus the worst drafter.');
console.log('  A big gap means your draft decides your season. A small gap means it barely matters.\n');
console.log('  refunds            transfer cap   skill gap   winner   median    last   best-vs-worst win share');
const BASE_RATES = { ...RETURN_RATE };
for (const [rlabel, scale] of [['none (0%)', 0], ['half', 0.5], ['current', 1]]) {
  for (const cap of [Infinity, 5, 4, 3, 2]) {
    for (const k of Object.keys(BASE_RATES)) RETURN_RATE[k] = BASE_RATES[k] * scale;
    TRANSFER_CAP = cap;
    const R = runLeague({ transfers: scale > 0 });
    const avgs = R.stats.map(s => mean(s.totals));
    const wins = R.stats.map(s => s.wins / N_RUNS);
    const capL = cap === Infinity ? 'unlimited' : String(cap);
    console.log(`  ${rlabel.padEnd(18)} ${capL.padStart(9)}    ${(Math.max(...avgs) - Math.min(...avgs)).toFixed(1).padStart(8)}  ${(R.sumTop / N_RUNS).toFixed(0).padStart(6)}  ${(R.sumMed / N_RUNS).toFixed(0).padStart(6)}  ${(R.sumBot / N_RUNS).toFixed(0).padStart(6)}   ${pct(Math.max(...wins))} vs ${pct(Math.min(...wins))}`);
    if (scale === 0) break; // no refunds → cap is irrelevant
  }
}
for (const k of Object.keys(BASE_RATES)) RETURN_RATE[k] = BASE_RATES[k];
TRANSFER_CAP = Infinity;

if (TEST_ALT) {
  const CURVES = {
    'current  1·2·5·10·20·40': { R64: 1, R32: 2, R16: 5, QF: 10, SF: 20, F: 40 },
    'flatter  1·2·4·7·12·20':  { R64: 1, R32: 2, R16: 4, QF: 7,  SF: 12, F: 20 },
    'linear   1·2·3·5·8·13':   { R64: 1, R32: 2, R16: 3, QF: 5,  SF: 8,  F: 13 },
    'steeper  1·3·7·15·32·70': { R64: 1, R32: 3, R16: 7, QF: 15, SF: 32, F: 70 },
  };
  console.log(`\n${'═'.repeat(86)}\n  ALTERNATIVE CURVES — effect on how late the league is decided\n${'═'.repeat(86)}`);
  console.log('\n  curve                      leader-before-F wins   Final flips it   pre-F correlation');
  for (const [name, pts] of Object.entries(CURVES)) {
    for (const k of ROUNDS) ROUND_POINTS[k] = pts[k];
    const R = runLeague({ transfers: true });
    console.log(`  ${name.padEnd(26)} ${pct(R.leaderAfterSFwins / N_RUNS).padStart(10)}      ${pct(R.decidedByFinal / N_RUNS).padStart(10)}       ${R.corr.toFixed(3).padStart(8)}`);
  }
  for (const k of ROUNDS) ROUND_POINTS[k] = { R64: 1, R32: 2, R16: 5, QF: 10, SF: 20, F: 40 }[k];
}
console.log('');
