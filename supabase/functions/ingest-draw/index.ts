// ── ingest-draw ── Supabase Edge Function (Deno) ─────────────────────────────
// THE BRIDGE that makes the live leaderboard move for everyone. It fetches the Wikipedia
// men's-singles draw, parses it, and writes the results into public.matches with the
// service-role key (clients cannot write matches — see server_scoring.sql). The separate
// recompute-score function then scores every entry off those rows. So the full live chain
// is:  cron → ingest-draw (Wikipedia → matches) → recompute-score (matches → entries.score)
// → cached leaderboard.
//
// Zero parser duplication: it imports the SAME pure parser the client + the 90-plus unit
// tests validate (src/data/drawParser.ts), and the SAME roster the client drafts from
// (src/data/montreal2026Field.json). The server therefore scores off exactly the code the
// tests prove correct — no hand-copied drift.
//
// Deploy:  supabase functions deploy ingest-draw
// Invoke:  supabase functions invoke ingest-draw           (or via the cron in setup_ingest_cron.sql)
// Manual override (a match the feed got wrong or hasn't caught up on):
//   POST { "overrides": [ { "round": "QF", "slot": 0, "winnerId": "shelton" } ] }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { assertServiceRole } from '../_shared/serviceGuard.ts';
import { parseFullDraw, buildResolver, buildMatchRows } from '../../../src/data/drawParser.ts';
import field from '../../../src/data/montreal2026Field.json' with { type: 'json' };

// These MUST stay in sync with src/data/tournamentConfig.ts + src/data/liveData.ts. A unit
// test (liveIngestParity.test.ts) pins them to the app's values, since this standalone Deno
// file can't import the Vite config.
const TOURNAMENT_ID = 'montreal_2026';
const WIKI_PAGE = "2026 National Bank Open – Men's singles";
const SCORED_ROUNDS = ['R64', 'R32', 'R16', 'QF', 'SF', 'F'] as const;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

type Override = { round: string; slot: number; winnerId: string };
const roster = field as { id: string; name: string }[];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  // B1 — CRITICAL: only the cron/service-role may invoke this. Without the guard, any visitor
  // with the public anon key could POST `overrides` and write arbitrary match winners, setting
  // everyone's score. The cron sends the service-role key; anon/user JWTs are rejected 401.
  const denied = assertServiceRole(req);
  if (denied) return denied;
  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    let body: { page?: string; tournamentId?: string; overrides?: Override[] } = {};
    try { body = await req.json(); } catch { /* cron/no-body invoke */ }
    const page = body.page ?? WIKI_PAGE;
    const tournamentId = body.tournamentId ?? TOURNAMENT_ID;

    // 1) Fetch the draw wikitext (CORS-open MediaWiki API). Retry once on a transient
    //    failure so a single flaky request never skips an ingest cycle.
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

    // 2) Parse into the tournament's scored rounds (shared, validated parser).
    const resolve = buildResolver(roster);
    const { draw, results } = parseFullDraw(wikitext, { scoredRounds: [...SCORED_ROUNDS], resolve });

    // 3) Load the winners we ALREADY hold, so a partial/transient parse can never regress a
    //    recorded result to null (the leaderboard only ever moves forward — see buildMatchRows).
    const existingWinners: Record<string, string | null> = {};
    {
      const { data: prior, error } = await db
        .from('matches').select('round, slot, winner_id').eq('tournament_id', tournamentId);
      if (error) throw error;
      for (const r of prior ?? []) existingWinners[`${r.round}_${r.slot}`] = r.winner_id;
    }

    // 4) Manual overrides beat everything (a human always wins over a stale/incorrect feed).
    const overrides: Record<string, string> = {};
    for (const o of body.overrides ?? []) overrides[`${o.round}_${o.slot}`] = o.winnerId;

    // 5) Build rows (override > parsed > previously stored > null) and upsert. PK
    //    (tournament_id, round, slot) → idempotent; re-running is safe and cheap.
    const rows = buildMatchRows(tournamentId, draw, results, existingWinners, overrides);
    let written = 0;
    if (rows.length) {
      const { error } = await db.from('matches').upsert(rows, { onConflict: 'tournament_id,round,slot' });
      if (error) throw error;
      written = rows.length;
    }

    // 5) Health signal: DRAFTED players (real roster ids) that don't appear anywhere in the
    //    parsed draw. Before the draw publishes this is all 74 (draw empty). Once it's up,
    //    a lingering roster id here means either a genuine early loss OR a name mismatch that
    //    would silently cost that player their points — worth eyeballing.
    const inDraw = new Set<string>();
    for (const m of draw) { inDraw.add(m.p1Id); inDraw.add(m.p2Id); }
    const draftedMissing = draw.length ? roster.map((p) => p.id).filter((id) => !inDraw.has(id)) : [];

    return json({
      ok: true,
      tournamentId,
      page,
      pairings: draw.length,
      resultsKnown: Object.keys(results).length,
      overridesApplied: override.size,
      matchesWritten: written,
      draftedMissingCount: draftedMissing.length,
      draftedMissing: draftedMissing.slice(0, 20), // sample, so the response stays small
      ranAt: new Date().toISOString(),
    });
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
});
