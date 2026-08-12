import { useScoreStore } from '../store/scoreStore';
import { useGameStore } from '../store/gameStore';
import { useLiveStore } from '../store/liveStore';
import { liveScore } from './tournament';
import { round1 } from './format';

// ── The one true "your score" for the UI ──────────────────────────────────────
// A single source the whole app reads, so Home, the header badge, the Team page and the
// leaderboard can NEVER show your squad a different total. Two numbers feed it:
//   • official — the server-authoritative leaderboard score (scoreStore, refreshed by
//                ScoreSync). null until it lands (guest, or before the first recompute).
//   • live     — the instant client projection, scored per match off the same locked squad.
// We SHOW `official` whenever we have it (that IS the leaderboard number); `live` is only a
// fallback so a guest / a brand-new entry isn't blank. `pending` = the live points not yet in
// the official total — a player who just watched a win can see it's counted while the every-
// few-minutes recompute catches up, instead of staring at a number that looks stuck (or wrong).

// The display rule, extracted so it's unit-testable without React: official wins when present.
export function pickScore(official: number | null, live: number): number {
  return official ?? live;
}

export interface MyScore {
  score: number;          // the number to display everywhere (official when known, else live)
  official: number | null; // the server/leaderboard total (null before it lands)
  live: number;           // the instant per-match client projection
  pending: number;        // live points not yet reflected in `official` (0 when in sync/no official)
}

export function useMyScore(): MyScore {
  const official = useScoreStore(s => s.official);
  const { initialSquad, transfers, captainHistory, viceCaptainHistory } = useGameStore();
  // Subscribe to the live draw + results so `live` recomputes the moment a result lands
  // (liveScore reads them from the store; these subscriptions drive the re-render).
  useLiveStore(s => s.draw);
  useLiveStore(s => s.results);
  const live = liveScore(initialSquad, transfers, captainHistory, viceCaptainHistory);
  return {
    score: pickScore(official, live),
    official,
    live,
    pending: official != null ? Math.max(0, round1(live - official)) : 0,
  };
}
