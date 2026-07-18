import type { Match, RoundId } from '../types';
import { getPlayer } from './players';

export const TOURNAMENT = {
  id: 'wimbledon_2026',
  name: 'Wimbledon',
  location: 'London, UK',
  surface: 'grass' as const,
  year: 2026,
  startDate: 'Jun 29',
  endDate: 'Jul 13',
};

export const ROUNDS: { id: RoundId; label: string; short: string; points: number }[] = [
  { id: 'R32', label: 'Round of 32', short: 'R32', points: 2 },
  { id: 'R16', label: 'Round of 16', short: 'R16', points: 5 },
  { id: 'QF',  label: 'Quarter-Final', short: 'QF',  points: 10 },
  { id: 'SF',  label: 'Semi-Final', short: 'SF',  points: 20 },
  { id: 'F',   label: 'Final', short: 'F',   points: 40 },
];

// Pre-determined bracket outcomes
export const MATCHES: Match[] = [
  // R32 — top half
  { id: 'r32_1',  round: 'R32', p1Id: 'alcaraz',         p2Id: 'thompson',        winnerId: 'alcaraz',   score: '6-3, 6-2, 7-5' },
  { id: 'r32_2',  round: 'R32', p1Id: 'musetti',          p2Id: 'korda',           winnerId: 'korda',     score: '3-6, 7-5, 6-4, 7-5' },
  { id: 'r32_3',  round: 'R32', p1Id: 'rublev',           p2Id: 'eubanks',         winnerId: 'eubanks',   score: '4-6, 7-6, 6-3, 6-4' },
  { id: 'r32_4',  round: 'R32', p1Id: 'rune',             p2Id: 'cobolli',         winnerId: 'rune',      score: '6-3, 6-4, 6-2' },
  { id: 'r32_5',  round: 'R32', p1Id: 'fritz',            p2Id: 'davidovich',      winnerId: 'fritz',     score: '6-4, 7-5, 6-3' },
  { id: 'r32_6',  round: 'R32', p1Id: 'hurkacz',          p2Id: 'lehecka',         winnerId: 'hurkacz',   score: '7-5, 6-4, 7-6' },
  { id: 'r32_7',  round: 'R32', p1Id: 'djokovic',         p2Id: 'vandezandschulp', winnerId: 'djokovic',  score: '6-2, 6-3, 7-5' },
  { id: 'r32_8',  round: 'R32', p1Id: 'kyrgios',          p2Id: 'khachanov',       winnerId: 'kyrgios',   score: '7-6, 7-5, 6-4' },
  // R32 — bottom half
  { id: 'r32_9',  round: 'R32', p1Id: 'sinner',           p2Id: 'nakashima',       winnerId: 'sinner',    score: '6-1, 6-3, 6-4' },
  { id: 'r32_10', round: 'R32', p1Id: 'tiafoe',           p2Id: 'draper',          winnerId: 'draper',    score: '5-7, 6-4, 7-5, 6-4' },
  { id: 'r32_11', round: 'R32', p1Id: 'ruud',             p2Id: 'berrettini',      winnerId: 'berrettini',score: '4-6, 6-4, 7-5, 6-3' },
  { id: 'r32_12', round: 'R32', p1Id: 'paul',             p2Id: 'fils',            winnerId: 'paul',      score: '6-3, 6-4, 7-5' },
  { id: 'r32_13', round: 'R32', p1Id: 'medvedev',         p2Id: 'sonego',          winnerId: 'medvedev',  score: '6-4, 6-2, 7-5' },
  { id: 'r32_14', round: 'R32', p1Id: 'shelton',          p2Id: 'deminaur',        winnerId: 'deminaur',  score: '6-4, 7-6, 3-6, 7-5' },
  { id: 'r32_15', round: 'R32', p1Id: 'zverev',           p2Id: 'bautistaagut',    winnerId: 'zverev',    score: '6-4, 6-3, 7-6' },
  { id: 'r32_16', round: 'R32', p1Id: 'dimitrov',         p2Id: 'tsitsipas',       winnerId: 'dimitrov',  score: '6-3, 6-4, 6-2' },

  // R16
  { id: 'r16_1', round: 'R16', p1Id: 'alcaraz',   p2Id: 'korda',      winnerId: 'alcaraz',    score: '6-3, 7-5, 6-4' },
  { id: 'r16_2', round: 'R16', p1Id: 'eubanks',   p2Id: 'rune',       winnerId: 'rune',       score: '3-6, 7-5, 6-4, 4-6, 6-3' },
  { id: 'r16_3', round: 'R16', p1Id: 'fritz',     p2Id: 'hurkacz',    winnerId: 'hurkacz',    score: '6-4, 7-6, 6-3' },
  { id: 'r16_4', round: 'R16', p1Id: 'djokovic',  p2Id: 'kyrgios',    winnerId: 'djokovic',   score: '6-4, 6-3, 7-5' },
  { id: 'r16_5', round: 'R16', p1Id: 'sinner',    p2Id: 'draper',     winnerId: 'sinner',     score: '7-5, 6-4, 6-3' },
  { id: 'r16_6', round: 'R16', p1Id: 'berrettini',p2Id: 'paul',       winnerId: 'berrettini', score: '6-4, 7-5, 6-4' },
  { id: 'r16_7', round: 'R16', p1Id: 'medvedev',  p2Id: 'deminaur',   winnerId: 'deminaur',   score: '6-7, 7-5, 7-6, 7-5' },
  { id: 'r16_8', round: 'R16', p1Id: 'zverev',    p2Id: 'dimitrov',   winnerId: 'zverev',     score: '7-6, 6-4, 6-3' },

  // QF
  { id: 'qf_1', round: 'QF', p1Id: 'alcaraz',    p2Id: 'rune',       winnerId: 'alcaraz',    score: '6-4, 7-6, 6-3' },
  { id: 'qf_2', round: 'QF', p1Id: 'hurkacz',    p2Id: 'djokovic',   winnerId: 'djokovic',   score: '5-7, 7-5, 6-4, 7-5' },
  { id: 'qf_3', round: 'QF', p1Id: 'sinner',     p2Id: 'berrettini', winnerId: 'sinner',     score: '6-4, 6-3, 7-5' },
  { id: 'qf_4', round: 'QF', p1Id: 'deminaur',   p2Id: 'zverev',     winnerId: 'zverev',     score: '3-6, 7-5, 7-6, 6-3' },

  // SF
  { id: 'sf_1', round: 'SF', p1Id: 'alcaraz',  p2Id: 'djokovic', winnerId: 'alcaraz', score: '7-6, 3-6, 7-6, 6-3' },
  { id: 'sf_2', round: 'SF', p1Id: 'sinner',   p2Id: 'zverev',   winnerId: 'zverev',  score: '4-6, 7-6, 6-3, 6-4' },

  // F
  { id: 'f_1', round: 'F', p1Id: 'alcaraz', p2Id: 'zverev', winnerId: 'alcaraz', score: '6-3, 6-4, 7-5' },
];

export const getMatchesForRound = (round: RoundId) =>
  MATCHES.filter(m => m.round === round);

// Transfer window closes after the quarter-finals: no purchases for the semis or
// final. ROUNDS index — R32=0, R16=1, QF=2, SF=3, F=4 — so once currentRoundIndex
// reaches 3 (SF up next), the squad is locked.
export const TRANSFER_LOCK_INDEX = 3;
export const transfersOpen = (currentRoundIndex: number) => currentRoundIndex < TRANSFER_LOCK_INDEX;

// A player's opponent in a given round (null if they weren't in it).
export function getOpponentId(playerId: string, round: RoundId): string | null {
  const m = MATCHES.find(x => x.round === round && (x.p1Id === playerId || x.p2Id === playerId));
  if (!m) return null;
  return m.p1Id === playerId ? m.p2Id : m.p1Id;
}

// Upset bonus: reward a lower-ranked player for beating a higher-ranked one.
// The bigger the ranking gap, the bigger the bonus (capped at +12).
export function upsetBonus(winnerId: string, loserId: string): number {
  const w = getPlayer(winnerId)?.ranking;
  const l = getPlayer(loserId)?.ranking;
  if (!w || !l || w <= l) return 0; // winner is equal/higher-ranked → no upset
  return Math.min(15, Math.round((w - l) * 0.4));
}

// A win by a lower-ranked player is worth more; a top seed winning is "expected"
// and worth less. Rank 1 → ×0.6, rank ~40 → ×1.5.
export function rankingMultiplier(rank: number): number {
  const r = Math.max(1, Math.min(40, rank));
  return 0.6 + 0.9 * ((r - 1) / 39);
}

// Total points a player earns for winning a match: round stakes scaled by the
// winner's ranking (underdogs earn more) plus an upset bonus for beating someone
// ranked above them.
export function winPoints(roundId: RoundId, winnerId: string, loserId: string): number {
  const base = ROUNDS.find(r => r.id === roundId)?.points ?? 0;
  const wRank = getPlayer(winnerId)?.ranking ?? 40;
  return Math.round(base * rankingMultiplier(wRank)) + upsetBonus(winnerId, loserId);
}

// Map player → exit round (null if still in)
export function getPlayerExit(playerId: string): RoundId | null {
  const ROUND_ORDER: RoundId[] = ['R32', 'R16', 'QF', 'SF', 'F'];
  for (const round of ROUND_ORDER) {
    const match = MATCHES.find(
      m => m.round === round && (m.p1Id === playerId || m.p2Id === playerId)
    );
    if (match && match.winnerId !== playerId) return round;
  }
  return null; // winner
}

// Points returned when eliminated (based on how far they reached)
// Refunds only arrive while you can still spend them — the transfer window shuts
// after the QF, so SF/Final eliminations return nothing.
export const BUDGET_RETURN_RATES: Record<RoundId, number> = {
  R32: 0.15,
  R16: 0.25,
  QF:  0.35,
  SF:  0,
  F:   0,
};
