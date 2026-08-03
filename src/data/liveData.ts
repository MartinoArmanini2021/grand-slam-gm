// ── Live-data feed (client) ──────────────────────────────────────────────────
// The browser side of the automated results feed. It polls Wikipedia's men's-singles
// draw article (updated within minutes of each result, CORS-open, no backend) and parses
// it with the SHARED pure parser in ./drawParser — the same code the server-side ingest
// Edge Function runs, so the client preview and the authoritative server ingestion can
// never disagree. The roster + scored rounds are injected here from the app's config.
//
// Why Wikipedia: its draw article updates within minutes of each result and its API sends
// permissive CORS headers (a static client can poll it directly). The official ATP site is
// bot-blocked; a true in-play feed would need a paid provider (a later upgrade).

import type { RoundId } from '../types';
import { PLAYERS } from './players';
import type { LiveMatch, LiveResults } from './liveResults';
import { TOURNAMENT } from './tournamentConfig';
import {
  buildResolver, cleanTeam, splitBrackets, teamTarget,
  parseBracket as parseBracketCore, parseFullDraw as parseFullDrawCore,
} from './drawParser';

export { cleanTeam, splitBrackets, teamTarget };

export const LIVE = {
  // The Wikipedia article carrying the men's-singles draw for the active tournament.
  // Confirmed live: "2026 National Bank Open – Men's singles" resolves with the expected
  // 8-section + finals bracket structure. Keep in sync with the ingest Edge Function.
  wikipediaPage: `2026 ${TOURNAMENT.name} – Men's singles`,
  pollIntervalMs: 5 * 60_000, // Wikipedia trails a finished match by a few minutes
};

// The client's roster resolver + round set, injected into the shared pure parser.
const resolve = buildResolver(PLAYERS);

// The roster id for a raw Wikipedia team cell (exported so name-reconciliation is testable).
export const teamId = (raw: string): string => resolve(raw);

// Parse one bracket template over the given round ids (client-configured resolver).
export function parseBracket(wikitext: string, roundIds: RoundId[]): { draw: LiveMatch[]; results: LiveResults } {
  return parseBracketCore(wikitext, roundIds, resolve);
}

// Parse the whole draw page into the tournament's scored rounds. includeIncomplete=true so the
// CLIENT bracket shows the draw the moment it publishes — seeds paired with a "TBD" opponent
// that fills in as the first round is played. (The server ingest uses the default, false, so
// public.matches only ever holds fully-known pairings for scoring.)
export function parseFullDraw(wikitext: string): { draw: LiveMatch[]; results: LiveResults } {
  return parseFullDrawCore(wikitext, { scoredRounds: TOURNAMENT.rounds, resolve, includeIncomplete: true });
}

// Runs client-side via the MediaWiki API with origin=* — the CORS-enabled path. (The plain
// index.php?action=raw endpoint is NOT CORS-enabled and fails from the browser.)
export async function fetchWikipediaWikitext(page = LIVE.wikipediaPage): Promise<string> {
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(page)}`
    + `&prop=wikitext&formatversion=2&format=json&origin=*`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Wikipedia fetch failed: ${res.status}`);
  const json = await res.json();
  const wikitext = json?.parse?.wikitext;
  if (typeof wikitext !== 'string') throw new Error(json?.error?.info ?? 'Draw page not found');
  return wikitext;
}

// One end-to-end sync: fetch → parse the full draw → return draw + results for the caller
// to merge into the live store. Side-effect-free (no store import) so it stays testable.
export async function fetchLiveUpdate(): Promise<{ draw: LiveMatch[]; results: LiveResults }> {
  const wikitext = await fetchWikipediaWikitext();
  return parseFullDraw(wikitext);
}
