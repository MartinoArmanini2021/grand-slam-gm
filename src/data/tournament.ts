import type { Match, RoundId, TournamentResult } from '../types';
import { findPlayer } from './players';
import { TOURNAMENT, ROUND_META, ROUND_ORDER } from './tournamentConfig';
import { useLiveStore } from '../store/liveStore';
import { liveMatches, liveExit, roundComplete } from './liveResults';

// Tournament identity + per-surface theming now live in ./tournamentConfig.

// The active tournament's rounds, in order — derived from which rounds it plays
// (TOURNAMENT.rounds) and the shared, one-curve-per-round-name metadata. Adding a
// tournament with a different round count (a Masters draw) needs no change here.
export const ROUNDS: { id: RoundId; label: string; short: string; points: number }[] =
  TOURNAMENT.rounds.map(id => ({ id, ...ROUND_META[id] }));

// ── The live tournament's results ────────────────────────────────────────────
// The app is LIVE-only: the draw's pairings and each result arrive over time (from
// the feed / admin panel) into the live store. Until they do there simply are no
// matches — "not decided yet" is a real, first-class state. Every scoring/display
// helper below reads through activeMatches()/rawExit(), so the engine is agnostic to
// how many results have landed.
function activeMatches(): Match[] {
  const { draw, results } = useLiveStore.getState();
  return liveMatches(draw, results);
}

// The round a player was knocked out in, derived from the recorded live results
// (null = still alive, or the champion).
function rawExit(playerId: string): TournamentResult | null {
  const { draw, results } = useLiveStore.getState();
  return liveExit(draw, results, playerId);
}

export const getMatchesForRound = (round: RoundId) =>
  activeMatches().filter(m => m.round === round);

// Transfer window closes when the last round is up next. TRANSFER_LOCK_INDEX = the
// last round's index — for a 7-round Slam that's 6 (R128=0 … F=6). transfersOpen is
// true while currentRoundIndex < that. Concretely: after the QF is played,
// currentRoundIndex is 5 (SF up next) → transfers open, so a QF loser (refunded 0.70)
// CAN be swapped for the SF. After the SF, currentRoundIndex is 6 (Final up next) →
// locked, so an SF loser (0 refund) cannot. So the QF is the last replaceable exit,
// NOT the penultimate (SF). A shorter Masters draw locks proportionally in its list.
export const TRANSFER_LOCK_INDEX = ROUNDS.length - 1;
export const transfersOpen = (currentRoundIndex: number) => currentRoundIndex < TRANSFER_LOCK_INDEX;

// Can the round at this index be played (scored) yet? A round is playable only once
// the real world has finished it. Two guards, because the live draw is published
// INCREMENTALLY by the feed:
//   1. every pairing currently in the draw for this round has a recorded result, AND
//   2. the NEXT round's pairings have been drawn — the feed publishes those as the
//      current round resolves, so their presence proves the current round is fully
//      played, not just partially published. (Without this, a round showing only a
//      few decided pairings would look "complete" and silently drop the points of a
//      still-alive player whose match hasn't been published yet.)
// The final round needs only its own pairing decided. Before the draw exists, nothing
// is playable.
export function roundPlayable(roundIndex: number): boolean {
  const round = ROUNDS[roundIndex];
  if (!round) return false;
  const { draw, results } = useLiveStore.getState();
  if (!roundComplete(draw, results, round.id)) return false;
  const next = ROUNDS[roundIndex + 1];
  return !next || draw.some(m => m.round === next.id);
}

// Has the tournament produced its FIRST result yet? False across the whole pre-tournament
// window — the board uses it to show a "scoring pending" state instead of a wall of 0s that
// reads as broken. Flips true the moment any round has a recorded winner.
export function tournamentStarted(): boolean {
  return ROUNDS.some(r => roundHasResult(r.id));
}

// Has this round produced ANY result yet? Mirrors the server's save_entry captain lock,
// which freezes a round's captain/vice the moment public.matches holds a winner for it.
// The store + the court use this so the UI never invites a captain change the server will
// reject, and the captain-of-record is committed only while the round is still open.
export function roundHasResult(round: RoundId): boolean {
  return getMatchesForRound(round).some(m => !!m.winnerId);
}

// A player's opponent in a given round (null if they weren't in it).
export function getOpponentId(playerId: string, round: RoundId): string | null {
  const m = activeMatches().find(x => x.round === round && (x.p1Id === playerId || x.p2Id === playerId));
  if (!m) return null;
  return m.p1Id === playerId ? m.p2Id : m.p1Id;
}

// Upset bonus: reward a lower-ranked player for beating a higher-ranked one.
// The bigger the ranking gap, the bigger the bonus (capped at +15).
export function upsetBonus(winnerId: string, loserId: string): number {
  // Symmetric with the server engine (serverEngine.ts / recompute-score): an unknown
  // WINNER — which never happens in practice, since squad winners are always rostered —
  // defaults to a neutral rank 40; an unknown LOSER (an off-roster early-round opponent)
  // yields NO upset, because we can't know it was one. findPlayer (not getPlayer) so a
  // missing id never throws.
  const w = findPlayer(winnerId)?.ranking ?? 40;
  const l = findPlayer(loserId)?.ranking;
  if (l == null || w <= l) return 0; // unknown loser, or winner equal/higher-ranked → no upset
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

// Captain doubles their round points; vice earns 1.5× (kept identical to gameStore /
// serverEngine so the per-round breakdown on the Team page matches the scored total).
const CAPTAIN_MULT = 2;
const VICE_MULT = 1.5;

// Points a squad member ACTUALLY earned in one scored round (0 if they had no match, or
// lost it), with the captain ×2 / vice ×1.5 multiplier applied per that round's recorded
// leaders. Reads live results, so it reflects exactly what the board scored. Pass the
// entry's captain/vice history for the multiplier (empty → base points only).
export function playerRoundPoints(
  playerId: string,
  round: RoundId,
  captainHistory: { round: string; playerId: string }[] = [],
  viceCaptainHistory: { round: string; playerId: string }[] = [],
): number {
  const m = getMatchesForRound(round).find(x => x.p1Id === playerId || x.p2Id === playerId);
  if (!m || m.winnerId !== playerId) return 0; // no match this round, or didn't win
  const oppId = m.p1Id === playerId ? m.p2Id : m.p1Id;
  const pts = winPoints(round, playerId, oppId);
  if (captainHistory.find(c => c.round === round)?.playerId === playerId) return pts * CAPTAIN_MULT;
  // Vice ×1.5 is NOT rounded — a vice on a base-odd win earns a half-point (e.g. 1 → 1.5).
  if (viceCaptainHistory.find(c => c.round === round)?.playerId === playerId) return pts * VICE_MULT;
  return pts;
}

// Which scored rounds have produced any result yet (so the breakdown only shows played rounds).
export function playedScoredRounds(): RoundId[] {
  return ROUNDS.map(r => r.id).filter(id => getMatchesForRound(id).length > 0);
}

// ── Live, server-matching score ───────────────────────────────────────────────
// The squad's total so far, computed PER COMPLETED MATCH (not per completed round) — exactly
// how the authoritative server scorer (serverEngine.ts / recompute-score) works. So the number
// the user sees updates the moment each of their players wins, and always equals their row on
// the leaderboard. Scores off the LOCKED initialSquad (+ transfers applied per round, + the
// captain/vice of record for each round), so it can't be gamed by editing the live squad after
// a result — identical integrity to the server. Replaces the old manual "play round" myScore,
// which only moved once an ENTIRE round finished (leaving winners looking unscored for days).
export function liveScoreBreakdown(
  initialSquad: string[],
  transfers: { out: string; in: string; round: string }[] = [],
  captainHistory: { round: string; playerId: string }[] = [],
  viceCaptainHistory: { round: string; playerId: string }[] = [],
): { round: RoundId; points: number }[] {
  const at = (r: string) => ROUND_ORDER.indexOf(r as RoundId);
  return ROUNDS.map(r => r.id).filter(id => roundHasResult(id)).map((round) => {
    const ri = at(round);
    let squad = [...initialSquad];
    for (const t of transfers) if (at(t.round) < ri) squad = squad.map(id => (id === t.out ? t.in : id));
    const points = squad.reduce((sum, id) => sum + playerRoundPoints(id, round, captainHistory, viceCaptainHistory), 0);
    return { round, points };
  });
}

export function liveScore(
  initialSquad: string[],
  transfers: { out: string; in: string; round: string }[] = [],
  captainHistory: { round: string; playerId: string }[] = [],
  viceCaptainHistory: { round: string; playerId: string }[] = [],
): number {
  return liveScoreBreakdown(initialSquad, transfers, captainHistory, viceCaptainHistory).reduce((a, b) => a + b.points, 0);
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

// The round a player was knocked out in (their exit), or null for the champion /
// a still-alive player. Pre-R32 exits (R128/R64) are returned as-is for display.
export function getPlayerExit(playerId: string): TournamentResult | null {
  const e = rawExit(playerId);
  return !e || e === 'W' ? null : e;
}

// Is the player anywhere in the live draw (any scored-round pairing, decided or not)? A drafted
// player who LOST the opening round (before R64, which this app doesn't score) never appears —
// so "tournament started + not in the draw" means they were knocked out in the first round.
export function isInLiveDraw(playerId: string): boolean {
  const { draw } = useLiveStore.getState();
  return draw.some(m => m.p1Id === playerId || m.p2Id === playerId);
}

// Is this player eliminated, given which scored rounds have been revealed? Their
// exit stage ≤ the deepest revealed stage → out. Because earlier stages sort below
// later ones, anyone who fell before a revealed round is already out.
export function isPlayerOut(playerId: string, revealed: RoundId[]): boolean {
  const e = rawExit(playerId);
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
