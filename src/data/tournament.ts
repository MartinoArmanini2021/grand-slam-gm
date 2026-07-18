import type { Match, RoundId, TournamentResult } from '../types';
import { getPlayer, PLAYERS } from './players';
import { WIMBLEDON_2026 } from './wimbledon2026';

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

// ── The real Wimbledon 2026 draw (R32 → Final) ──────────────────────────────
// Built from wimbledon2026.ts (Wikipedia-sourced). Names are matched to roster
// ids accent-insensitively; every last-32 participant exists in PLAYERS.
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const ID_BY_NAME = new Map(PLAYERS.map(p => [norm(p.name), p.id]));
export const unmappedBracketNames: string[] = [];
const toId = (name: string): string => {
  const id = ID_BY_NAME.get(norm(name));
  if (!id) { unmappedBracketNames.push(name); return norm(name); }
  return id;
};

export const MATCHES: Match[] = WIMBLEDON_2026.map(m => ({
  id: `${m.round.toLowerCase()}_${m.slot}`,
  round: m.round as RoundId,
  p1Id: toId(m.p1.name),
  p2Id: toId(m.p2.name),
  winnerId: toId(m.winner),
  score: m.score,
}));

export const getMatchesForRound = (round: RoundId) =>
  MATCHES.filter(m => m.round === round);

// Transfer window closes after the semi-finals: the final squad is locked, but a
// QF-round elimination CAN still be replaced for the semis (so the QF refund is
// spendable). ROUNDS index — R32=0, R16=1, QF=2, SF=3, F=4 — so once
// currentRoundIndex reaches 4 (the Final is up next), the squad is locked.
export const TRANSFER_LOCK_INDEX = 4;
export const transfersOpen = (currentRoundIndex: number) => currentRoundIndex < TRANSFER_LOCK_INDEX;

// A player's opponent in a given round (null if they weren't in it).
export function getOpponentId(playerId: string, round: RoundId): string | null {
  const m = MATCHES.find(x => x.round === round && (x.p1Id === playerId || x.p2Id === playerId));
  if (!m) return null;
  return m.p1Id === playerId ? m.p2Id : m.p1Id;
}

// Upset bonus: reward a lower-ranked player for beating a higher-ranked one.
// The bigger the ranking gap, the bigger the bonus (capped at +15).
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

// Exit stage of each result, earliest → latest. Champion ('W') never exits.
const EXIT_STAGE: Record<string, number> = { R128: 0, R64: 1, R32: 2, R16: 3, QF: 4, SF: 5, F: 6, W: 99 };

// The round a player was knocked out in (their real Wimbledon 2026 exit), or
// null for the champion. Pre-R32 exits (R128/R64) are returned as-is for display.
export function getPlayerExit(playerId: string): TournamentResult | null {
  const e = getPlayer(playerId)?.exit;
  return !e || e === 'W' ? null : e;
}

// Is this player eliminated, given which scored rounds (R32→F) have been revealed?
// Their exit stage ≤ the deepest revealed stage → out. Because pre-R32 stages are
// below R32, anyone who fell before the last 32 is out the moment R32 is revealed.
export function isPlayerOut(playerId: string, revealed: RoundId[]): boolean {
  const e = getPlayer(playerId)?.exit;
  if (!e || e === 'W') return false;
  const stage = EXIT_STAGE[e];
  if (stage === undefined) return false;
  const deepest = revealed.reduce((mx, r) => Math.max(mx, EXIT_STAGE[r]), -1);
  return stage <= deepest;
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
