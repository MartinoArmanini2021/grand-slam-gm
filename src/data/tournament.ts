import type { Match, RoundId, TournamentResult } from '../types';
import { findPlayer, PLAYERS } from './players';
import { WIMBLEDON_2026, WIMBLEDON_2026_EARLY } from './wimbledon2026';
import { TOURNAMENT, ROUND_META, ROUND_ORDER } from './tournamentConfig';

// Tournament identity + per-surface theming now live in ./tournamentConfig.

// The active tournament's rounds, in order — derived from which rounds it plays
// (TOURNAMENT.rounds) and the shared, one-curve-per-round-name metadata. Adding a
// tournament with a different round count (a Masters draw) needs no change here.
export const ROUNDS: { id: RoundId; label: string; short: string; points: number }[] =
  TOURNAMENT.rounds.map(id => ({ id, ...ROUND_META[id] }));

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

// The whole draw is now scored — R128 → Final. Early-round opponents who aren't
// in the 52-player roster map to a synthetic id (they're never drafted); scoring
// tolerates that (see winPoints/upsetBonus, which use the safe findPlayer).
export const MATCHES: Match[] = [...WIMBLEDON_2026_EARLY, ...WIMBLEDON_2026].map(m => ({
  id: `${m.round.toLowerCase()}_${m.slot}`,
  round: m.round as RoundId,
  p1Id: toId(m.p1.name),
  p2Id: toId(m.p2.name),
  winnerId: toId(m.winner),
  score: m.score,
}));

export const getMatchesForRound = (round: RoundId) =>
  MATCHES.filter(m => m.round === round);

// Transfer window closes when the last round is up next: the final squad is locked,
// but the penultimate-round elimination CAN still be replaced (so its refund is
// spendable). Derived as the index of the last round — for a 7-round Slam that's 6
// (R128=0 … F=6), so once currentRoundIndex reaches it (the Final is up next), the
// squad is locked. A shorter Masters draw locks proportionally later in its own list.
export const TRANSFER_LOCK_INDEX = ROUNDS.length - 1;
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
  // findPlayer (not getPlayer) — an early-round opponent may be off-roster and
  // have no ranking; treat that as "no upset" rather than throwing.
  const w = findPlayer(winnerId)?.ranking;
  const l = findPlayer(loserId)?.ranking;
  if (!w || !l || w <= l) return 0; // winner is equal/higher-ranked → no upset
  return Math.min(15, Math.round((w - l) * 0.4));
}

// A win by a lower-ranked player is worth a little more; a top seed winning is
// "expected" and worth a little less. Rank 1 → ×0.8, rank ~40 → ×1.3. The spread
// is deliberately mild: expected points must still rise with a player's strength,
// so a favourite is worth drafting and the budget is a real trade-off. (A wider
// spread made cheap underdogs strictly the best value in expectation — see the
// Monte-Carlo pricing study.)
export function rankingMultiplier(rank: number): number {
  const r = Math.max(1, Math.min(40, rank));
  return 0.8 + 0.5 * ((r - 1) / 39);
}

// Total points a player earns for winning a match: round stakes scaled by the
// winner's ranking, plus an upset bonus — but the upset is capped by the round's
// importance (≤ 1.5× its base), so a first-round shock can never out-earn a deep
// run. Early upsets are small; a giant-killing in the QF/SF is worth real points.
export function winPoints(roundId: RoundId, winnerId: string, loserId: string): number {
  const base = ROUNDS.find(r => r.id === roundId)?.points ?? 0;
  const wRank = findPlayer(winnerId)?.ranking ?? 40;
  const upset = Math.min(upsetBonus(winnerId, loserId), Math.round(base * 1.5));
  return Math.round(base * rankingMultiplier(wRank)) + upset;
}

// Exit stage of each result, earliest → latest. Champion ('W') never exits.
// DNS (did not start) → out from the very beginning; W (champion) → never out.
// The middle stages come from the canonical round ordering, so an exit's rank is
// well-defined regardless of which subset of rounds this tournament scores.
const EXIT_STAGE: Record<string, number> = {
  DNS: -1,
  ...Object.fromEntries(ROUND_ORDER.map((r, i) => [r, i])),
  W: 99,
};

// The round a player was knocked out in (their real Wimbledon 2026 exit), or
// null for the champion. Pre-R32 exits (R128/R64) are returned as-is for display.
export function getPlayerExit(playerId: string): TournamentResult | null {
  const e = findPlayer(playerId)?.exit;
  return !e || e === 'W' ? null : e;
}

// Is this player eliminated, given which scored rounds (R32→F) have been revealed?
// Their exit stage ≤ the deepest revealed stage → out. Because pre-R32 stages are
// below R32, anyone who fell before the last 32 is out the moment R32 is revealed.
export function isPlayerOut(playerId: string, revealed: RoundId[]): boolean {
  const e = findPlayer(playerId)?.exit;
  if (!e || e === 'W') return false;
  const stage = EXIT_STAGE[e];
  if (stage === undefined) return false;
  const deepest = revealed.reduce((mx, r) => Math.max(mx, EXIT_STAGE[r]), -1);
  return stage <= deepest;
}

// Points returned when eliminated (based on how far they reached).
// Refunds only arrive while you can still spend them: the window stays open
// through the QF (a QF loser can be replaced for the SF), then locks — so SF and
// Final eliminations return nothing.
// A meaningful chunk of an eliminated player's price comes back, rising with how
// far they reached — enough that losing, say, a Gold pick funds a Silver-tier
// replacement rather than a token refund. Deep exits (QF ≈ two-thirds back) reward
// players who nearly went the distance. SF/Final return nothing: the window is
// shut, so there'd be nothing to spend it on.
export const BUDGET_RETURN_RATES: Record<RoundId, number> = {
  R128: 0.40,
  R64:  0.45,
  R32:  0.50,
  R16:  0.60,
  QF:   0.70,
  SF:   0,
  F:    0,
};
