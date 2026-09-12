// ── ingest-draw ── Supabase Edge Function (Deno) ─────────────────────────────
// THE BRIDGE that makes the live leaderboard move for everyone: fetches the Wikipedia
// men's-singles draw, parses it, and writes results into public.matches with the service
// role. recompute-score then scores every entry off those rows.
//
//   cron → ingest-draw (Wikipedia → matches) → recompute-score (matches → entries.score) → board
//
// ⚠️ SELF-CONTAINED ON PURPOSE. The Supabase/Deno bundler can't follow the extensionless,
// type-only cross-file imports in src/data/drawParser.ts (`'../types'` is a directory → EISDIR;
// `'./liveResults'` has no .ts), so the parser + auth guard are INLINED here verbatim.
//   • Canonical parser: src/data/drawParser.ts (validated by the vitest suite).
//   • The block between "PARSER — INLINED COPY" markers MUST stay byte-identical to it; a drift
//     guard test (src/__tests__/ingestParserSync.test.ts) fails if they diverge, and the nightly
//     verifier (scripts/verify-app.mjs) catches any divergence in the LIVE data too.
//
// Deploy:  npx supabase functions deploy ingest-draw --project-ref <ref>
// Manual override:  POST { "overrides": [ { "round": "QF", "slot": 0, "winnerId": "shelton" } ] }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import montrealField from '../../../src/data/montreal2026Field.json' with { type: 'json' };
import cincinnatiField from '../../../src/data/cincinnati2026Field.json' with { type: 'json' };
import usopenField from '../../../src/data/usopen2026Field.json' with { type: 'json' };

// ── auth guard (inlined from supabase/functions/_shared/serviceGuard.ts) ──
function decodeJwtRole(token: string): string | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
    return typeof payload?.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}
function assertServiceRole(req: Request): Response | null {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (decodeJwtRole(token) === 'service_role') return null;
  return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
    status: 401, headers: { 'Content-Type': 'application/json' },
  });
}

// ════════════ PARSER — INLINED COPY of src/data/drawParser.ts (keep identical) ════════════
type RoundId = string;
interface LiveMatch { round: RoundId; slot: number; half: 'top' | 'bottom'; p1Id: string; p2Id: string }
type LiveResults = Record<string, string>;
interface MatchScore { p1: string[]; p2: string[] }
type LiveScores = Record<string, MatchScore>;

const matchKey = (round: RoundId, slot: number): string => `${round}_${slot}`;
// Latin letters NFD does NOT decompose — they are distinct code points, not letter+accent.
// "Vít Kopřiva" folds fine (í, ř are combining pairs); "Elmer Møller" does NOT, because ø is its
// own letter. A miss here is SILENT: the player resolves to a synthetic x_ id, so he is
// undraftable — and if the two copies of this function ever disagree, client and server disagree
// on identity. Caught rehearsing the 2025 US Open draw, 2026-08-27.
const FOLD: Record<string, string> = { 'ø': 'o', 'æ': 'ae', 'œ': 'oe', 'ł': 'l', 'đ': 'd', 'ð': 'd', 'þ': 'th', 'ß': 'ss', 'ı': 'i' };
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[øæœłđðþßı]/g, (c) => FOLD[c] ?? c)
  .replace(/[-\s]+/g, ' ').trim();
const stripDisambig = (s: string) => s.replace(/\s*\((?:tennis|tennis player|[^)]*)\)\s*$/i, '').trim();

function cleanTeam(raw: string): string {
  let s = raw.replace(/\{\{[^}]*\}\}/g, ' ');
  s = s.replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2');
  s = s.replace(/\[\[([^\]]*)\]\]/g, '$1');
  s = s.replace(/'''?/g, '').replace(/<[^>]+>/g, ' ');
  s = s.replace(/[{}[\]|]/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}
function teamTarget(raw: string): string {
  const m = raw.match(/\[\[([^\]|]+)/);
  return m ? m[1].trim() : cleanTeam(raw);
}
// Wikipedia sometimes spells a player differently from the tour's own listing — a
// transliteration ("Alexander" vs "Aleksandr" Shevchenko) or a plain typo: the 2026 US Open
// draw slot says "Francis Tiafoe" while the seed list on the SAME page says Frances, who is
// seed 11. Neither accent-folding nor word-sorting can bridge those, and the failure is
// silent — the player resolves to a synthetic id and is simply absent from the field.
// Keyed by the normalised WIKIPEDIA spelling, valued by the normalised ROSTER spelling.
const ALIAS: Record<string, string> = {
  'alexander shevchenko': 'aleksandr shevchenko',
  'francis tiafoe': 'frances tiafoe',
  'daniel vallejo': 'adolfo daniel vallejo',
};

function buildResolver(roster: { id: string; name: string }[]): (raw: string) => string {
  const byName = new Map(roster.map((p) => [norm(p.name), p.id]));
  const viaAlias = (n: string) => byName.get(ALIAS[n] ?? "");
  const sortWords = (s: string) => s.split(' ').filter(Boolean).sort().join(' ');
  const bySorted = new Map(roster.map((p) => [sortWords(norm(p.name)), p.id]));
  return (raw: string) => {
    const stripped = stripDisambig(teamTarget(raw));
    return byName.get(norm(teamTarget(raw)))
      ?? byName.get(norm(stripped))
      ?? viaAlias(norm(stripped))
      ?? bySorted.get(sortWords(norm(stripped)))
      ?? `x_${norm(stripped).replace(/\s+/g, '_')}`;
  };
}
function splitBrackets(wikitext: string): { type: string; text: string }[] {
  const starts = [...wikitext.matchAll(/\{\{(\d+TeamBracket[^\s|}]*)/g)];
  const idxs = starts.map((m) => m.index ?? 0).concat([wikitext.length]);
  return starts.map((m, i) => ({ type: m[1].trim(), text: wikitext.slice(idxs[i], idxs[i + 1]) }));
}
const TBD = { id: 'tbd', bold: false };
interface DrawMeta { name: string; country?: string }
type DrawMetaMap = Record<string, DrawMeta>;
const flagCode = (raw: string): string | undefined =>
  raw.match(/\{\{\s*flag[a-z]*\s*\|\s*([A-Za-z]{2,3})\b/i)?.[1];

const cleanScore = (raw: string): string =>
  raw.replace(/<sup>.*?<\/sup>/gi, '').replace(/'''?/g, '').replace(/\{\{[^}]*\}\}/g, '')
    .replace(/<[^>]+>/g, '').replace(/[{}[\]|]/g, '').trim();

function parseBracket(
  wikitext: string, roundIds: RoundId[], resolve: (raw: string) => string, includeIncomplete = false,
): { draw: LiveMatch[]; results: LiveResults; meta: DrawMetaMap; scores: LiveScores } {
  const teams: Record<number, Record<number, { id: string; bold: boolean }>> = {};
  const meta: DrawMetaMap = {};
  const re = /\|\s*RD(\d+)-team(\d+)\s*=\s*(.*?)(?=\s*\|\s*RD|$)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(wikitext)) !== null) {
    const rd = Number(m[1]); const idx = Number(m[2]) - 1; const raw = m[3];
    if (!cleanTeam(raw)) continue;
    const id = resolve(raw);
    (teams[rd] ??= {})[idx] = { id, bold: /'''/.test(raw) };
    if (id.startsWith('x_') && !meta[id]) {
      const country = flagCode(raw);
      meta[id] = country ? { name: stripDisambig(teamTarget(raw)), country } : { name: stripDisambig(teamTarget(raw)) };
    }
  }

  const scoreCells: Record<number, Record<number, Record<number, string>>> = {};
  const sre = /\|\s*RD(\d+)-score(\d+)-(\d+)\s*=\s*(.*?)(?=\s*\|\s*RD|$)/gm;
  let sm: RegExpExecArray | null;
  while ((sm = sre.exec(wikitext)) !== null) {
    const rd = Number(sm[1]); const idx = Number(sm[2]) - 1; const set = Number(sm[3]);
    const val = cleanScore(sm[4]);
    if (val) ((scoreCells[rd] ??= {})[idx] ??= {})[set] = val;
  }
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
      if (!a && !b) continue;
      if ((!a || !b) && !includeIncomplete) continue;
      const p1 = a ?? TBD;
      const p2 = b ?? TBD;
      draw.push({ round, slot, half: slot < pairCount / 2 ? 'top' : 'bottom', p1Id: p1.id, p2Id: p2.id });
      const sc = pairingScore(rd, slot * 2, slot * 2 + 1);
      if (sc) scores[matchKey(round, slot)] = sc;
      let winnerId: string | undefined;
      if (p1.bold && !p2.bold) winnerId = p1.id;
      else if (p2.bold && !p1.bold) winnerId = p2.id;
      else winnerId = nextRound[slot]?.id;
      if (winnerId === p1.id || winnerId === p2.id) results[matchKey(round, slot)] = winnerId;
    }
  }
  return { draw, results, meta, scores };
}

interface MatchRow {
  tournament_id: string; round: string; slot: number;
  p1_id: string; p2_id: string; winner_id: string | null;
  score_line: string | null;
}

// The set score as a human reads it: winner first, sets space-separated - '6-4 3-6 7-6'.
// parseFullDraw already extracts the per-set games and, until now, buildMatchRows threw them away;
// every user's browser then re-fetched and re-parsed the same page to show them. Winner-first
// because that is how a score is written on any draw sheet, and storing pairing order would force
// every consumer to re-derive the orientation from winner_id.
function scoreLine(sc: MatchScore | undefined, p1: string, _p2: string, winner: string | null): string | null {
  if (!sc || !winner) return null;
  const winnerIsP1 = winner === p1;
  const a = winnerIsP1 ? sc.p1 : sc.p2;
  const b = winnerIsP1 ? sc.p2 : sc.p1;
  const sets: string[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i], y = b[i];
    if (!x || !y) continue;
    sets.push(x + '-' + y);
  }
  return sets.length ? sets.join(' ') : null;
}
function buildMatchRows(
  tournamentId: string, draw: LiveMatch[], results: LiveResults,
  existingWinners: Record<string, string | null> = {}, overrides: Record<string, string> = {},
  scores: LiveScores = {},
): MatchRow[] {
  return draw.map((m) => {
    const key = matchKey(m.round, m.slot);
    const ov = overrides[key];
    const validOverride = ov === m.p1Id || ov === m.p2Id ? ov : undefined;
    const winner = validOverride ?? results[key] ?? existingWinners[key] ?? null;
    return {
      tournament_id: tournamentId, round: m.round, slot: m.slot,
      p1_id: m.p1Id, p2_id: m.p2Id, winner_id: winner,
      score_line: scoreLine(scores[key], m.p1Id, m.p2Id, winner),
    };
  });
}

const SECTION_ROUNDS: RoundId[] = ['R128', 'R64', 'R32', 'R16'];
const FINALS_ROUNDS: RoundId[] = ['QF', 'SF', 'F'];

function parseFullDraw(
  wikitext: string, opts: { scoredRounds: RoundId[]; resolve: (raw: string) => string; includeIncomplete?: boolean },
): { draw: LiveMatch[]; results: LiveResults; meta: DrawMetaMap; scores: LiveScores } {
  const { scoredRounds, resolve, includeIncomplete = false } = opts;
  const brackets = splitBrackets(wikitext);
  const sections = brackets.filter((b) => /^16TeamBracket/i.test(b.type));
  const finals = brackets.find((b) => /^8TeamBracket/i.test(b.type));

  if (sections.length === 0) return parseBracket(wikitext, scoredRounds, resolve, includeIncomplete);

  // SHAPE GUARD. Slots are structural — sectionIndex × pairsPerSection + local slot — which keeps a
  // match's identity stable as the draw fills in. splitBrackets matches ANY NTeamBracket, so an extra
  // 16-team bracket appearing on the page would push every later section's index up by one and hand
  // already-recorded winners to different pairings: the exact failure structural slots exist to stop.
  // Both a 96-draw Masters and a 128-draw Slam publish exactly 8.
  //
  // Guarded on MORE than 8, not "not exactly 8", and the asymmetry is deliberate. Extra sections are
  // the dangerous direction. FEWER is normal and safe: a partially-published page simply has trailing
  // sections missing, and because section i always owns the same slot range, the ones already present
  // keep the numbering they will still have once the rest arrive. (It is also what the parser unit
  // tests exercise, with a single-section fixture.)
  //
  // NB this cannot catch a bracket inserted EARLIER while the total stays 8 — nothing stateless can.
  // It catches the case actually reported. Failing loudly writes ok:false to ingest_health, while
  // buildMatchRows' never-regress merge preserves every result already stored.
  //
  // This comment used to claim the throw also "trips the watchdog". It did not. pipeline_watchdog()
  // compared last_run_at against now() and never read ok — and the catch block stamps a FRESH
  // last_run_at on failure, so a permanently-throwing ingest kept a perfectly healthy heartbeat and
  // silenced the alarm indefinitely. Fixed 2026-08-18 in pipeline_watchdog.sql, which now alerts on
  // stale OR not-ok. Worth stating plainly, because the guard's whole safety argument rests on the
  // failure being noticed.
  if (sections.length > 8) {
    throw new Error(`Draw shape unexpected: ${sections.length} section brackets, expected at most 8. Refusing to parse rather than risk renumbering slots.`);
  }

  const perRound: Partial<Record<RoundId, { slot: number; winner: string | undefined; p1Id: string; p2Id: string; score: MatchScore | undefined }[]>> = {};
  const meta: DrawMetaMap = {};
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
    const total = roundTotal[round] ?? list.length;
    for (const item of list) {
      draw.push({ round, slot: item.slot, half: item.slot < total / 2 ? 'top' : 'bottom', p1Id: item.p1Id, p2Id: item.p2Id });
      if (item.winner) results[matchKey(round, item.slot)] = item.winner;
      if (item.score) scores[matchKey(round, item.slot)] = item.score;
    }
  }
  return { draw, results, meta, scores };
}
// ════════════ END PARSER INLINED COPY ════════════

// REGISTRY of every tournament this deploy can ingest. Each entry's page/rounds/field MUST stay in
// sync with src/data/tournamentConfig.ts + src/data/liveData.ts (guarded by liveIngestParity.test.ts);
// this standalone Deno file can't import the Vite config.
//
// Why a registry and not one baked-in tournament: previously this function was built for exactly ONE
// event, so switching tournaments meant redeploying it and flipping app_config in the right order —
// a coupled release with a real window for mismatch. Carrying every live-or-imminent event means the
// cutover is just the app_config flip (no redeploy, no ordering hazard), and an id we don't know
// still fails LOUDLY below instead of ingesting the wrong draw.
const TOURNAMENTS: Record<string, { page: string; rounds: readonly string[]; roster: { id: string; name: string }[] }> = {
  montreal_2026: {
    page: "2026 National Bank Open – Men's singles",
    rounds: ['R64', 'R32', 'R16', 'QF', 'SF', 'F'],
    roster: montrealField as { id: string; name: string }[],
  },
  cincinnati_2026: {
    page: "2026 Cincinnati Open – Men's singles",
    rounds: ['R64', 'R32', 'R16', 'QF', 'SF', 'F'],
    roster: cincinnatiField as { id: string; name: string }[],
  },
  // A SLAM, so SEVEN rounds and R128 IS scored — the Masters above have 96-player draws
  // where the seeds get a bye and the unscored opening round never reaches `matches` at all.
  // Getting this list wrong is silent: a round missing here is simply never ingested.
  usopen_2026: {
    page: "2026 US Open – Men's singles",
    rounds: ['R128', 'R64', 'R32', 'R16', 'QF', 'SF', 'F'],
    roster: usopenField as { id: string; name: string }[],
  },
};
// NO DEFAULT, deliberately. A hardcoded fallback here meant a bodyless invoke silently ingested
// whatever that constant named — and once that event finished, every such call quietly re-scraped
// a dead tournament and reported success. The crons always send an id (from app_config, the single
// source of truth), so a missing one means the caller has not said what it wants: answer 400.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

// ── transient-failure shield for the REST hop ──────────────────────────────────────────
// On the free-tier box the FIRST call of a cold run sometimes takes 5–15 s while PostgREST opens a
// fresh DB connection, and the gateway answers 504 "Gateway Timeout" (seen 2026-09-11, ~50% of runs
// through the US Open SF day). The very next call always succeeded — so the run used to die on a
// hiccup that a second attempt would have cleared. Every call this function makes is idempotent
// (selects, onConflict upserts, keyed deletes), so retrying a 502/503/504 or a network error is safe.
const pathOf = (input: RequestInfo | URL): string => {
  try { return new URL(input instanceof Request ? input.url : String(input)).pathname; } catch { return '?'; }
};
const RETRY_STATUS = new Set([502, 503, 504]);
const REST_ATTEMPTS = 3;
const retryingFetch: typeof fetch = async (input, init) => {
  let lastRes: Response | undefined;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= REST_ATTEMPTS; attempt++) {
    if (attempt > 1) await new Promise((r) => setTimeout(r, 1500 * (attempt - 1)));
    try {
      const res = await fetch(input, init);
      if (!RETRY_STATUS.has(res.status)) return res;
      lastRes = res;
      console.warn(`rest ${res.status} on attempt ${attempt}/${REST_ATTEMPTS}: ${pathOf(input)}`);
      await res.body?.cancel().catch(() => {});
    } catch (e) {
      lastErr = e;
      console.warn(`rest network error on attempt ${attempt}/${REST_ATTEMPTS}:`, e);
    }
  }
  if (lastRes) return lastRes;
  throw lastErr;
};
const restClient = () =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { global: { fetch: retryingFetch } });
// A PostgREST error is a plain object, not an Error, so String(err) used to log "[object Object]"
// (the watchdog alert then said nothing useful). Prefer .message, else the JSON.
const errorText = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  const m = (err as { message?: unknown } | null)?.message;
  if (typeof m === 'string' && m) return m;
  try { return JSON.stringify(err); } catch { return String(err); }
};

type Override = { round: string; slot: number; winnerId: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const denied = assertServiceRole(req);
  if (denied) return denied;
  let tournamentId = '(none supplied)';
  try {
    const db = restClient();

    let body: { page?: string; tournamentId?: string; overrides?: Override[]; clearOverrides?: { round: string; slot: number }[] } = {};
    try { body = await req.json(); } catch { /* cron/no-body invoke */ }
    // SAFETY: each tournament needs its own field (name→id resolution) + Wikipedia page, both baked
    // in at deploy. So we may only ingest an event present in the registry above. If the cron/config
    // asks for one we don't carry (e.g. app_config flipped to a new event before this was redeployed),
    // REFUSE loudly rather than fetch the wrong draw and write it under the wrong id — the error lands
    // in ingest_health and the watchdog alerts. A custom body.page (manual re-parse) is still allowed.
    const requestedId = body.tournamentId;
    if (!requestedId) {
      return json({ ok: false, error: `ingest-draw requires an explicit tournamentId (carries: ${Object.keys(TOURNAMENTS).join(', ')}). Refusing to guess which tournament you meant.` }, 400);
    }
    const cfg = TOURNAMENTS[requestedId];
    if (!cfg) {
      throw new Error(`ingest-draw has no field/page for "${requestedId}" (carries: ${Object.keys(TOURNAMENTS).join(', ')}). Add it to the TOURNAMENTS registry and redeploy before switching app_config.active_tournament_id.`);
    }
    tournamentId = requestedId;
    const page = body.page ?? cfg.page;
    const roster = cfg.roster;
    const SCORED_ROUNDS = cfg.rounds;

    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(page)}`
      + `&prop=wikitext&formatversion=2&format=json&origin=*`;
    const fetchWiki = async (): Promise<string> => {
      const res = await fetch(wikiUrl);
      if (!res.ok) throw new Error(`Wikipedia fetch failed: ${res.status}`);
      const wiki = await res.json();
      const wt = wiki?.parse?.wikitext;
      if (typeof wt !== 'string') throw new Error(wiki?.error?.info ?? 'Draw page not found');
      return wt;
    };
    let wikitext: string;
    try { wikitext = await fetchWiki(); }
    catch { await new Promise((r) => setTimeout(r, 1500)); wikitext = await fetchWiki(); }

    const resolve = buildResolver(roster);
    // `scores` was parsed and then dropped here for the whole life of this function — every user's
    // browser re-fetched and re-parsed the same page just to show a set score. It is now carried
    // through to buildMatchRows and stored once, by the cron, for everyone.
    const { draw, results, scores } = parseFullDraw(wikitext, { scoredRounds: [...SCORED_ROUNDS], resolve });

    const existingWinners: Record<string, string | null> = {};
    {
      const { data: prior, error } = await db
        .from('matches').select('round, slot, winner_id').eq('tournament_id', tournamentId);
      if (error) throw error;
      for (const r of prior ?? []) existingWinners[`${r.round}_${r.slot}`] = r.winner_id;
    }

    for (const o of body.overrides ?? []) {
      const { error } = await db.from('match_overrides').upsert(
        { tournament_id: tournamentId, round: o.round, slot: o.slot, winner_id: o.winnerId },
        { onConflict: 'tournament_id,round,slot' });
      if (error) throw error;
    }
    for (const c of body.clearOverrides ?? []) {
      const { error } = await db.from('match_overrides').delete()
        .eq('tournament_id', tournamentId).eq('round', c.round).eq('slot', c.slot);
      if (error) throw error;
    }
    const overrides: Record<string, string> = {};
    try {
      const { data: ov, error } = await db.from('match_overrides')
        .select('round, slot, winner_id').eq('tournament_id', tournamentId);
      if (error) throw error;
      for (const o of ov ?? []) overrides[`${o.round}_${o.slot}`] = o.winner_id as string;
    } catch (e) { console.error('match_overrides read failed (continuing without overrides):', e); }

    const rows = buildMatchRows(tournamentId, draw, results, existingWinners, overrides, scores);
    let written = 0;
    if (rows.length) {
      const { error } = await db.from('matches').upsert(rows, { onConflict: 'tournament_id,round,slot' });
      if (error) throw error;
      written = rows.length;
    }

    const inDraw = new Set<string>();
    for (const m of draw) { inDraw.add(m.p1Id); inDraw.add(m.p2Id); }
    const draftedMissing = draw.length ? roster.map((p) => p.id).filter((id) => !inDraw.has(id)) : [];

    const ranAt = new Date().toISOString();
    await db.from('ingest_health').upsert({
      tournament_id: tournamentId, last_run_at: ranAt, ok: true,
      pairings: draw.length, results_known: Object.keys(results).length, matches_written: written,
      drafted_missing_count: draftedMissing.length, drafted_missing: draftedMissing.slice(0, 40), error: null,
    }, { onConflict: 'tournament_id' }).then(({ error }) => { if (error) console.error('ingest_health write:', error); });

    return json({
      ok: true, tournamentId, page,
      pairings: draw.length,
      resultsKnown: Object.keys(results).length,
      overridesApplied: Object.keys(overrides).length,
      matchesWritten: written,
      draftedMissingCount: draftedMissing.length,
      draftedMissing: draftedMissing.slice(0, 20),
      ranAt,
    });
  } catch (err) {
    console.error('ingest-draw error:', err);
    try {
      const db = restClient();
      await db.from('ingest_health').upsert({
        tournament_id: tournamentId, last_run_at: new Date().toISOString(), ok: false,
        error: errorText(err).slice(0, 500),
      }, { onConflict: 'tournament_id' });
    } catch { /* best-effort */ }
    return json({ ok: false, error: 'internal error' }, 500);
  }
});
