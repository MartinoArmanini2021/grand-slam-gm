import type { Match, RoundId, TournamentResult } from '../types';
import { findPlayer, PLAYERS } from './players';
import { TOURNAMENT, ROUND_META, ROUND_ORDER, ROUND_POINTS, OPENING_ROUND } from './tournamentConfig';
import { useLiveStore } from '../store/liveStore';
import { liveMatches, liveExit, roundComplete } from './liveResults';
import { STARTING_BUDGET } from './squadRules';
import { round1 } from './format';

// Tournament identity + per-surface theming now live in ./tournamentConfig.

// The active tournament's rounds, in order — derived from which rounds it plays
// (TOURNAMENT.rounds), the shared round labels (ROUND_META), and this tournament's own
// pinned scoring curve (ROUND_POINTS — legacy vs Format 2, see tournamentConfig.ts). Adding
// a tournament with a different round count (a Masters draw) needs no change here.
export const ROUNDS: { id: RoundId; label: string; short: string; points: number }[] =
  TOURNAMENT.rounds.map(id => ({ id, ...ROUND_META[id], points: ROUND_POINTS[id] }));

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

// Has a round STARTED (gone live)? A round is under way the moment its first match begins — but the
// results feed can't tell us that: Wikipedia only records a match's winner once it FINISHES, so there
// is a live window (matches on court, none finished) with zero recorded results. Relying on results
// alone left the market open and captains editable while a round was already being played. So a round
// counts as started if it has ANY result OR its scheduled start time (the accurate config schedule)
// has passed. This is the single signal that locks the market + captains the instant play begins.
export function roundStarted(round: RoundId): boolean {
  if (roundHasResult(round)) return true;
  const iso = TOURNAMENT.schedule?.[round];
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) && Date.now() >= t;
}

// The deepest round that has STARTED (live signal), vs liveCurrentRound which is the deepest with a
// RESULT. A transfer/buy scores from the round after this — so once R16 is live, a signing scores QF,
// never R16. Null before any round starts.
export function liveStartedRound(): RoundId | null {
  for (let i = ROUNDS.length - 1; i >= 0; i--) if (roundStarted(ROUNDS[i].id)) return ROUNDS[i].id;
  return null;
}

// The transfer / cash-in window. The market is a BETWEEN-ROUNDS desk: it's shut while any round is
// live (started — by schedule or a result — but not yet complete), and reopens at the break. Derived
// from RESULTS + the schedule, never the frozen currentRoundIndex. When open, a change must still be
// able to score: the round after the deepest STARTED round must exist and not be the Final. Mirrors
// the buyPlayer/cashInPlayer commit guard, so UI availability == what the store will accept.
export function transferWindowOpen(): boolean {
  const st = liveRoundStatus();
  if (st && st.underway) return false;                 // a round is live → market shut until the break
  const round = liveStartedRound() ?? ROUNDS[0].id;
  const firstScored = ROUNDS[ROUNDS.findIndex(r => r.id === round) + 1]?.id;
  return !!firstScored && firstScored !== ROUNDS[ROUNDS.length - 1].id;
}

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

// The LIVE "current round": the deepest scored round that has ANY result. Everything after it
// hasn't started, so it's the round a transfer is logged against (its newcomer first scores the
// NEXT round, never retroactively). Derived from results — NOT the app's currentRoundIndex,
// which is frozen at 0 during a live event (the manual "play the round" step never runs). Null
// before the tournament begins.
export function liveCurrentRound(): RoundId | null {
  for (let i = ROUNDS.length - 1; i >= 0; i--) if (roundHasResult(ROUNDS[i].id)) return ROUNDS[i].id;
  return null;
}

// The round in focus for the live status box — correctly telling a round that's UNDERWAY (has
// results but isn't finished) apart from the NEXT round that's UP NEXT (its predecessor is fully
// played). It's the earliest round that isn't fully played; "fully played" reuses roundPlayable(),
// which knows a round is done only when every pairing is decided AND the next round has been drawn.
// So a complete-but-not-yet-superseded round (e.g. R64 done, R32 drawn, nothing played) correctly
// resolves to "R32, up next", not "R64, underway". "underway" now uses roundStarted() — a round that
// has gone live by its scheduled time counts as underway even before its first result lands (the feed
// only reports finished matches), so the status box flips to LIVE the moment play begins. Null once
// the whole draw is played out.
// TWO different questions, deliberately kept apart — conflating them is why the app once announced
// "The Final is underway" while the Final had not been played:
//   • underway — should everything be LOCKED? Schedule-driven (roundStarted): the scheduled time has
//     passed OR a result exists. Locking early is fail-safe, so an ESTIMATED start time is fine here.
//   • live     — is play actually happening, as a matter of EVIDENCE? Only a recorded result proves
//     that. Never assert "underway" to the user off an estimate; use this for anything user-facing.
// So a round can be underway-but-not-live: picks are frozen and we're waiting on the first result.
export function liveRoundStatus(): { round: RoundId; underway: boolean; live: boolean } | null {
  for (let i = 0; i < ROUNDS.length; i++) {
    if (!roundPlayable(i)) {
      return { round: ROUNDS[i].id, underway: roundStarted(ROUNDS[i].id), live: roundHasResult(ROUNDS[i].id) };
    }
  }
  return null; // every round fully played
}

// The round currently OPEN for captain/vice selection: the earliest round that has NOT STARTED yet
// (a round's captain freezes the moment it goes live — by schedule or a result). This is what
// setCaptain records against, so once R16 is live you're setting your QF captain, never R16's.
// Schedule-aware, NOT the frozen currentRoundIndex. null once every round has started.
export function liveLeaderRound(): RoundId | null {
  return ROUNDS.find(r => !roundStarted(r.id))?.id ?? null;
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

// Upset multiplier: a win earns its round's base points, multiplied UP when a lower-ranked player
// beats a higher-ranked one — and the bigger the ranking gap, the bigger the multiplier. It's ONE
// graduated factor (no separate ranking multiplier, no additive bonus): a smooth, saturating curve
// that rises from ×1.0 (a favourite or equal-ranked player winning keeps the FULL base — never a
// discount) toward ×2.0 for a giant-killing, always increasing with the gap. Symmetric with
// serverEngine.ts + recompute-score/index.ts (parity-critical — the three MUST match exactly).
// An unknown WINNER (never happens for rostered players) defaults to rank 40; an unknown LOSER (an
// off-roster early-round opponent) yields NO upset — we can't know it was one. findPlayer never throws.
const UPSET_HALF = 30; // the ranking gap at which the multiplier reaches HALF its max lift (→ ×1.5)
export function upsetMultiplier(winnerId: string, loserId: string): number {
  const w = findPlayer(winnerId)?.ranking ?? 40;
  const l = findPlayer(loserId)?.ranking;
  if (l == null || w <= l) return 1;      // favourite / equal / unknown loser → full base, no upset
  const gap = w - l;                      // how many ranks below the beaten player the winner sits
  return 1 + gap / (gap + UPSET_HALF);    // ×1 (tiny gap) → ~×2 (huge gap), monotonically rising
}

// Total points a player earns for winning a match: the round's base × the upset multiplier, rounded.
export function winPoints(roundId: RoundId, winnerId: string, loserId: string): number {
  const base = ROUNDS.find(r => r.id === roundId)?.points ?? 0;
  return Math.round(base * upsetMultiplier(winnerId, loserId));
}

// Captain doubles their round points; vice earns 1.5× (kept identical to gameStore /
// serverEngine so the per-round breakdown on the Team page matches the scored total).
const CAPTAIN_MULT = 2;
const VICE_MULT = 1.5;

// Points a squad member ACTUALLY earned in one scored round (0 if they had no match, or
// lost it), with the captain ×2 / vice ×1.5 multiplier applied per that round's recorded
// leaders. Reads live results, so it reflects exactly what the board scored. Pass the
// entry's captain/vice history for the multiplier (empty → base points only).
// Captain/vice OF RECORD for a round: the pick explicitly set for THAT round, or — if none — the
// pick carried forward from the most recent EARLIER round. A manager's captain stays in force every
// round until they change it, so a captained deep run is doubled all the way (R64→F), not only in
// R64. Gaps are filled from the past only; a later explicit pick never rewrites an earlier (already
// locked) round. IDENTICAL logic in serverEngine.ts + recompute-score/index.ts (parity-critical).
export function leaderOfRecord(history: { round: string; playerId: string }[], round: RoundId): string | undefined {
  const ri = ROUND_ORDER.indexOf(round);
  let best: { round: string; playerId: string } | undefined;
  for (const h of history) {
    const hi = ROUND_ORDER.indexOf(h.round as RoundId);
    if (hi >= 0 && hi <= ri && (best === undefined || ROUND_ORDER.indexOf(best.round as RoundId) < hi)) best = h;
  }
  return best?.playerId;
}

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
  if (leaderOfRecord(captainHistory, round) === playerId) return pts * CAPTAIN_MULT;
  // Vice ×1.5 is NOT rounded — a vice on a base-odd win earns a half-point (e.g. 1 → 1.5).
  if (leaderOfRecord(viceCaptainHistory, round) === playerId) return pts * VICE_MULT;
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

// Is the player OUT of the tournament right now — lost a scored round (R64→F) OR was knocked out
// in the opening round (absent from the draw once it's underway)? Drives the refund + the
// transfer rule ("you may only swap OUT an eliminated player, and only IN a still-alive one"),
// off the LIVE results rather than the app's stuck round index.
// Can we trust "absent from the draw" to mean WITHDREW? Only if the draw we hold actually accounts
// for essentially the whole field. Absence is evidence of withdrawal only when the draw is complete:
// before the feed lands `draw` is empty and everyone is trivially absent, and a Wikipedia page
// caught mid-edit (or vandalised) can drop a whole bracket section — either would hide real,
// still-alive entrants from the market. So require near-total coverage and FAIL SAFE: below the
// threshold we conclude nothing, leaving players visible rather than wrongly deleting them. One
// genuine withdrawal barely moves the ratio (95/96), while a lost section (84/96) trips it.
const WITHDRAWAL_COVERAGE = 0.9;
export function drawCoversField(): boolean {
  const { draw } = useLiveStore.getState();
  if (draw.length === 0) return false;
  const inDraw = new Set<string>();
  for (const m of draw) { inDraw.add(m.p1Id); inDraw.add(m.p2Id); }
  return PLAYERS.filter(p => inDraw.has(p.id)).length >= PLAYERS.length * WITHDRAWAL_COVERAGE;
}

// Is the player OUT of the tournament right now? Either
//   • they lost a round we can see — including the UNSCORED opening round, which liveData parses
//     into the store (PARSED_ROUNDS) precisely so the market can spot it, or
//   • the draw has been published and they are nowhere in it — a WITHDRAWAL. This used to be
//     gated on tournamentStarted() ("a scored round has a result"), which meant a player who pulled
//     out before the first scored round stayed on sale for the whole draft: they were in no pairing,
//     so they had no exit, and the tournament had not "started". Keying it to the DRAW being
//     published instead closes that window, and self-corrects if the draw changes back.
export function isEliminated(playerId: string): boolean {
  return getPlayerExit(playerId) !== null || (drawCoversField() && !isInLiveDraw(playerId));
}

// THE single question the market must ask before letting anyone take a player: can they still be
// picked? Both the draft and the live transfer desk go through here, so the two can never drift.
//
// WHY IT ISN'T JUST `isPlayerOut(revealed)`: `revealed` is derived from currentRoundIndex, which is
// FROZEN AT 0 in production (the manual "play the round" step never runs at a live event). So during
// the draft `revealed` is [] and isPlayerOut returns false for EVERYONE — which let managers draft
// players who had already gone home. That is not theoretical: at Cincinnati the unscored opening
// round is played WHILE THE DRAFT IS STILL OPEN, so 12 of the 96 entrants were already out.
//
//  • 'live'  → read the real results. `isEliminated` covers both a scored-round exit and an
//    opening-round exit, because liveData parses PARSED_ROUNDS (the opening round + the scored ones)
//    into the live store even though scoring never touches the opening round.
//  • 'replay' → results are known but deliberately withheld until their round is revealed, so it
//    MUST keep the revealed-rounds view or the market would spoil the outcome.
export function isUnpickable(playerId: string, revealed: RoundId[] = []): boolean {
  return TOURNAMENT.mode === 'live' ? isEliminated(playerId) : isPlayerOut(playerId, revealed);
}

// Cash-in TIMING (one gate for everyone): the money can only be claimed at a round BREAK — once
// the current round's last match is over and before the next one starts. While a round is underway,
// cash-in is shut for the whole squad (you settle up and rebuild at the break), even for players who
// fell in an EARLIER, already-complete round. Refund VALUES are still shown across all rounds — only
// the ACTION waits. Respects transferWindowOpen too (nothing left to spend on after the SF).
export function cashInOpen(): boolean {
  // The whole market is now a between-rounds desk (transferWindowOpen already shuts while a round is
  // live), so cash-in shares that exact gate: open only at a round break, closed the instant play
  // begins — including the schedule-driven "started, no result yet" window that was the bug.
  return transferWindowOpen();
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
// DIMINISHING refund: the earlier a player is knocked out, the MORE of their price comes back — a
// deep run has already banked points for you, so their residual value has fallen. So an early exit
// refunds most, and a Quarter-finalist (who already delivered) refunds least. SF/Final exits refund
// nothing — the transfer window is shut by then, so there's nothing to spend it on. Diminishes per
// round so it works for Grand Slams (R128 first) as well as Masters (R64 first).
export const BUDGET_RETURN_RATES: Record<RoundId, number> = {
  R128: 0.75,
  R64:  0.70,
  R32:  0.55,
  R16:  0.40,
  QF:   0.25,
  SF:   0,
  F:    0,
};

// A player knocked out in the UNSCORED opening round refunds in FULL. They never reached a round
// that pays, so the manager got literally nothing for the money — charging a haircut would punish
// them for the tournament's own scheduling (the opening round is played while the draft is still
// open). Replacing such a player is also FREE of the transfer cap, see openingRoundExit below.
const OPENING_ROUND_RETURN = 1.0;

// Was this player knocked out in the tournament's unscored opening round? True only where such a
// round exists (a Masters where the seeds bye; never at a Slam). Two ways to detect it: their
// recorded exit IS that round (the client reads it — see liveData PARSED_ROUNDS), or the older
// signal, absent from the scored draw once play has begun.
export function openingRoundExit(id: string): boolean {
  if (!OPENING_ROUND) return false;
  if (rawExit(id) === OPENING_ROUND) return true;
  return tournamentStarted() && !isInLiveDraw(id);
}

// The refund a squad player is worth right now: their price × the round they were knocked out in
// (an unscored opening-round exit returns everything). A still-alive player is worth 0 (nothing to
// refund yet). This is LIVE — it reflects the results the moment they land, like the score.
export function playerRefund(id: string): number {
  const price = findPlayer(id)?.price ?? 0;
  if (openingRoundExit(id)) return round1(price * OPENING_ROUND_RETURN);
  const exit = getPlayerExit(id); // scored-round exit (R64→F), or null
  if (exit) return round1(price * (BUDGET_RETURN_RATES[exit as RoundId] ?? 0));
  return 0;
}

// How many of the manager's MAX_TRANSFERS a transfer list has actually consumed. Replacing a player
// who fell in the unscored opening round is FREE — it repairs a squad that never got to play, so it
// isn't the recycling the cap exists to limit. Logged against OPENING_ROUND by the store, which is
// also how the server identifies it (that round has no rows in public.matches).
// Free when the player REPLACED never reached a scored round — judged by who went out, not by which
// round the transfer is stamped with. The stamp has to stay truthful for scoring (it decides which
// round the signing starts earning from), so it says R64 for a repair made during the R64→R32 break;
// reusing it as the "free" marker charged a manager for repairing an opening-round casualty simply
// because they did it after the first scored round rather than before. openingRoundExit covers both
// shapes of never-arrived: lost the opening round, or withdrew and never appeared in the draw.
// The server derives the SAME thing unspoofably — an out player with no rows in public.matches never
// reached a scored round (see save_entry_rpc.sql) — so client and server agree without a client flag.
// findPlayer guard: openingRoundExit falls back to "absent from the draw", which is true of ANY
// unrecognised id — so without it a fabricated `out` would buy unlimited free transfers. Only a
// real member of this field can earn the exemption. The server applies the same two conditions.
export function transfersUsed(transfers: { round: string; out?: string; in?: string }[] = []): number {
  return transfers.filter(t => !(t.out && findPlayer(t.out) && openingRoundExit(t.out))).length;
}

// A manager's available money, LIVE and derived (no manual "play the round" step): the starting
// budget, minus what they spent (drafted squad + any transfer-ins), plus the refund for every
// eliminated player they've held — including opening-round exits. During the draft (no locked
// squad yet) the base is the squad being built, and refunds are 0, so it equals the draft budget.
export function liveBudget(
  initialSquad: string[], transfers: { in: string; out?: string }[], currentSquad: string[], cashedIn: string[] = [],
): number {
  const price = (id: string) => findPlayer(id)?.price ?? 0;
  const base = initialSquad.length ? initialSquad : currentSquad; // pre-lock: the draft squad
  const acquired = [...base, ...transfers.map(t => t.in)]; // everyone ever bought (draft + purchases)
  const cost = acquired.reduce((sum, id) => sum + price(id), 0);
  // MANUAL refunds, derived from the ROSTER (not the fragile cashedIn list): refund every player
  // a manager has DISPOSED OF = anyone they acquired who's no longer in the active squad (cashed
  // in OR transferred out). This is immune to a mis-recorded cashedIn — an early cash-in that saved
  // myTeam but not cashedIn (before gameSnapshot sent it) still gets its refund here. cashedIn is a
  // subset, unioned for safety. Held-but-eliminated players are NOT refunded until cashed in.
  const refundIds = new Set<string>([...cashedIn, ...acquired.filter(id => !currentSquad.includes(id))]);
  const refunds = [...refundIds].reduce((sum, id) => sum + playerRefund(id), 0);
  // Floor at 0: a squad drafted ≤ $150 can read "over budget" if prices were re-tuned afterwards
  // (cost now > 150). A negative number is confusing and un-actionable — they simply can't buy
  // until eliminations refund enough to lift it back above 0. Never show a negative budget.
  return round1(Math.max(0, STARTING_BUDGET - cost + refunds));
}

// Total money a manager has already cashed in (sum of the elimination refunds they claimed).
export function cashedInTotal(cashedIn: string[]): number {
  return round1(cashedIn.reduce((sum, id) => sum + playerRefund(id), 0));
}
