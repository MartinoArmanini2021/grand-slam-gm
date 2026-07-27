import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ACTIVE_TOURNAMENT_ID } from '../data/tournamentConfig';
import { matchKey, type LiveMatch, type LiveResults } from '../data/liveResults';
import type { RoundId } from '../types';

// ── Live tournament store ────────────────────────────────────────────────────
// The single source of truth for a LIVE tournament's draw + recorded results.
// Two writers feed it: the automated feed (mergeResults) and the admin panel
// (recordResult / clearResult). Admin edits are marked as OVERRIDES and the feed
// never clobbers them — encoding the locked decision "automated feed is primary,
// with an admin edit/override that wins" (US_OPEN_ROADMAP §Decisions #1).
//
// Persisted per active tournament id, so switching tournaments starts a clean slate
// (and a rehydrated session keeps whatever has been recorded so far).

interface LiveStore {
  draw: LiveMatch[];                 // pairings, once the draw is published/entered
  results: LiveResults;              // matchKey → winner id, as recorded
  overrides: Record<string, true>;   // matchKeys an admin has manually set/corrected
  lastSync: number | null;           // ms timestamp of the last successful feed merge

  setDraw: (draw: LiveMatch[]) => void;
  // Admin: set/correct a result. Marks it an override so the feed won't overwrite it.
  recordResult: (round: RoundId, slot: number, winnerId: string) => void;
  // Admin: clear a result (and drop its override, so the feed may repopulate it).
  clearResult: (round: RoundId, slot: number) => void;
  // Feed: merge polled results, never touching admin overrides. Stamps lastSync.
  mergeResults: (incoming: LiveResults, syncedAt: number) => void;
  resetLive: () => void;
}

export const useLiveStore = create<LiveStore>()(
  persist(
    (set) => ({
      draw: [],
      results: {},
      overrides: {},
      lastSync: null,

      setDraw: (draw) => set({ draw }),

      recordResult: (round, slot, winnerId) =>
        set((s) => {
          const key = matchKey(round, slot);
          return {
            results: { ...s.results, [key]: winnerId },
            overrides: { ...s.overrides, [key]: true },
          };
        }),

      clearResult: (round, slot) =>
        set((s) => {
          const key = matchKey(round, slot);
          const results = { ...s.results };
          const overrides = { ...s.overrides };
          delete results[key];
          delete overrides[key];
          return { results, overrides };
        }),

      mergeResults: (incoming, syncedAt) =>
        set((s) => {
          const results = { ...s.results };
          for (const [key, winnerId] of Object.entries(incoming)) {
            if (s.overrides[key]) continue; // never overwrite an admin correction
            results[key] = winnerId;
          }
          return { results, lastSync: syncedAt };
        }),

      resetLive: () => set({ draw: [], results: {}, overrides: {}, lastSync: null }),
    }),
    { name: `gsgm-live-${ACTIVE_TOURNAMENT_ID}` }
  )
);
