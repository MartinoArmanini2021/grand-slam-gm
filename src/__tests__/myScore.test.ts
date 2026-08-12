import { describe, it, expect } from 'vitest';
import { pickScore } from '../data/useMyScore';

// The display rule behind every on-screen "Score": the server-authoritative total wins whenever
// we have it (so the header badge, Home, the Team page and the leaderboard row can never show a
// different number), and the instant client projection is only a fallback until it lands.
describe('pickScore — the authoritative-vs-live display rule', () => {
  it('shows the official (server) score when present, even if the live projection is ahead', () => {
    // The recompute runs every minute; between runs the live projection can lead the official
    // total. We still show the official number (that IS the leaderboard) — the lead surfaces
    // separately as the "+N live" pending hint.
    expect(pickScore(47, 52)).toBe(47);
    expect(pickScore(47, 47)).toBe(47);
  });

  it('shows the official score even when it is behind AND equal to zero (signed-in, pre-recompute)', () => {
    // A brand-new entry reads 0 from the server until the first recompute credits it. We honour
    // the server number (0) rather than silently swapping in the client total — consistency with
    // the leaderboard is the whole point; the pending hint communicates the catching-up state.
    expect(pickScore(0, 12)).toBe(0);
  });

  it('falls back to the live projection only when there is no official score yet (guest / not loaded)', () => {
    expect(pickScore(null, 12)).toBe(12);
    expect(pickScore(null, 0)).toBe(0);
  });
});
