// ── Format simulator: does the FORMAT make player selection matter? ──────────────────────────────
// sim-balance.mjs asks "is the Final too heavy?". This asks the question that actually decides a
// format: if a manager drafts WELL, do they win more than someone drafting at random? A format
// where random beats informed is a lottery with extra steps, however elegant its points curve.
//
//   node scripts/sim-formats.mjs [runs]
//
// Same match model, prices, quotas and scoring engine as sim-balance.mjs (kept deliberately in
// step). Sweeps points curve × squad size × budget and reports, for each:
//   • SKILL EDGE  — win share of the informed archetypes minus the random controls. THE headline.
//   • pts spread  — best archetype's average minus worst. How far apart the format can place people.
//   • late%       — share of points from QF onward. How long the season stays alive.
//   • flip%       — how often the Final overturns the standings.

import { readFileSync } from 'node:fs';

const N_RUNS = Number(process.argv[2]) || 6000;

const ROUNDS = ['R64', 'R32', 'R16', 'QF', 'SF', 'F'];
const CAPTAIN = 2, VICE = 1.5;
const UPSET_HALF = 30;
const upsetMult = (w, l) => (l == null || w <= l ? 1 : 1 + (w - l) / ((w - l) + UPSET_HALF));
const winPoints = (base, w, l) => Math.round(base * upsetMult(w, l));
const tierOf = (r) => (r <= 10 ? 'Platinum' : r <= 25 ? 'Gold' : 'Silver');

// ── field (real Cincinnati entrants + real prices) ───────────────────────────────────────────────
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
  id: p.id, rank: p.ranking, tier: tierOf(p.ranking),
  price: priceFor(p.ranking, p.ytd, p.surface?.hard),
})).sort((a, b) => a.rank - b.rank);
const ENTRANTS = FIELD.slice(0, 64);
function seedOrder(n) { let o = [0]; for (let s = 1; s < n; s *= 2) { const m = s * 2 - 1; o = o.flatMap(x => [x, m - x]); } return o; }
const BRACKET = seedOrder(64).map(i => ENTRANTS[i]);

const K = 0.5;
const pWin = (a, b) => 1 / (1 + Math.exp(-K * (Math.log(b.rank) - Math.log(a.rank))));
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ── squads ───────────────────────────────────────────────────────────────────────────────────────
function buildSquad(strategy, rng, cfg) {
  const { quota, budget } = cfg;
  const pools = {
    Platinum: FIELD.filter(p => p.tier === 'Platinum'),
    Gold: FIELD.filter(p => p.tier === 'Gold'),
    Silver: FIELD.filter(p => p.tier === 'Silver'),
  };
  const order = {
    chalk: (pool) => [...pool].sort((a, b) => a.rank - b.rank),
    value: (pool) => [...pool].sort((a, b) => a.rank / a.price - b.rank / b.price),
    cheap: (pool) => [...pool].sort((a, b) => a.price - b.price),
    contrarian: (pool) => [...pool].sort((a, b) => a.rank - b.rank).slice(3),
    random: (pool) => [...pool].sort(() => rng() - 0.5),
  }[strategy];
  const pick = { Platinum: [], Gold: [], Silver: [] };
  for (const t of ['Platinum', 'Gold', 'Silver']) {
    for (const p of order(pools[t])) if (pick[t].length < quota[t]) pick[t].push(p);
  }
  let squad = [...pick.Platinum, ...pick.Gold, ...pick.Silver];
  let guard = 0;
  while (squad.reduce((s, p) => s + p.price, 0) > budget && guard++ < 200) {
    const swapTier = squad.filter(p => p.tier === 'Silver').length ? 'Silver' : 'Gold';
    const worst = squad.filter(p => p.tier === swapTier).sort((a, b) => b.price - a.price)[0];
    const repl = FIELD.filter(p => p.tier === swapTier && !squad.includes(p)).sort((a, b) => a.price - b.price)[0];
    if (!repl) break;
    squad = squad.map(p => (p === worst ? repl : p));
  }
  return squad;
}

function playTournament(rng) {
  let alive = BRACKET.slice();
  const matches = {}, exit = {};
  for (const round of ROUNDS) {
    const next = [];
    matches[round] = [];
    for (let i = 0; i < alive.length; i += 2) {
      const a = alive[i], b = alive[i + 1];
      const win = rng() < pWin(a, b) ? a : b, lose = win === a ? b : a;
      matches[round].push({ w: win, l: lose });
      exit[lose.id] = round;
      next.push(win);
    }
    alive = next;
  }
  exit[alive[0].id] = 'W';
  return { matches, exit };
}

// Score one manager. Captain/vice = best-ranked still-alive squad members (what a sensible manager
// does), so archetypes differ ONLY by who they drafted — which is exactly what we are measuring.
function scoreManager(squad, sim, curve) {
  const { matches, exit } = sim;
  const perRound = {};
  let total = 0, preFinal = 0;
  for (let ri = 0; ri < ROUNDS.length; ri++) {
    const round = ROUNDS[ri];
    const aliveNow = squad.filter(p => { const e = exit[p.id]; return e === 'W' || ROUNDS.indexOf(e) >= ri; })
      .sort((a, b) => a.rank - b.rank);
    const cap = aliveNow[0], vice = aliveNow[1];
    let got = 0;
    for (const m of matches[round]) {
      if (!squad.includes(m.w)) continue;
      const pts = winPoints(curve[round], m.w.rank, m.l.rank);
      got += m.w === cap ? pts * CAPTAIN : m.w === vice ? pts * VICE : pts;
    }
    perRound[round] = (perRound[round] ?? 0) + got;
    total += got;
    if (round !== 'F') preFinal += got;
  }
  return { total, perRound, preFinal };
}

const INFORMED = ['chalk', 'value', 'contrarian'];   // someone who studied the field
const CONTROL  = ['random', 'random', 'random'];      // someone who did not

function evaluate(cfg, curve) {
  const strategies = [...INFORMED, ...CONTROL];
  const wins = Object.fromEntries(strategies.map((s, i) => [i, 0]));
  const totals = Object.fromEntries(strategies.map((_, i) => [i, []]));
  const roundSum = Object.fromEntries(ROUNDS.map(r => [r, 0]));
  let flips = 0;
  for (let run = 0; run < N_RUNS; run++) {
    const rng = mulberry(run * 2654435761);
    const sim = playTournament(rng);
    const squads = strategies.map(s => buildSquad(s, mulberry(run * 7919 + s.length), cfg));
    const res = squads.map(sq => scoreManager(sq, sim, curve));
    res.forEach((r, i) => { totals[i].push(r.total); for (const rd of ROUNDS) roundSum[rd] += r.perRound[rd] ?? 0; });
    const best = res.reduce((bi, r, i) => (r.total > res[bi].total ? i : bi), 0);
    wins[best]++;
    const bestPre = res.reduce((bi, r, i) => (r.preFinal > res[bi].preFinal ? i : bi), 0);
    if (bestPre !== best) flips++;
  }
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  const avg = strategies.map((_, i) => mean(totals[i]));
  const informedWin = INFORMED.reduce((s, _, i) => s + wins[i], 0) / N_RUNS;
  const controlWin = CONTROL.reduce((s, _, i) => s + wins[INFORMED.length + i], 0) / N_RUNS;
  const totalPts = ROUNDS.reduce((s, r) => s + roundSum[r], 0);
  const late = (roundSum.QF + roundSum.SF + roundSum.F) / totalPts;
  return {
    skillEdge: informedWin - controlWin,
    informedWin, controlWin,
    spread: Math.max(...avg) - Math.min(...avg),
    winnerAvg: mean(strategies.map((_, i) => Math.max(...totals[i]))),
    late, flip: flips / N_RUNS,
    perRound: Object.fromEntries(ROUNDS.map(r => [r, roundSum[r] / totalPts])),
    avgTotal: mean(avg),
  };
}

// ── the sweep ────────────────────────────────────────────────────────────────────────────────────
const CURVES = {
  'A current   1·2·5·10·20·40': { R64: 1, R32: 2, R16: 5, QF: 10, SF: 20, F: 40 },
  'B flatter   1·2·4·8·14·22':  { R64: 1, R32: 2, R16: 4, QF: 8, SF: 14, F: 22 },
  'C early-fat 2·3·5·8·13·20':  { R64: 2, R32: 3, R16: 5, QF: 8, SF: 13, F: 20 },
  'D linear    1·2·3·5·8·13':   { R64: 1, R32: 2, R16: 3, QF: 5, SF: 8, F: 13 },
  'E flat-ish  3·4·6·9·14·20':  { R64: 3, R32: 4, R16: 6, QF: 9, SF: 14, F: 20 },
};
const SQUADS = {
  '10 players (2/3/5) $150M': { quota: { Platinum: 2, Gold: 3, Silver: 5 }, budget: 150 },
  '8 players (2/2/4)  $150M': { quota: { Platinum: 2, Gold: 2, Silver: 4 }, budget: 150 },
  '8 players (2/2/4)  $120M': { quota: { Platinum: 2, Gold: 2, Silver: 4 }, budget: 120 },
  '8 players (1/3/4)  $120M': { quota: { Platinum: 1, Gold: 3, Silver: 4 }, budget: 120 },
};

console.log(`\n  ${N_RUNS.toLocaleString()} simulated tournaments per configuration`);
console.log('  SKILL EDGE = how much more often an informed drafter wins than a random one.');
console.log('  Positive = drafting matters. Near zero or negative = the format is a lottery.\n');

for (const [sName, cfg] of Object.entries(SQUADS)) {
  console.log(`${'═'.repeat(96)}\n  SQUAD: ${sName}\n${'═'.repeat(96)}`);
  console.log('  curve                        SKILL EDGE   informed   random   pts spread   late%   flip%   avg pts');
  for (const [cName, curve] of Object.entries(CURVES)) {
    const r = evaluate(cfg, curve);
    const edge = (r.skillEdge * 100).toFixed(1);
    console.log(
      `  ${cName.padEnd(28)} ${(edge >= 0 ? '+' : '') + edge}%`.padEnd(45) +
      `${(r.informedWin * 100).toFixed(0)}%`.padStart(6) +
      `${(r.controlWin * 100).toFixed(0)}%`.padStart(9) +
      `${r.spread.toFixed(1)}`.padStart(13) +
      `${(r.late * 100).toFixed(0)}%`.padStart(8) +
      `${(r.flip * 100).toFixed(0)}%`.padStart(8) +
      `${r.avgTotal.toFixed(0)}`.padStart(10));
  }
  console.log('');
}
