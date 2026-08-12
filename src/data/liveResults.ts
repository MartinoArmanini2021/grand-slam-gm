// ── Live results: the pure logic ─────────────────────────────────────────────
// Replay mode (Wimbledon) plays a completed draw baked into wimbledon2026.ts. Live
// mode (a real tournament as it happens) can't: the draw's pairings and each result
// arrive over time, from the feed or the admin panel. This module is the pure core
// of that — it takes a live DRAW (pairings) plus the RESULTS recorded so far and
// projects them into the exact shapes the existing scoring engine already consumes:
//
//   • liveMatches()  → engine-shaped Match[] (only completed matches)
//   • roundComplete() → is a round fully resolved (so it can be "played" & scored)?
//   • liveExit()     → the round a player was knocked out in, derived from results
//
// Keeping this pure (no store, no React) makes the whole live pipeline unit-testable
// without a running tournament — the thing a replay can't rehearse.

import type { Match, RoundId, TournamentResult } from '../types';

// A pairing in the live draw. Winners are NOT stored here — an unplayed match is
// simply one with no entry in the results map, which is the whole point: unlike the
// baked replay, "not decided yet" is a real, first-class state.
export interface LiveMatch {
  round: RoundId;
  slot: number;
  half: 'top' | 'bottom';
  p1Id: string;
  p2Id: string;
}

// Recorded outcomes so far: matchKey → winner's player id.
export type LiveResults = Record<string, string>;

// Display info for OFF-roster opponents (id "x_...") who aren't in the draftable field:
// their real (accented) name and flag emoji, pulled from the draw so the bracket shows a
// proper name/flag instead of a placeholder. Roster players carry their own name + flag.
export interface PlayerMeta { name: string; flag?: string }
export type PlayerMetaMap = Record<string, PlayerMeta>;

// A match's set-by-set games, per side (p1 = top of the pairing, p2 = bottom), e.g.
// { p1: ['6','7','6'], p2: ['4','6','3'] } → "6 7 6 / 4 6 3". Empty until the match is played.
export interface MatchScore { p1: string[]; p2: string[] }
export type LiveScores = Record<string, MatchScore>;

// Stable identity for a match within a tournament (round + draw slot).
export const matchKey = (round: RoundId, slot: number): string => `${round}_${slot}`;

// A pairing is only real once BOTH sides are known. While the draw publishes, a pairing can be
// (realPlayer, TBD) — and a stale/legacy result recorded against it must never score. The parser
// no longer produces those, but a browser that recorded one before the fix still carries it in
// persisted localStorage (results are merged, never deleted), so every consumer below re-checks
// here. This is the single chokepoint all client scoring flows through, so the guard heals an
// already-corrupted save instead of needing a data migration.
const TBD_ID = 'tbd';
export const pairingKnown = (m: LiveMatch): boolean => m.p1Id !== TBD_ID && m.p2Id !== TBD_ID;

// Project the live draw + recorded winners into engine-shaped Match[]. A pairing
// with no recorded winner is omitted, so downstream code only ever sees completed
// matches with a real winnerId — preserving the engine's existing contract (a round
// is scored only once it's complete, see roundComplete).
export function liveMatches(draw: LiveMatch[], results: LiveResults): Match[] {
  const out: Match[] = [];
  for (const m of draw) {
    if (!pairingKnown(m)) continue; // half-published pairing → not a played match
    const winnerId = results[matchKey(m.round, m.slot)];
    if (!winnerId) continue;
    out.push({
      id: matchKey(m.round, m.slot),
      round: m.round,
      p1Id: m.p1Id,
      p2Id: m.p2Id,
      winnerId,
      score: '', // live: the score line is optional (the feed may not carry it)
    });
  }
  return out;
}

// A round is complete when every pairing in it has a recorded winner (and there is
// at least one pairing). Live mode gates "play this round" on this: you can't score
// a round the real world hasn't finished.
export function roundComplete(draw: LiveMatch[], results: LiveResults, round: RoundId): boolean {
  const inRound = draw.filter(m => m.round === round);
  // A half-published pairing means the round is NOT complete — counting it as decided (off a
  // phantom result) would let a round be "played"/scored before it has actually finished.
  if (inRound.some(m => !pairingKnown(m))) return false;
  return inRound.length > 0 && inRound.every(m => !!results[matchKey(m.round, m.slot)]);
}

// The round a player was knocked out in, derived from recorded results — or null if
// they've lost no recorded match (still alive, or the champion). A player loses at
// most once, so their single recorded loss is their exit. Replaces the baked
// Player.exit field (which only describes Wimbledon) when running live.
export function liveExit(draw: LiveMatch[], results: LiveResults, playerId: string): TournamentResult | null {
  for (const m of draw) {
    if (!pairingKnown(m)) continue; // can't be knocked out by a match that isn't fully drawn
    if (m.p1Id !== playerId && m.p2Id !== playerId) continue;
    const winnerId = results[matchKey(m.round, m.slot)];
    if (winnerId && winnerId !== playerId) return m.round as TournamentResult;
  }
  return null;
}

// The player a given player faced in a round (null if they weren't in it) — the
// live equivalent of tournament.ts's getOpponentId, off the live draw.
export function liveOpponent(draw: LiveMatch[], playerId: string, round: RoundId): string | null {
  const m = draw.find(x => x.round === round && (x.p1Id === playerId || x.p2Id === playerId));
  if (!m) return null;
  return m.p1Id === playerId ? m.p2Id : m.p1Id;
}
