// ── Pure draw parser (shared by the CLIENT feed AND the SERVER ingest function) ──
// The single source of truth for turning a Wikipedia men's-singles draw page into the
// tournament's matches + results. It is deliberately PURE and dependency-free — only
// type imports plus the pure `matchKey` — so the SAME file runs both in the Vite client
// (src) and in the Deno Edge Function (supabase/functions/ingest-draw). No duplication,
// no drift: the server scores off the exact code these unit tests validate. The roster
// and the tournament's scored rounds are passed IN, so this never imports the field or
// the config (which are environment-specific).

// TYPE-ONLY imports (erased by the bundler at build) so this file has NO runtime module
// dependencies — that's what lets the Deno Edge Function import it directly without
// resolving the rest of the src graph. matchKey is inlined below for the same reason.
import type { RoundId } from '../types';
import type { LiveMatch, LiveResults } from './liveResults';

// Stable identity for a match within a tournament (round + draw slot). Kept identical to
// liveResults.matchKey — same `${round}_${slot}` format — so keys line up across modules.
const matchKey = (round: RoundId, slot: number): string => `${round}_${slot}`;

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
// Wikipedia disambiguates some articles: "[[Alex de Minaur (tennis)|…]]",
// "[[Taylor Fritz (tennis player)|…]]". The parenthetical isn't part of the name and must
// be dropped before matching the roster, or the drafted player silently never scores.
const stripDisambig = (s: string) => s.replace(/\s*\((?:tennis|tennis player|[^)]*)\)\s*$/i, '').trim();

// Strip Wikipedia team markup to a bare player name: "{{flagicon|ITA}} [[Jannik Sinner]]"
// → "Jannik Sinner"; "[[Name (tennis)|Name]]" → "Name".
export function cleanTeam(raw: string): string {
  let s = raw.replace(/\{\{[^}]*\}\}/g, ' ');            // drop {{flagicon|..}} etc.
  s = s.replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2');   // [[target|label]] → label
  s = s.replace(/\[\[([^\]]*)\]\]/g, '$1');              // [[name]] → name
  s = s.replace(/'''?/g, '').replace(/<[^>]+>/g, ' ');    // bold ticks / html
  s = s.replace(/[{}[\]|]/g, ' ');                        // any residual markup chars
  return s.replace(/\s+/g, ' ').trim();
}

// The canonical identity for a team is its wikilink TARGET ("[[Alexander Zverev|A. Zverev]]"
// → "Alexander Zverev"), which stays full even when later rounds show an abbreviated label
// — so advancement/identity matching survives the abbreviation.
export function teamTarget(raw: string): string {
  const m = raw.match(/\[\[([^\]|]+)/);
  return m ? m[1].trim() : cleanTeam(raw);
}

// Build a raw-cell → roster-id resolver from a roster ({id, name}[]). A name that isn't on
// the roster (an off-roster, never-draftable opponent) maps to a STABLE synthetic id from
// the name — scoring tolerates unknown ids, so parsing never breaks. Accents (via norm)
// and "(tennis)" disambiguators (via stripDisambig) are handled so a drafted player always
// resolves to their real id. This is the ONE identity used everywhere, client and server.
export function buildResolver(roster: { id: string; name: string }[]): (raw: string) => string {
  const byName = new Map(roster.map(p => [norm(p.name), p.id]));
  return (raw: string) => {
    const name = teamTarget(raw);
    return byName.get(norm(name))
      ?? byName.get(norm(stripDisambig(name)))
      ?? `x_${norm(stripDisambig(name)).replace(/\s+/g, '_')}`;
  };
}

// A real Masters draw is published as SEVERAL bracket templates (8 sections + a finals),
// not one — split them so each parses on its own (otherwise their RD-team keys collide).
export function splitBrackets(wikitext: string): { type: string; text: string }[] {
  const starts = [...wikitext.matchAll(/\{\{(\d+TeamBracket[^\s|}]*)/g)];
  const idxs = starts.map(m => m.index ?? 0).concat([wikitext.length]);
  return starts.map((m, i) => ({ type: m[1].trim(), text: wikitext.slice(idxs[i], idxs[i + 1]) }));
}

// Parse a single {{NTeamBracket…}} template into a draw + the results implied by
// advancement. `roundIds` maps template rounds RD1..RDn onto this tournament's round ids;
// `resolve` turns a raw team cell into a player id.
export function parseBracket(
  wikitext: string, roundIds: RoundId[], resolve: (raw: string) => string,
): { draw: LiveMatch[]; results: LiveResults } {
  const teams: Record<number, Record<number, { id: string; bold: boolean }>> = {};
  // Non-greedy capture up to the NEXT "| RD…" key, so a "|" inside {{flagicon|ITA}} or a
  // piped [[link|label]] doesn't prematurely end the value.
  const re = /\|\s*RD(\d+)-team(\d+)\s*=\s*(.*?)(?=\s*\|\s*RD|$)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(wikitext)) !== null) {
    const rd = Number(m[1]); const idx = Number(m[2]) - 1; const raw = m[3];
    if (!cleanTeam(raw)) continue; // empty / bye
    (teams[rd] ??= {})[idx] = { id: resolve(raw), bold: /'''/.test(raw) }; // Wikipedia bolds the winner
  }

  const draw: LiveMatch[] = [];
  const results: LiveResults = {};
  for (let rd = 1; rd <= roundIds.length; rd++) {
    const round = roundIds[rd - 1];
    const thisRound = teams[rd] ?? {};
    const nextRound = teams[rd + 1] ?? {};
    const maxIdx = Math.max(-1, ...Object.keys(thisRound).map(Number));
    const pairCount = Math.floor(maxIdx / 2) + 1;
    for (let slot = 0; slot < pairCount; slot++) {
      const a = thisRound[slot * 2];
      const b = thisRound[slot * 2 + 1];
      if (!a || !b) continue; // pairing not published yet
      draw.push({ round, slot, half: slot < pairCount / 2 ? 'top' : 'bottom', p1Id: a.id, p2Id: b.id });
      // Winner: the '''bold''' team; else fall back to advancement (who fills the next slot).
      // Only recorded when it's actually one of this pairing (never a wrong result).
      let winnerId: string | undefined;
      if (a.bold && !b.bold) winnerId = a.id;
      else if (b.bold && !a.bold) winnerId = b.id;
      else winnerId = nextRound[slot]?.id;
      if (winnerId === a.id || winnerId === b.id) results[matchKey(round, slot)] = winnerId;
    }
  }
  return { draw, results };
}

// ── Full 96-draw stitching ───────────────────────────────────────────────────
// A 96-player Masters draw is published as 8 SECTION brackets ({{16TeamBracket…}}, rounds
// RD1..RD4 = R128→R64→R32→R16) that each feed one winner into a single FINALS bracket
// ({{8TeamBracket…}}, RD1..RD3 = QF→SF→F). Verified against the real 2025 NBO page:
// 32/32/16/8/4/2/1 matches for R128…F and the correct champion.
const SECTION_ROUNDS: RoundId[] = ['R128', 'R64', 'R32', 'R16'];
const FINALS_ROUNDS: RoundId[] = ['QF', 'SF', 'F'];

// Parse the WHOLE draw page into one stitched draw + results. Each bracket parses on its
// own (their RD-team keys would collide), then slots are renumbered GLOBALLY per round
// (section order = draw order) so results never overwrite each other, and only the
// tournament's SCORED rounds are emitted (R128 is dropped — advancement into R64 is already
// resolved and the app doesn't score the opening round).
export function parseFullDraw(
  wikitext: string, opts: { scoredRounds: RoundId[]; resolve: (raw: string) => string },
): { draw: LiveMatch[]; results: LiveResults } {
  const { scoredRounds, resolve } = opts;
  const brackets = splitBrackets(wikitext);
  const sections = brackets.filter(b => /^16TeamBracket/i.test(b.type));
  const finals = brackets.find(b => /^8TeamBracket/i.test(b.type));

  // Not the 8-section Masters shape (a single test bracket, or a future format) → parse the
  // page as one bracket over the tournament's own rounds.
  if (sections.length === 0) return parseBracket(wikitext, scoredRounds, resolve);

  const perRound: Partial<Record<RoundId, { m: LiveMatch; winner: string | undefined }[]>> = {};
  const collect = (text: string, roundIds: RoundId[]) => {
    const { draw, results } = parseBracket(text, roundIds, resolve);
    for (const m of draw) (perRound[m.round] ??= []).push({ m, winner: results[matchKey(m.round, m.slot)] });
  };
  for (const s of sections) collect(s.text, SECTION_ROUNDS);
  if (finals) collect(finals.text, FINALS_ROUNDS);

  const draw: LiveMatch[] = [];
  const results: LiveResults = {};
  for (const round of scoredRounds) {
    const list = perRound[round] ?? [];
    list.forEach((item, slot) => {
      draw.push({ round, slot, half: slot < list.length / 2 ? 'top' : 'bottom', p1Id: item.m.p1Id, p2Id: item.m.p2Id });
      if (item.winner) results[matchKey(round, slot)] = item.winner;
    });
  }
  return { draw, results };
}
