import { PLAYERS, getPlayer } from './players';
import { ROUNDS, MATCHES, getOpponentId, winPoints, getPlayerExit, isPlayerOut, BUDGET_RETURN_RATES, transfersOpen } from './tournament';
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

const BUDGET = 100;
const SQUAD = 8;
// Season form proxy: year-to-date win rate (0–1). A real, populated signal —
// unlike `form`, which is empty, so strategies must not depend on it.
const ytdRate = (p: Player) => {
  const g = p.ytd.wins + p.ytd.losses;
  return g > 0 ? p.ytd.wins / g : 0;
};

export const RIVALS: Rival[] = [
  { id: 'stars',    name: 'Galácticos FC',   manager: '@carlosdeluxe', emblem: '🌌', tag: 'Stars & scrubs',        color: '#0e6fc4', rank: (a, b) => b.price - a.price },
  { id: 'value',    name: 'Value Vultures',  manager: '@moneyball_m',  emblem: '🦅', tag: 'Best grass per $',      color: '#12A150', rank: (a, b) => (b.surface.grass / b.price) - (a.surface.grass / a.price) },
  { id: 'grass',    name: 'Grass Gods',      manager: '@sw19_sam',     emblem: '🌱', tag: 'Grass-court merchants',  color: '#37B24D', rank: (a, b) => b.surface.grass - a.surface.grass },
  { id: 'form',     name: 'Momentum FC',     manager: '@hot_streak',   emblem: '🔥', tag: 'Chasing hot form',      color: '#E5472B', rank: (a, b) => (ytdRate(b) - ytdRate(a)) || (b.surface.grass - a.surface.grass) },
  { id: 'balanced', name: 'The Allrounders', manager: '@steady_eddie', emblem: '⚖️', tag: 'Balanced build',        color: '#D99A00', rank: (a, b) => balancedScore(b) - balancedScore(a) },
];

function balancedScore(p: Player) {
  return p.surface.grass + ytdRate(p) * 25 - Math.abs(p.price - 12) * 2;
}

// Greedy squad build: follow the strategy order but always keep 6 affordable.
export function buildSquad(rank: (a: Player, b: Player) => number): string[] {
  const ranked = [...PLAYERS].sort(rank);
  const squad: Player[] = [];
  let spent = 0;
  for (const p of ranked) {
    if (squad.length === SQUAD) break;
    const slotsAfter = SQUAD - squad.length - 1;
    const cheapestRest = ranked
      .filter(x => x !== p && !squad.includes(x))
      .map(x => x.price).sort((a, b) => a - b)
      .slice(0, slotsAfter).reduce((s, v) => s + v, 0);
    if (spent + p.price + cheapestRest <= BUDGET) { squad.push(p); spent += p.price; }
  }
  return squad.map(p => p.id);
}

// Rounds each player won (for scoring).
const wonRounds = new Map<string, Set<string>>();
for (const m of MATCHES) {
  if (!wonRounds.has(m.winnerId)) wonRounds.set(m.winnerId, new Set());
  wonRounds.get(m.winnerId)!.add(m.round);
}
const playerWon = (id: string, roundId: RoundId) => wonRounds.get(id)?.has(roundId) ?? false;

// A manager captains their star — the priciest still-alive player they drafted —
// declared BEFORE the round, no hindsight, exactly the constraint the human plays
// under. Doubled only if that player wins. `preferred` (their original draft) is
// captained ahead of any mid-tournament panic-buy, so reacting never costs the
// captaincy; falls back to any alive player, then anyone.
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

const retAmount = (price: number, exit: RoundId) =>
  Math.round(price * (BUDGET_RETURN_RATES[exit] ?? 0) * 10) / 10;

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
          budget = Math.round((budget - pick.price) * 10) / 10;
          spent = Math.round((spent + pick.price) * 10) / 10;
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
