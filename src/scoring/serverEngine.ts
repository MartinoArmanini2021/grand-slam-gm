// ── Portable scoring engine ──────────────────────────────────────────────────
// A PURE re-implementation of the game's scoring, with ZERO app imports — it takes
// plain data (results, ranks, round points) so the SAME code runs on the server
// (the `recompute-score` Supabase Edge Function) as an authoritative, cheat-proof
// score. The client can't be trusted to self-report the leaderboard number.
//
// It is kept in exact lock-step with the client engine (see gameStore.playNextRound
// + tournament.ts winPoints): a parity unit test replays a full game in the store and
// asserts this engine returns the identical score, so the two can never drift.

export interface MatchRow { round: string; p1: string; p2: string; winner: string | null }

export interface EntryState {
  initialSquad: string[];
  myTeam?: string[]; // current (live) squad — NOT used for scoring; see scoreEntry (P3)
  transfers?: { out: string; in: string; round: string }[];
  captainHistory?: { round: string; playerId: string }[];
  viceCaptainHistory?: { round: string; playerId: string }[];
  playedRounds: string[]; // the rounds that have actually been scored (in order)
}

export interface ScoreCtx {
  roundsInOrder: string[];               // canonical round order, e.g. ['R128'..'F']
  roundPoints: Record<string, number>;   // base points per round
  rankById: Record<string, number>;      // ATP rank per player id (for multiplier/upset)
  matches: MatchRow[];                    // every match, winner set once the round is done
}

const CAPTAIN_MULTIPLIER = 2;
const VICE_MULTIPLIER = 1.5;

// Captain/vice OF RECORD for a round: the pick set for that round, else carried forward from the
// most recent earlier round (a captain stays in force until changed → a captained run is doubled
// every round, not only R64). Gaps filled from the past only. Identical in tournament.ts +
// recompute-score/index.ts (parity-critical — the leaderboard number depends on it).
function leaderOfRecord(history: { round: string; playerId: string }[] | undefined, round: string, order: string[]): string | undefined {
  const ri = order.indexOf(round);
  let best: { round: string; playerId: string } | undefined;
  for (const h of history ?? []) {
    const hi = order.indexOf(h.round);
    if (hi >= 0 && hi <= ri && (best === undefined || order.indexOf(best.round) < hi)) best = h;
  }
  return best?.playerId;
}

// Upset multiplier: a win = base × factor. Favourites (or equal) winning keep the FULL base (×1.0);
// a lower-ranked player beating a higher-ranked one lifts the factor toward ×2.0, and the bigger the
// ranking gap the bigger the lift (smooth, saturating, monotonic). ONE factor — no separate ranking
// multiplier, no additive bonus. Identical to tournament.ts + recompute-score (parity-critical).
// loserRank undefined (off-roster opponent, no rank) → no upset. Winner rank always known (rostered).
const UPSET_HALF = 30; // gap at which the multiplier reaches half its max lift (→ ×1.5)
function upsetMultiplier(winnerRank: number, loserRank: number | undefined): number {
  if (loserRank == null || winnerRank <= loserRank) return 1;
  const gap = winnerRank - loserRank;
  return 1 + gap / (gap + UPSET_HALF);
}

export function winPoints(base: number, winnerRank: number, loserRank: number | undefined): number {
  return Math.round(base * upsetMultiplier(winnerRank, loserRank));
}

// The authoritative total for one entry across every round it has played.
export function scoreEntry(state: EntryState, ctx: ScoreCtx): number {
  const idx = (r: string) => ctx.roundsInOrder.indexOf(r);
  // Winner's rank for the multiplier (roster players are always known; default is a
  // safety net). The LOSER's rank is passed raw (may be undefined → no upset).
  const rank = (id: string) => ctx.rankById[id] ?? 40;
  // INTEGRITY (P3): score ONLY off the frozen draft snapshot. A never-locked entry has no
  // initialSquad → it scores 0 (pending) rather than falling back to the LIVE, still-editable
  // myTeam. Otherwise a user who never locks could swap in a round's winners AFTER the result
  // is known and retroactively bank the points — the squad-membership twin of the F1 captain
  // lock. Locking (finalizeDraft) is the commit that makes an entry scorable.
  const base0 = state.initialSquad ?? [];
  let total = 0;

  for (const round of state.playedRounds) {
    const ri = idx(round);
    // The squad AS IT STOOD that round: apply only transfers made in EARLIER rounds
    // (a transfer is logged against the round just played, so the buy scores from next).
    let squad = [...base0];
    for (const t of state.transfers ?? []) {
      if (idx(t.round) < ri) squad = squad.map(id => (id === t.out ? t.in : id));
    }
    const captain = leaderOfRecord(state.captainHistory, round, ctx.roundsInOrder);
    const vice = leaderOfRecord(state.viceCaptainHistory, round, ctx.roundsInOrder);
    const base = ctx.roundPoints[round] ?? 0;
    const roundMatches = ctx.matches.filter(m => m.round === round);

    for (const id of squad) {
      const m = roundMatches.find(x => x.p1 === id || x.p2 === id);
      if (!m || m.winner !== id) continue; // no match, or didn't win
      const oppId = m.p1 === id ? m.p2 : m.p1;
      const pts = winPoints(base, rank(id), ctx.rankById[oppId]); // raw opp rank → undefined = no upset
      total += id === captain ? pts * CAPTAIN_MULTIPLIER
        : id === vice ? pts * VICE_MULTIPLIER // ×1.5 unrounded → half-points allowed (1 → 1.5)
        : pts;
    }
  }
  return total;
}
