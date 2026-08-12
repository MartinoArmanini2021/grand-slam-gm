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
import type { LiveMatch, LiveResults, LiveScores, MatchScore } from './liveResults';

// Stable identity for a match within a tournament (round + draw slot). Kept identical to
// liveResults.matchKey — same `${round}_${slot}` format — so keys line up across modules.
const matchKey = (round: RoundId, slot: number): string => `${round}_${slot}`;

// Fold accents (NFD strip), case, AND hyphen/space differences — Wikipedia writes
// "Jan-Lennard Struff" while a roster may have "Jan Lennard Struff"; without this the
// drafted player resolves to a synthetic id and silently never scores.
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[-\s]+/g, ' ').trim();
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
  // Word-order-insensitive fallback: Wikipedia writes some names family-name-first
  // ("Shang Juncheng") while the roster has given-name-first ("Juncheng Shang"). Sorting the
  // name words makes the two match. It's only a FALLBACK (an exact match always wins), and the
  // roster has no sorted-key collisions, so this can never mis-resolve one roster player to another.
  const sortWords = (s: string) => s.split(' ').filter(Boolean).sort().join(' ');
  const bySorted = new Map(roster.map(p => [sortWords(norm(p.name)), p.id]));
  return (raw: string) => {
    const stripped = stripDisambig(teamTarget(raw));
    return byName.get(norm(teamTarget(raw)))
      ?? byName.get(norm(stripped))
      ?? bySorted.get(sortWords(norm(stripped)))
      ?? `x_${norm(stripped).replace(/\s+/g, '_')}`;
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
// A pairing where one side isn't decided yet (a seed awaiting a first-round winner). Only
// EMITTED in display mode (includeIncomplete) so the bracket can show the draw the moment it
// publishes — scoring/ingest never see it (they pass includeIncomplete=false, the default).
const TBD = { id: 'tbd', bold: false };

// Display info for a player who ISN'T on the draftable roster (a qualifier/low-ranked
// opponent, id "x_..."). Roster players already carry a name + flag, so meta is only
// populated for off-roster ids — it lets the bracket show their real (accented) name and
// flag instead of a placeholder. `country` is the raw flag code from the draw ({{flagicon|
// ESP}} → "ESP"); the client turns it into an emoji (see flags.ts) — kept out of this pure,
// dependency-free file so it still runs verbatim in the Deno ingest function.
export interface DrawMeta { name: string; country?: string }
export type DrawMetaMap = Record<string, DrawMeta>;

// Pull the first flag code out of a team cell: "{{flagicon|ESP}} [[…]]" → "ESP".
const flagCode = (raw: string): string | undefined =>
  raw.match(/\{\{\s*flag[a-z]*\s*\|\s*([A-Za-z]{2,3})\b/i)?.[1];

// A single set's games for one player: strip the winner-bold '''ticks''', the tiebreak
// <sup>N</sup> marker, and any template noise → just the game count ("6", "7", "r" for a
// retirement). Empty string when the set wasn't played.
export const cleanScore = (raw: string): string =>
  raw.replace(/<sup>.*?<\/sup>/gi, '').replace(/'''?/g, '').replace(/\{\{[^}]*\}\}/g, '')
    // Strip residual markup chars — INCLUDING stray braces { } left by a nested template the
    // {{..}} pass couldn't fully match (that leftover "}}" was leaking into the bracket as a score).
    .replace(/<[^>]+>/g, '').replace(/[{}[\]|]/g, '').trim();

export function parseBracket(
  wikitext: string, roundIds: RoundId[], resolve: (raw: string) => string, includeIncomplete = false,
): { draw: LiveMatch[]; results: LiveResults; meta: DrawMetaMap; scores: LiveScores } {
  const teams: Record<number, Record<number, { id: string; bold: boolean }>> = {};
  const meta: DrawMetaMap = {};
  // Non-greedy capture up to the NEXT "| RD…" key, so a "|" inside {{flagicon|ITA}} or a
  // piped [[link|label]] doesn't prematurely end the value.
  const re = /\|\s*RD(\d+)-team(\d+)\s*=\s*(.*?)(?=\s*\|\s*RD|$)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(wikitext)) !== null) {
    const rd = Number(m[1]); const idx = Number(m[2]) - 1; const raw = m[3];
    if (!cleanTeam(raw)) continue; // empty / bye
    const id = resolve(raw);
    (teams[rd] ??= {})[idx] = { id, bold: /'''/.test(raw) }; // Wikipedia bolds the winner
    // Capture the real name + flag for off-roster opponents (the wikilink target stays the
    // full accented name even when a later round abbreviates the visible label).
    if (id.startsWith('x_') && !meta[id]) {
      const country = flagCode(raw);
      meta[id] = country ? { name: stripDisambig(teamTarget(raw)), country } : { name: stripDisambig(teamTarget(raw)) };
    }
  }

  // Per-set games per team: RD{rd}-score{team}-{set}. Keyed [rd][teamIdx 0-based][set] → games.
  const scoreCells: Record<number, Record<number, Record<number, string>>> = {};
  const sre = /\|\s*RD(\d+)-score(\d+)-(\d+)\s*=\s*(.*?)(?=\s*\|\s*RD|$)/gm;
  let sm: RegExpExecArray | null;
  while ((sm = sre.exec(wikitext)) !== null) {
    const rd = Number(sm[1]); const idx = Number(sm[2]) - 1; const set = Number(sm[3]);
    const val = cleanScore(sm[4]);
    if (val) ((scoreCells[rd] ??= {})[idx] ??= {})[set] = val;
  }
  // The set-by-set games for a pairing (team indices a=top, b=bottom), aligned by set number.
  // Returns undefined when neither side has any recorded games (match not played).
  const pairingScore = (rd: number, a: number, b: number) => {
    const aSets = scoreCells[rd]?.[a] ?? {}; const bSets = scoreCells[rd]?.[b] ?? {};
    const setNums = [...new Set([...Object.keys(aSets), ...Object.keys(bSets)].map(Number))].sort((x, y) => x - y);
    const p1: string[] = []; const p2: string[] = [];
    for (const s of setNums) { const av = aSets[s] ?? ''; const bv = bSets[s] ?? ''; if (!av && !bv) continue; p1.push(av); p2.push(bv); }
    return p1.length || p2.length ? { p1, p2 } : undefined;
  };

  const draw: LiveMatch[] = [];
  const results: LiveResults = {};
  const scores: LiveScores = {};
  for (let rd = 1; rd <= roundIds.length; rd++) {
    const round = roundIds[rd - 1];
    const thisRound = teams[rd] ?? {};
    const nextRound = teams[rd + 1] ?? {};
    const maxIdx = Math.max(-1, ...Object.keys(thisRound).map(Number));
    const pairCount = Math.floor(maxIdx / 2) + 1;
    for (let slot = 0; slot < pairCount; slot++) {
      const a = thisRound[slot * 2];
      const b = thisRound[slot * 2 + 1];
      if (!a && !b) continue;                          // neither side known — nothing to show
      if ((!a || !b) && !includeIncomplete) continue;  // one side still TBD — display mode only
      const p1 = a ?? TBD;
      const p2 = b ?? TBD;
      draw.push({ round, slot, half: slot < pairCount / 2 ? 'top' : 'bottom', p1Id: p1.id, p2Id: p2.id });
      const sc = pairingScore(rd, slot * 2, slot * 2 + 1);
      if (sc) scores[matchKey(round, slot)] = sc;
      // Winner: the '''bold''' team; else fall back to advancement (who fills the next slot).
      // Only recorded when it's actually one of this pairing (never a wrong result; 'tbd' can
      // never win — it's not bold and never fills a next-round slot).
      let winnerId: string | undefined;
      if (p1.bold && !p2.bold) winnerId = p1.id;
      else if (p2.bold && !p1.bold) winnerId = p2.id;
      else winnerId = nextRound[slot]?.id;
      // A HALF-PUBLISHED pairing has no result — ever. In display mode (includeIncomplete) a
      // pairing can be (realPlayer, TBD) while the draw is still publishing, and the advancement
      // fallback above would read the next round and declare the known side the "winner" of a
      // match that has not been played. That phantom win scored real points on the client (the
      // server, which never includes incomplete pairings, awarded none) — the two-different-scores
      // bug. The pairing is still returned for the bracket UI; it simply has no winner until both
      // sides are known.
      const bothKnown = p1.id !== TBD.id && p2.id !== TBD.id;
      if (bothKnown && (winnerId === p1.id || winnerId === p2.id)) results[matchKey(round, slot)] = winnerId;
    }
  }
  return { draw, results, meta, scores };
}

// ── Upsert rows with NEVER-REGRESS semantics (used by the ingest Edge Function) ──
// A DB-shaped match row. snake_case to match public.matches exactly.
export interface MatchRow {
  tournament_id: string; round: string; slot: number;
  p1_id: string; p2_id: string; winner_id: string | null;
}

// Build the rows to upsert into public.matches. The critical guarantee: a winner that is
// ALREADY recorded (from a prior run — `existingWinners`) is NEVER overwritten with null by
// a later partial or transient parse (a mid-edit Wikipedia page, a flaky fetch). Priority
// is: manual override  >  freshly parsed result  >  previously stored winner  >  null.
// So the leaderboard can only ever move FORWARD, never lose a result it already had.
export function buildMatchRows(
  tournamentId: string,
  draw: LiveMatch[],
  results: LiveResults,
  existingWinners: Record<string, string | null> = {},
  overrides: Record<string, string> = {},
): MatchRow[] {
  return draw.map((m) => {
    const key = matchKey(m.round, m.slot);
    // An override only counts if it names one of THIS pairing's two players — a typo'd id or a
    // stale-slot override is ignored, never written as an impossible winner (would fail the
    // matches winner-in-pairing CHECK and freeze the whole ingest).
    const ov = overrides[key];
    const validOverride = ov === m.p1Id || ov === m.p2Id ? ov : undefined;
    const winner = validOverride ?? results[key] ?? existingWinners[key] ?? null;
    return { tournament_id: tournamentId, round: m.round, slot: m.slot, p1_id: m.p1Id, p2_id: m.p2Id, winner_id: winner };
  });
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
  wikitext: string, opts: { scoredRounds: RoundId[]; resolve: (raw: string) => string; includeIncomplete?: boolean },
): { draw: LiveMatch[]; results: LiveResults; meta: DrawMetaMap; scores: LiveScores } {
  const { scoredRounds, resolve, includeIncomplete = false } = opts;
  const brackets = splitBrackets(wikitext);
  const sections = brackets.filter(b => /^16TeamBracket/i.test(b.type));
  const finals = brackets.find(b => /^8TeamBracket/i.test(b.type));

  // Not the 8-section Masters shape (a single test bracket, or a future format) → parse the
  // page as one bracket over the tournament's own rounds.
  if (sections.length === 0) return parseBracket(wikitext, scoredRounds, resolve, includeIncomplete);

  const perRound: Partial<Record<RoundId, { slot: number; winner: string | undefined; p1Id: string; p2Id: string; score: MatchScore | undefined }[]>> = {};
  const meta: DrawMetaMap = {};
  // STABLE global slot. Each 16-team section contributes a FIXED number of pairings to each round,
  // at fixed positions (R64→4 per section, R32→2, R16→1; the finals is one bracket). We number by
  // structural position — sectionIndex × pairsPerSection + the pairing's slot within its section —
  // NOT by densely packing only the pairings that happen to be complete. This makes a given physical
  // match keep the SAME (round, slot) across ingest runs as the draw fills in. Without it, a match's
  // slot shifts every time an earlier match completes, and the never-regress merge in buildMatchRows
  // would carry an already-recorded winner onto a DIFFERENT pairing — breaking the winner-in-pairing
  // invariant (which freezes the ingest) and, worse, silently mis-scoring.
  const pairsPerSection = (roundIds: RoundId[], roundId: RoundId) => 2 ** (roundIds.length - 1 - roundIds.indexOf(roundId));
  const roundTotal: Partial<Record<RoundId, number>> = {};
  const noteTotals = (roundIds: RoundId[], sectionCount: number) => {
    for (const r of roundIds) roundTotal[r] = sectionCount * pairsPerSection(roundIds, r);
  };
  const collect = (text: string, roundIds: RoundId[], sectionIdx: number) => {
    const { draw, results, meta: sectionMeta, scores: sectionScores } = parseBracket(text, roundIds, resolve, includeIncomplete);
    Object.assign(meta, sectionMeta);
    for (const m of draw) {
      const slot = sectionIdx * pairsPerSection(roundIds, m.round) + m.slot;
      (perRound[m.round] ??= []).push({ slot, winner: results[matchKey(m.round, m.slot)], p1Id: m.p1Id, p2Id: m.p2Id, score: sectionScores[matchKey(m.round, m.slot)] });
    }
  };
  sections.forEach((s, i) => collect(s.text, SECTION_ROUNDS, i));
  noteTotals(SECTION_ROUNDS, sections.length);
  if (finals) { collect(finals.text, FINALS_ROUNDS, 0); noteTotals(FINALS_ROUNDS, 1); }

  const draw: LiveMatch[] = [];
  const results: LiveResults = {};
  const scores: LiveScores = {};
  for (const round of scoredRounds) {
    const list = (perRound[round] ?? []).slice().sort((a, b) => a.slot - b.slot);
    const total = roundTotal[round] ?? list.length; // structural count → a stable top/bottom split
    for (const item of list) {
      draw.push({ round, slot: item.slot, half: item.slot < total / 2 ? 'top' : 'bottom', p1Id: item.p1Id, p2Id: item.p2Id });
      if (item.winner) results[matchKey(round, item.slot)] = item.winner;
      if (item.score) scores[matchKey(round, item.slot)] = item.score;
    }
  }
  return { draw, results, meta, scores };
}
