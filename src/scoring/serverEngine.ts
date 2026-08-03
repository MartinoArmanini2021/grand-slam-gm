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

// Favourites are worth a little less per win, underdogs a little more (rank 1 → ×0.8,
// rank 40+ → ×1.3). Identical to tournament.ts.
function rankingMultiplier(rank: number): number {
  const r = Math.max(1, Math.min(40, rank));
  return 0.8 + 0.5 * ((r - 1) / 39);
}

// A win over a higher-ranked player earns a bonus, capped at +15 and at 1.5× the base.
function upsetBonus(winnerRank: number, loserRank: number): number {
  if (winnerRank <= loserRank) return 0;
  return Math.min(15, Math.round((winnerRank - loserRank) * 0.4));
}

// loserRank may be undefined when the beaten opponent is off-roster (an early-round
// player with no rank on record). Like the client, we award NO upset then — we can't
// know it was one, and assuming a rank would over-credit beating an unknown qualifier.
export function winPoints(base: number, winnerRank: number, loserRank: number | undefined): number {
  const upset = loserRank == null ? 0 : Math.min(upsetBonus(winnerRank, loserRank), Math.round(base * 1.5));
  return Math.round(base * rankingMultiplier(winnerRank)) + upset;
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
    const captain = state.captainHistory?.find(c => c.round === round)?.playerId;
    const vice = state.viceCaptainHistory?.find(c => c.round === round)?.playerId;
    const base = ctx.roundPoints[round] ?? 0;
    const roundMatches = ctx.matches.filter(m => m.round === round);

    for (const id of squad) {
      const m = roundMatches.find(x => x.p1 === id || x.p2 === id);
      if (!m || m.winner !== id) continue; // no match, or didn't win
      const oppId = m.p1 === id ? m.p2 : m.p1;
      const pts = winPoints(base, rank(id), ctx.rankById[oppId]); // raw opp rank → undefined = no upset
      total += id === captain ? pts * CAPTAIN_MULTIPLIER
        : id === vice ? Math.round(pts * VICE_MULTIPLIER)
        : pts;
    }
  }
  return total;
}
