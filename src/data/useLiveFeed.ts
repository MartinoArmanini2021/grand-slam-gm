import { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveStore } from '../store/liveStore';
import { fetchLiveUpdate, LIVE } from './liveData';
import { TOURNAMENT } from './tournamentConfig';
import { ROUNDS } from './tournament';

// ── Live feed hook ───────────────────────────────────────────────────────────
// Orchestrates the automated results feed: fetch → parse → merge into the live
// store. mergeResults never clobbers an admin override, so the human always wins.
// `sync()` runs one pass; passing autoPoll starts a background poll on the
// tournament's interval. No-ops entirely outside live mode.
export function useLiveFeed(autoPoll = false) {
  const setDraw = useLiveStore(s => s.setDraw);
  const mergeResults = useLiveStore(s => s.mergeResults);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Latest sync closure, so the interval always calls the current one.
  const syncRef = useRef<() => Promise<void>>(async () => {});

  const sync = useCallback(async () => {
    if (TOURNAMENT.mode !== 'live') return;
    setBusy(true);
    setError(null);
    try {
      const { draw, results } = await fetchLiveUpdate(ROUNDS.map(r => r.id));
      if (draw.length) setDraw(draw);      // refresh pairings as the draw fills out
      mergeResults(results, Date.now());   // overrides are preserved
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setBusy(false);
    }
  }, [setDraw, mergeResults]);

  syncRef.current = sync;

  useEffect(() => {
    if (!autoPoll || TOURNAMENT.mode !== 'live') return;
    const id = setInterval(() => { void syncRef.current(); }, LIVE.pollIntervalMs);
    return () => clearInterval(id);
  }, [autoPoll]);

  return { sync, busy, error };
}
