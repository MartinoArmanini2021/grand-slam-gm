// Backtest engine — runs the exact fantasy economy over REAL Grand Slam results.
// Scores from each player's finishing round (which of the last five rounds they
// won), plus upset bonuses reconstructed from the late-round bracket.

import { ROUNDS, BUDGET_RETURN_RATES } from './tournament';
import type { RoundId } from '../types';

export type ExitRound = 'W' | 'F' | 'SF' | 'QF' | 'R16' | 'R32' | 'R64' | 'R128';

export interface BacktestSeed {
  seed: number;
  name: string;
  atpRank: number | null;
  exit: ExitRound;
}

export interface BacktestMatch { p1: string; p2: string; winner: string; }

export interface BacktestSlam {
  slam: string;
  year: number;
  surface: 'hard' | 'clay' | 'grass';
  seeds: BacktestSeed[];
  bracket: { QF: BacktestMatch[]; SF: BacktestMatch[]; F: BacktestMatch };
}

// How deep a finishing round reaches, in "last-32 rounds cleared" terms.
// A player who reached the QF cleared R32 + R16 (2 wins in our 5-round window).
const REACHED: Record<ExitRound, number> = {
  R128: 0, R64: 0, R32: 0, // out at/before the last 32 → 0 of our rounds won
  R16: 1,  // won R32
  QF: 2,   // won R32, R16
  SF: 3,   // + QF
  F: 4,    // + SF
  W: 5,    // + F (won all five)
};

const ROUND_ORDER: RoundId[] = ['R32', 'R16', 'QF', 'SF', 'F'];

// Our fantasy price by seed (steep curve, mirrors the live game by ranking).
export const PRICE_BY_SEED: Record<number, number> = {
  1: 48, 2: 44, 3: 38, 4: 35, 5: 31, 6: 28,
  7: 24, 8: 22, 9: 20, 10: 19, 11: 18, 12: 17, 13: 16, 14: 15, 15: 14, 16: 13,
  17: 12, 18: 11, 19: 11, 20: 10, 21: 9, 22: 9, 23: 8, 24: 8,
  25: 7, 26: 7, 27: 6, 28: 6, 29: 5, 30: 5, 31: 5, 32: 4,
};
export const priceForSeed = (seed: number) => PRICE_BY_SEED[seed] ?? 4;

// Reconstruct the beaten opponent's seed for a given winner in a late round,
// so we can grant upset bonuses (bigger seed number beaten = bigger upset).
function upsetForWin(slam: BacktestSlam, name: string, round: RoundId, seedOf: (n: string) => number | null): number {
  let match: BacktestMatch | undefined;
  if (round === 'F') match = slam.bracket.F;
  else if (round === 'SF') match = slam.bracket.SF.find(m => m.winner === name);
  else if (round === 'QF') match = slam.bracket.QF.find(m => m.winner === name);
  if (!match || match.winner !== name) return 0; // no bracket detail (R32/R16) → no bonus
  const loser = match.p1 === name ? match.p2 : match.p1;
  const ws = seedOf(name), ls = seedOf(loser);
  if (ws == null || ls == null || ws <= ls) return 0; // winner higher-seeded → no upset
  return Math.min(12, Math.round((ws - ls) * 0.4));
}

export interface PlayerScore {
  seed: number;
  name: string;
  price: number;
  exit: ExitRound;
  base: number;      // round-win points
  upset: number;     // upset bonuses
  total: number;     // base + upset (before captaincy)
  valuePerM: number; // total / price
}

export function scoreSlam(slam: BacktestSlam): PlayerScore[] {
  const seedOf = (n: string) => slam.seeds.find(s => s.name === n)?.seed ?? null;
  return slam.seeds.map(s => {
    const reached = REACHED[s.exit];
    let base = 0, upset = 0;
    for (let i = 0; i < reached; i++) {
      const round = ROUNDS[i];
      base += round.points;
      upset += upsetForWin(slam, s.name, ROUND_ORDER[i], seedOf);
    }
    const price = priceForSeed(s.seed);
    const total = base + upset;
    return { seed: s.seed, name: s.name, price, exit: s.exit, base, upset, total, valuePerM: total / price };
  });
}

// Budget returned when a player is eliminated — same rates as the live game,
// keyed by the round they exited in. Champions ('W') and players who fell before
// the last 32 (R64/R128) return nothing.
export function budgetReturn(price: number, exit: ExitRound): number {
  const rate = (BUDGET_RETURN_RATES as Record<string, number>)[exit];
  return rate ? Math.round(price * rate * 10) / 10 : 0;
}

// Build the best legal $100M / 6-player squad by total points (0/1 knapsack-ish
// greedy on value, then fill), plus a few archetype squads for comparison.
const BUDGET = 100, SQUAD = 6;

function pick(scores: PlayerScore[], rankFn: (a: PlayerScore, b: PlayerScore) => number): PlayerScore[] {
  const ranked = [...scores].sort(rankFn);
  const squad: PlayerScore[] = [];
  let spent = 0;
  for (const p of ranked) {
    if (squad.length === SQUAD) break;
    const slotsAfter = SQUAD - squad.length - 1;
    const cheapestRest = ranked.filter(x => x !== p && !squad.includes(x))
      .map(x => x.price).sort((a, b) => a - b).slice(0, slotsAfter).reduce((s, v) => s + v, 0);
    if (spent + p.price + cheapestRest <= BUDGET) { squad.push(p); spent += p.price; }
  }
  return squad;
}

export interface SquadResult { label: string; players: PlayerScore[]; spent: number; score: number; }

function withCaptain(players: PlayerScore[]): number {
  // Best single player's total is doubled (optimal captain over the whole run).
  const base = players.reduce((s, p) => s + p.total, 0);
  const best = players.reduce((m, p) => Math.max(m, p.total), 0);
  return base + best;
}

// Exactly-k 0/1 knapsack: pick k players with price sum <= budget maximizing
// total points. Returns the chosen players (or null if infeasible).
function knapExact(pool: PlayerScore[], k: number, budget: number): { sum: number; spent: number; players: PlayerScore[] } | null {
  if (budget < 0) return null;
  type Cell = { sum: number; items: number[] } | null;
  const dp: Cell[][] = Array.from({ length: k + 1 }, () => Array<Cell>(budget + 1).fill(null));
  dp[0][0] = { sum: 0, items: [] };
  for (let idx = 0; idx < pool.length; idx++) {
    const p = pool[idx];
    for (let c = k - 1; c >= 0; c--) {
      for (let b = 0; b + p.price <= budget; b++) {
        const cur = dp[c][b];
        if (!cur) continue;
        const nb = b + p.price, ns = cur.sum + p.total;
        const tgt = dp[c + 1][nb];
        if (!tgt || ns > tgt.sum) dp[c + 1][nb] = { sum: ns, items: [...cur.items, idx] };
      }
    }
  }
  let best: { sum: number; spent: number; items: number[] } | null = null;
  for (let b = 0; b <= budget; b++) {
    const cell = dp[k][b];
    if (cell && (!best || cell.sum > best.sum)) best = { sum: cell.sum, spent: b, items: cell.items };
  }
  return best ? { sum: best.sum, spent: best.spent, players: best.items.map(i => pool[i]) } : null;
}

// True optimal $100M / 6-player squad maximizing points + captain double.
// The captain is the squad's best player, so we fix each candidate captain and
// knapsack the other five (restricted to no-better players to avoid double count).
function optimalSquad(scores: PlayerScore[]): { players: PlayerScore[]; spent: number; score: number } {
  let best: { players: PlayerScore[]; spent: number; score: number } | null = null;
  scores.forEach((cap, ci) => {
    const pool = scores.filter((p, i) => i !== ci && (p.total < cap.total || (p.total === cap.total && i > ci)));
    const rest = knapExact(pool, SQUAD - 1, BUDGET - cap.price);
    if (!rest) return;
    const score = rest.sum + cap.total * 2; // others + captain counted twice
    if (!best || score > best.score) best = { players: [cap, ...rest.players], spent: cap.price + rest.spent, score };
  });
  return best ?? { players: [], spent: 0, score: 0 };
}

export function analyzeSlam(slam: BacktestSlam) {
  const scores = scoreSlam(slam);
  const byPoints = [...scores].sort((a, b) => b.total - a.total);
  const byValue = [...scores].filter(s => s.total > 0).sort((a, b) => b.valuePerM - a.valuePerM);

  const opt = optimalSquad(scores);
  const squads: SquadResult[] = [
    { label: 'Optimal XI', players: opt.players, spent: opt.spent, score: opt.score },
    mk('Stars & scrubs', pick(scores, (a, b) => b.price - a.price)),
    mk('Value hunters', pick(scores, (a, b) => b.valuePerM - a.valuePerM)),
    mk('Balanced', pick(scores, (a, b) => (b.total - Math.abs(b.price - 14)) - (a.total - Math.abs(a.price - 14)))),
  ];

  function mk(label: string, players: PlayerScore[]): SquadResult {
    return { label, players, spent: players.reduce((s, p) => s + p.price, 0), score: withCaptain(players) };
  }

  const champion = scores.find(s => s.exit === 'W');
  return { scores, byPoints, byValue, squads, champion };
}
