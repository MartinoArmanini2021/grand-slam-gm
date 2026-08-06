import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ACTIVE_TOURNAMENT_ID } from '../data/tournamentConfig';
import { matchKey, type LiveMatch, type LiveResults, type PlayerMetaMap, type LiveScores } from '../data/liveResults';
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
  meta: PlayerMetaMap;               // off-roster opponents' real name + flag (from the draw)
  scores: LiveScores;                // matchKey → per-set games (both sides), from the draw
  overrides: Record<string, true>;   // matchKeys an admin has manually set/corrected
  lastSync: number | null;           // ms timestamp of the last successful feed merge

  setDraw: (draw: LiveMatch[]) => void;
  // Feed: merge off-roster player display info (name/flag). Accumulates, never drops known
  // entries — a later partial parse can't erase a name/flag we already learned.
  setMeta: (meta: PlayerMetaMap) => void;
  // Feed: merge per-match set scores (matchKey → games). Accumulates like meta.
  setScores: (scores: LiveScores) => void;
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
      meta: {},
      scores: {},
      overrides: {},
      lastSync: null,

      // NEVER-REGRESS merge (mirrors the server's draw builder + mergeResults): the feed publishes
      // the draw incrementally and a transient/partial Wikipedia parse can omit pairings. A full
      // replace would drop those, corrupting elimination/exit/refund/round-state (all derived by
      // iterating `draw`). So keep every known pairing, add/update incoming ones, and never let a
      // known pairing regress back to TBD. An empty parse is ignored outright.
      setDraw: (incoming) => set((s) => {
        if (incoming.length === 0) return {};
        const byKey = new Map(s.draw.map(m => [matchKey(m.round, m.slot), m]));
        for (const m of incoming) {
          const key = matchKey(m.round, m.slot);
          const existing = byKey.get(key);
          const incomingKnown = m.p1Id !== 'tbd' && m.p2Id !== 'tbd';
          const existingKnown = !!existing && existing.p1Id !== 'tbd' && existing.p2Id !== 'tbd';
          if (!existing || incomingKnown || !existingKnown) byKey.set(key, m);
        }
        return { draw: [...byKey.values()] };
      }),

      setMeta: (meta) => set((s) => ({ meta: { ...s.meta, ...meta } })),

      setScores: (scores) => set((s) => ({ scores: { ...s.scores, ...scores } })),

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

      resetLive: () => set({ draw: [], results: {}, meta: {}, scores: {}, overrides: {}, lastSync: null }),
    }),
    { name: `gsgm-live-${ACTIVE_TOURNAMENT_ID}` }
  )
);
