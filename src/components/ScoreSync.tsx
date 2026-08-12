import { useCallback, useEffect } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useVisiblePoll } from '../hooks';
import { useScoreStore } from '../store/scoreStore';
import { TOURNAMENT } from '../data/tournamentConfig';
import { publicLeagueId, fetchEntry } from '../data/cloud';

// ── ScoreSync (mounted once, renders nothing) ─────────────────────────────────
// Keeps the signed-in user's SERVER-authoritative score (public.entries.score — the exact
// number the leaderboard shows) fresh in scoreStore, so every "Score" in the app reads one
// shared value instead of each page recomputing its own client total. This is what makes the
// header badge, Home and the Team page agree with the leaderboard row.
//
// Mirrors CloudSync: mounted once for a signed-in session, polls on the visible-tab schedule
// (pauses in a backgrounded tab, refreshes on focus), and clears to null for a guest so the
// UI falls back to the instant client liveScore. The score column is league-independent (it's
// the squad's total for the tournament), so the public-league entry is the canonical read.
export default function ScoreSync() {
  const { user } = useAuth();
  const setOfficial = useScoreStore(s => s.setOfficial);

  const load = useCallback(async () => {
    if (!user) { setOfficial(null); return; }
    try {
      const lid = await publicLeagueId();
      if (!lid) return; // accounts not configured / no public league → keep the live fallback
      const entry = await fetchEntry(user.id, lid, TOURNAMENT.id); // null = no entry yet
      setOfficial(entry ? (entry.score ?? 0) : null);
    } catch {
      // Transient load failure — keep the last known score rather than blanking to the
      // (possibly higher) live projection, which would look like the total jumped.
    }
  }, [user, setOfficial]);

  // Fetch immediately when the user changes, then on the jittered visible poll.
  useEffect(() => { void load(); }, [load]);
  useVisiblePoll(() => void load(), 30_000, !!user);

  return null;
}
