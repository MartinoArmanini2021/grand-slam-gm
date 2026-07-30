import { PLAYERS, getPlayer } from './players';
import { ROUNDS, getMatchesForRound, getOpponentId, winPoints, getPlayerExit, isPlayerOut, BUDGET_RETURN_RATES, transfersOpen } from './tournament';
import { getTier, type Tier } from './tiers';
import { SQUAD_SIZE, STARTING_BUDGET, TIER_MINIMUMS } from './squadRules';
import { TOURNAMENT } from './tournamentConfig';
import { round1 } from './format';
import type { Player, RoundId, Transfer } from '../types';

// Simulated league managers. Everyone gets the same $100M and can pick ANY
// player (overlaps allowed). Each manager follows a different budget strategy —
// AND reacts to eliminations by transferring in the best still-alive player that
// fits their philosophy, funded by the returned budget (just like you can).

export interface Rival {
  id: string;
  name: string;
  manager: string; // username of the person running the team
  emblem: string;  // club-crest emoji, stands in for their chosen logo
  tag: string;
  color: string;
  rank: (a: Player, b: Player) => number;
}

const BUDGET = STARTING_BUDGET;
const SQUAD = SQUAD_SIZE;
// Season form proxy: year-to-date win rate (0–1). A real, populated signal —
// unlike `form`, which is empty, so strategies must not depend on it.
const ytdRate = (p: Player) => {
  const g = p.ytd.wins + p.ytd.losses;
  return g > 0 ? p.ytd.wins / g : 0;
};
// Strategies weigh the ACTIVE tournament's surface (hard for Montréal), so the rival
// personalities track whatever event is live rather than a fixed surface.
const SURF = TOURNAMENT.surface;
const surf = (p: Player) => p.surface[SURF];

export const RIVALS: Rival[] = [
  { id: 'stars',    name: 'Galácticos FC',   manager: '@carlosdeluxe', emblem: '🌌', tag: 'Stars & scrubs',         color: '#0e6fc4', rank: (a, b) => b.price - a.price },
  { id: 'value',    name: 'Value Vultures',  manager: '@moneyball_m',  emblem: '🦅', tag: `Best ${SURF}-court per $`, color: '#12A150', rank: (a, b) => (surf(b) / b.price) - (surf(a) / a.price) },
  { id: 'grass',    name: 'Baseline Bosses', manager: '@court_king',   emblem: '🎾', tag: `${SURF}-court merchants`,  color: '#37B24D', rank: (a, b) => surf(b) - surf(a) },
  { id: 'form',     name: 'Momentum FC',     manager: '@hot_streak',   emblem: '🔥', tag: 'Chasing hot form',        color: '#E5472B', rank: (a, b) => (ytdRate(b) - ytdRate(a)) || (surf(b) - surf(a)) },
  { id: 'balanced', name: 'The Allrounders', manager: '@steady_eddie', emblem: '⚖️', tag: 'Balanced build',          color: '#D99A00', rank: (a, b) => balancedScore(b) - balancedScore(a) },
];

function balancedScore(p: Player) {
  return surf(p) + ytdRate(p) * 25 - Math.abs(p.price - 12) * 2;
}

// Greedy squad build that follows the strategy order while always keeping a legal
// squad reachable: it never spends so much it can't afford to complete the tier
// minimums (≥4 Silver, ≥2 Gold), and reserves the final slots for any still-unmet
// minimum. So Galácticos still splurges — but on a legal, balanced eight.
export function buildSquad(rank: (a: Player, b: Player) => number): string[] {
  const ranked = [...PLAYERS].sort(rank);
  const byPrice = [...PLAYERS].sort((a, b) => a.price - b.price);
  const need: Record<Tier, number> = { Platinum: 0, Gold: 0, Silver: 0 };
  for (const { tier, min } of TIER_MINIMUMS) need[tier] = min;

  // Cheapest way to fill `slots` more players, still meeting `needLeft` per tier,
  // avoiding `owned`. Returns Infinity if it can't be done.
  const cheapestCompletion = (owned: Set<string>, slots: number, needLeft: Record<Tier, number>) => {
    const used = new Set(owned);
    let cost = 0, filled = 0;
    for (const { tier } of TIER_MINIMUMS) {
      for (let k = 0; k < needLeft[tier]; k++) {
        const pick = byPrice.find(p => !used.has(p.id) && getTier(p.ranking) === tier);
        if (!pick) return Infinity;
        used.add(pick.id); cost += pick.price; filled++;
      }
    }
    for (; filled < slots; filled++) {
      const pick = byPrice.find(p => !used.has(p.id));
      if (!pick) return Infinity;
      used.add(pick.id); cost += pick.price;
    }
    return cost;
  };

  const squad: Player[] = [];
  const owned = new Set<string>();
  let spent = 0;
  for (const p of ranked) {
    if (squad.length === SQUAD) break;
    if (owned.has(p.id)) continue;
    const tier = getTier(p.ranking);
    const slotsLeft = SQUAD - squad.length;
    const sumNeed = TIER_MINIMUMS.reduce((s, { tier: t }) => s + need[t], 0);
    // If every remaining slot is spoken for by a minimum, only take needed tiers.
    if (slotsLeft <= sumNeed && need[tier] <= 0) continue;
    const needAfter = { ...need }; if (needAfter[tier] > 0) needAfter[tier]--;
    const completion = cheapestCompletion(new Set([...owned, p.id]), slotsLeft - 1, needAfter);
    if (spent + p.price + completion <= BUDGET) {
      squad.push(p); owned.add(p.id); spent += p.price;
      if (need[tier] > 0) need[tier]--;
    }
  }
  return squad.map(p => p.id);
}

// Did a player win their match in a given round — read LIVE from recorded results
// (dynamic, not baked): before a round is played there are no matches, so no wins.
const playerWon = (id: string, roundId: RoundId) =>
  getMatchesForRound(roundId).some(m => m.winnerId === id);

// A manager captains their star — the priciest still-alive player they drafted —
// declared BEFORE the round, no hindsight (the same pre-commit discipline the human
// plays under; the human may additionally captain a mid-tournament buy, a small
// edge in their favour). Doubled only if that player wins. `preferred` (the original
// draft) is captained ahead of any panic-buy, so reacting never costs the captaincy;
// falls back to any alive player, then anyone.
function captainOf(squad: string[], aliveAtStart: (id: string) => boolean, preferred?: string[]): string | undefined {
  const priciest = (ids: string[]) => ids.slice().sort((a, b) => getPlayer(b).price - getPlayer(a).price)[0];
  const pool = preferred ?? squad;
  const aliveOriginal = pool.filter(id => squad.includes(id) && aliveAtStart(id));
  if (aliveOriginal.length) return priciest(aliveOriginal);
  const aliveAny = squad.filter(aliveAtStart);
  return priciest(aliveAny.length ? aliveAny : squad);
}

function scoreRound(squad: string[], round: { id: RoundId; points: number }, captain: string | undefined): number {
  let roundTotal = 0, captainBonus = 0;
  for (const id of squad) {
    if (!playerWon(id, round.id)) continue;
    const opp = getOpponentId(id, round.id);
    const gross = opp ? winPoints(round.id, id, opp) : round.points;
    roundTotal += gross;
    if (id === captain) captainBonus = gross; // captain wins → doubled
  }
  return roundTotal + captainBonus;
}

// Score a fixed squad over the rounds played so far — same pre-declared captaincy
// as the human (priciest alive player each round). Kept for reference/tests; the
// live league uses the transfer-aware simulateRival below.
export function scoreSquad(squadIds: string[], uptoRoundIndex: number): number {
  let total = 0;
  for (let i = 0; i < uptoRoundIndex; i++) {
    const revealedBefore = ROUNDS.slice(0, i).map(r => r.id) as RoundId[];
    const alive = (id: string) => !isPlayerOut(id, revealedBefore);
    total += scoreRound(squadIds, ROUNDS[i], captainOf(squadIds, alive));
  }
  return total;
}

const retAmount = (price: number, exit: RoundId) => round1(price * BUDGET_RETURN_RATES[exit]);

export interface RivalTeam {
  rival: Rival;
  squad: string[];        // current squad at the simulated round
  initialSquad: string[]; // the drafted squad
  budget: number;         // budget remaining
  spent: number;          // total gross outlay (draft + transfers)
  bought: number;         // total players purchased over the tournament
  captainId: string;
  score: number;
  transfers: Transfer[];
}

// Simulate a manager through `upto` rounds: score each round, bank returns from
// eliminated players, then transfer in the best affordable still-alive player.
export function simulateRival(rival: Rival, upto: number): RivalTeam {
  const initialSquad = buildSquad(rival.rank);
  let squad = [...initialSquad];
  let spent = initialSquad.reduce((s, id) => s + getPlayer(id).price, 0);
  let budget = BUDGET - spent;
  let score = 0;
  const transfers: Transfer[] = [];

  for (let i = 0; i < upto; i++) {
    const round = ROUNDS[i];
    const revealedBefore = ROUNDS.slice(0, i).map(r => r.id) as RoundId[];

    // 1) score this round with a pre-declared captain (priciest alive drafted
    //    player), doubled only if they win — the same rule the human plays under.
    score += scoreRound(squad, round, captainOf(squad, id => !isPlayerOut(id, revealedBefore), initialSquad));

    // 2) bank budget returns for players eliminated in this round (once, in the
    //    round of their loss — matching the human refund logic exactly).
    for (const id of squad) {
      if (getPlayerExit(id) === round.id) budget += retAmount(getPlayer(id).price, round.id);
    }

    // 3) transfer: replace eliminated slots with the best affordable alive player —
    //    but only while the window is open (closes after the QF, i.e. before the SF)
    if (transfersOpen(i + 1)) {
      const revealed = ROUNDS.slice(0, i + 1).map(r => r.id) as RoundId[];
      const alive = (id: string) => !isPlayerOut(id, revealed);
      for (let idx = 0; idx < squad.length; idx++) {
        if (alive(squad[idx])) continue;
        const owned = new Set(squad);
        const pick = PLAYERS
          .filter(p => !owned.has(p.id) && alive(p.id) && p.price <= budget)
          .sort(rival.rank)[0];
        if (pick) {
          transfers.push({ out: squad[idx], in: pick.id, round: round.id });
          budget = round1(budget - pick.price);
          spent = round1(spent + pick.price);
          squad[idx] = pick.id;
        }
      }
    }
  }

  // Displayed captain = the one they'd double next round (priciest alive), so the
  // UI matches how they actually score.
  const revealedNow = ROUNDS.slice(0, upto).map(r => r.id) as RoundId[];
  const captainId = captainOf(squad, id => !isPlayerOut(id, revealedNow), initialSquad) ?? squad[0];
  const bought = initialSquad.length + transfers.length;
  return { rival, squad, initialSquad, budget, spent, bought, captainId, score, transfers };
}

const cache = new Map<number, RivalTeam[]>();
export function getRivalTeams(uptoRoundIndex: number): RivalTeam[] {
  if (!cache.has(uptoRoundIndex)) {
    cache.set(uptoRoundIndex, RIVALS.map(r => simulateRival(r, uptoRoundIndex)));
  }
  return cache.get(uptoRoundIndex)!;
}
