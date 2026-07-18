// ── Live-data seam ───────────────────────────────────────────────────────────
// The game currently plays the completed, verified Wimbledon 2026 draw baked into
// wimbledon2026.ts. This module is the single integration point for going LIVE
// during a real tournament.
//
// Why Wikipedia: its draw article is updated within minutes of each result, its
// API is CORS-enabled (origin=*), and it needs no backend or paid feed — so a
// static client can poll it directly. (The official ATP site is bot-blocked; a
// true real-time/in-play feed would need a paid provider like Sportradar.)
//
// Going live is two steps:
//   1. Poll fetchWikipediaWikitext() on LIVE.pollIntervalMs.
//   2. Implement parseDrawFromWikitext() to turn the raw draw wikitext into
//      WMatch[] (same shape as WIMBLEDON_2026) and push it into the store.
// Until then getLiveBracket() returns the baked, verified results so the rest of
// the app has one stable contract to build on.

import { WIMBLEDON_2026 } from './wimbledon2026';
import type { WMatch } from './wimbledon2026';

export const LIVE = {
  enabled: false,
  wikipediaPage: "2026 Wimbledon Championships – Men's singles",
  pollIntervalMs: 5 * 60_000, // Wikipedia trails a finished match by a few minutes
};

// Runs client-side — Wikipedia's raw endpoint sends permissive CORS headers.
export async function fetchWikipediaWikitext(page = LIVE.wikipediaPage): Promise<string> {
  const url = `https://en.wikipedia.org/w/index.php?title=${encodeURIComponent(page)}&action=raw`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Wikipedia fetch failed: ${res.status}`);
  return res.text();
}

// TODO(live): parse the draw wikitext into WMatch[]. Deliberately unimplemented —
// this is the one function to write when wiring a live tournament. For now it
// returns the verified baked draw so callers get a stable shape.
export function parseDrawFromWikitext(_wikitext: string): WMatch[] {
  return WIMBLEDON_2026;
}

// The bracket the game plays. Swap in the polled result once parseDrawFromWikitext
// is implemented and LIVE.enabled is flipped on.
export function getLiveBracket(): WMatch[] {
  return WIMBLEDON_2026;
}
