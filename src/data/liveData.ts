// ── Live-data feed ───────────────────────────────────────────────────────────
// The automated results feed for running a LIVE tournament. Replay mode plays a
// completed draw baked into wimbledon2026.ts; live mode instead polls Wikipedia's
// men's-singles draw article (updated within minutes of each result, CORS-open, no
// backend or paid feed) and merges what it parses into the live store.
//
// Why Wikipedia: its draw article is updated within minutes of each result, its raw
// endpoint sends permissive CORS headers (a static client can poll it directly), and
// it needs no backend. (The official ATP site is bot-blocked; a true in-play feed
// would need a paid provider like Sportradar — a later upgrade if we want it.)
//
// The parser reads the standard {{NTeamBracket-Compact-Tennis*}} template and derives
// each winner STRUCTURALLY — a player who appears in round R+1 won their round-R
// match — which is far more robust than parsing score cells. It maps template rounds
// RD1..RDn onto the tournament's own round ids (so a 6-round Masters and a 7-round
// Slam use the same code).
//
// NOTE (validate ~Aug 1): a 96-draw is published across SEVERAL bracket sections on
// Wikipedia, not one template. Verified against the 2025 page (same 96-draw format):
// it's 8×{{16TeamBracket-Compact-Tennis3-Byes}} (the draw's Sections 1–8) plus one
// {{8TeamBracket-Tennis3-v2}} (the "Finals" / final eight = QF→F). The winner is also
// marked by '''bold''' on the advancing team. parseBracket already reads any one of
// these templates and derives winners by advancement; the remaining step is stitching
// the 8 sections + finals into the tournament's six rounds (R64→F) and confirming the
// exact 2026 page title. The fetch→parse→merge pipeline + regex are done & real-data
// tested (the regex cleanly extracted all 222 team entries from the 2025 page).

import type { RoundId } from '../types';
import { PLAYERS } from './players';
import { matchKey, type LiveMatch, type LiveResults } from './liveResults';
import { TOURNAMENT } from './tournamentConfig';

export const LIVE = {
  // The Wikipedia article carrying the men's-singles draw for the active tournament.
  // (Confirm the exact title when the page goes live.)
  wikipediaPage: `2026 ${TOURNAMENT.name} – Men's singles`,
  pollIntervalMs: 5 * 60_000, // Wikipedia trails a finished match by a few minutes
};

// Runs client-side via the MediaWiki API with origin=* — the CORS-enabled path.
// (The plain index.php?action=raw endpoint is NOT CORS-enabled and fails from the
// browser with "Failed to fetch" — verified against the live site.)
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

// ── Name → roster id ─────────────────────────────────────────────────────────
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const ID_BY_NAME = new Map(PLAYERS.map(p => [norm(p.name), p.id]));
// Off-roster opponents (never draftable) map to a stable synthetic id from their
// name, exactly as the baked draw does — scoring tolerates unknown ids.
const toId = (name: string): string => ID_BY_NAME.get(norm(name)) ?? `x_${norm(name).replace(/\s+/g, '_')}`;

// Strip Wikipedia team markup to a bare player name: "{{flagicon|ITA}} [[Jannik
// Sinner]]" → "Jannik Sinner"; "[[Name (tennis)|Name]]" → "Name".
export function cleanTeam(raw: string): string {
  let s = raw.replace(/\{\{[^}]*\}\}/g, ' ');            // drop {{flagicon|..}} etc.
  s = s.replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2');   // [[target|label]] → label
  s = s.replace(/\[\[([^\]]*)\]\]/g, '$1');              // [[name]] → name
  s = s.replace(/'''?/g, '').replace(/<[^>]+>/g, ' ');    // bold ticks / html
  s = s.replace(/[{}[\]|]/g, ' ');                        // any residual markup chars
  return s.replace(/\s+/g, ' ').trim();
}

// The canonical identity for a team is its wikilink TARGET ("[[Alexander Zverev|A.
// Zverev]]" → "Alexander Zverev"), which stays full even when later rounds show an
// abbreviated label — so advancement/identity matching survives the abbreviation.
function teamTarget(raw: string): string {
  const m = raw.match(/\[\[([^\]|]+)/);
  return m ? m[1].trim() : cleanTeam(raw);
}

// Parse a single {{NTeamBracket-Compact-Tennis*}} template into a live draw + the
// results implied by advancement. `roundIds` maps template rounds RD1..RDn onto this
// tournament's round ids (e.g. ['R64','R32','R16','QF','SF','F']).
interface Cell { id: string; bold: boolean }

export function parseBracket(wikitext: string, roundIds: RoundId[]): { draw: LiveMatch[]; results: LiveResults } {
  // Collect every "RD{r}-team{nn} = ..." into teams[r][slot] (1-based → 0-based).
  // team indices may be 1- or 2-digit (team1 / team01) across template variants.
  const teams: Record<number, Record<number, Cell>> = {};
  // Capture the team value non-greedily up to the NEXT parameter key (| RD…) or end
  // of line — so a "|" inside {{flagicon|ITA}} or a piped [[link|label]] doesn't
  // prematurely end the value.
  const re = /\|\s*RD(\d+)-team(\d+)\s*=\s*(.*?)(?=\s*\|\s*RD|$)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(wikitext)) !== null) {
    const rd = Number(m[1]);
    const idx = Number(m[2]) - 1;
    const raw = m[3];
    if (!cleanTeam(raw)) continue; // empty / bye
    // Wikipedia marks the match winner by making the advancing team '''bold'''.
    (teams[rd] ??= {})[idx] = { id: toId(teamTarget(raw)), bold: /'''/.test(raw) };
  }

  const draw: LiveMatch[] = [];
  const results: LiveResults = {};

  for (let rd = 1; rd <= roundIds.length; rd++) {
    const round = roundIds[rd - 1];
    const thisRound = teams[rd] ?? {};
    const nextRound = teams[rd + 1] ?? {};
    // Template round rd has its teams in pairs: (0,1)=slot0, (2,3)=slot1, …
    const maxIdx = Math.max(-1, ...Object.keys(thisRound).map(Number));
    const pairCount = Math.floor(maxIdx / 2) + 1;
    for (let slot = 0; slot < pairCount; slot++) {
      const a = thisRound[slot * 2];
      const b = thisRound[slot * 2 + 1];
      if (!a || !b) continue; // pairing not published yet
      draw.push({
        round,
        slot,
        half: slot < pairCount / 2 ? 'top' : 'bottom',
        p1Id: a.id,
        p2Id: b.id,
      });
      // Winner: the '''bold''' team (Wikipedia's own marker); if neither is bold yet,
      // fall back to advancement — whoever fills the next round's slot. Only recorded
      // when it's actually one of this pairing (never a wrong result).
      let winnerId: string | undefined;
      if (a.bold && !b.bold) winnerId = a.id;
      else if (b.bold && !a.bold) winnerId = b.id;
      else winnerId = nextRound[slot]?.id;
      if (winnerId === a.id || winnerId === b.id) {
        results[matchKey(round, slot)] = winnerId;
      }
    }
  }

  return { draw, results };
}

// One end-to-end sync: fetch → parse → return the draw + results for the caller to
// merge into the live store. Kept side-effect-free (no store import) so it stays
// unit-testable and the store wiring lives with the store.
export async function fetchLiveUpdate(roundIds: RoundId[]): Promise<{ draw: LiveMatch[]; results: LiveResults }> {
  const wikitext = await fetchWikipediaWikitext();
  return parseBracket(wikitext, roundIds);
}
