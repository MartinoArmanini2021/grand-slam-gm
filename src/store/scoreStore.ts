import { create } from 'zustand';

// ── My server-authoritative score ────────────────────────────────────────────
// The single, app-wide copy of THIS user's official score — public.entries.score, the
// exact number the leaderboard shows. Kept fresh by <ScoreSync/> (mounted once, polled),
// so every on-screen "Score" (the header badge, Home, the Team page, the leaderboard row)
// reads ONE value and the app can never show a different total on different pages.
//   • null  → signed out, or before the first fetch has landed → callers fall back to the
//             instant client liveScore (see useMyScore).
//   • number → the authoritative total; shown everywhere, so it always matches the board.
interface ScoreStore {
  official: number | null;
  setOfficial: (n: number | null) => void;
}

export const useScoreStore = create<ScoreStore>((set) => ({
  official: null,
  setOfficial: (official) => set({ official }),
}));
