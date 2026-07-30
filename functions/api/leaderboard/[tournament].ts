// ── Cloudflare Pages Function: cached public leaderboard ─────────────────────
// GET /api/leaderboard/:tournament → the top managers by score for that tournament,
// served from Cloudflare's EDGE CACHE (20s TTL). This decouples board reads from user
// count: a million viewers cost ONE Supabase query per 20s per tournament, instead of
// one query per user every poll. Reads via the PUBLIC anon key (leaderboard data is
// public + non-PII; anon SELECT is granted in supabase/public_leaderboard.sql).
// The client falls back to a direct Supabase query if this endpoint is unavailable.

const SUPABASE_URL = "https://mrdmlfumdsxufifjulbt.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yZG1sZnVtZHN4dWZpZmp1bGJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNzU1NTQsImV4cCI6MjEwMDc1MTU1NH0.5SKW9HXQ1rGNUyH1hdgX_esoEYVYK4qPcuRtYgaCdKQ";
const LIMIT = 100; // top managers on the public board (keeps the profile in-list URL short)

interface EntryRow { user_id: string; score: number | null; budget: number | null; state: unknown }
interface ProfRow { id: string; team_name: string | null; team_emblem: string | null; username: string | null }

function boardRow(e: EntryRow, prof?: ProfRow) {
  const st = (e.state ?? {}) as { myTeam?: string[]; captain?: string | null; viceCaptain?: string | null };
  return {
    userId: e.user_id,
    teamName: prof?.team_name || 'Team',
    teamEmblem: prof?.team_emblem || '🎾',
    username: prof?.username || '',
    score: (e.score as number) ?? 0,           // server-authoritative only
    budget: (e.budget as number) ?? 0,
    squad: Array.isArray(st.myTeam) ? st.myTeam : [],
    captain: st.captain ?? null,
    viceCaptain: st.viceCaptain ?? null,
  };
}

const JSON_HEADERS = { 'content-type': 'application/json', 'access-control-allow-origin': '*' } as const;

export const onRequestGet: PagesFunction = async (context) => {
  const { request, params } = context;
  const tid = String(params.tournament || '').replace(/[^a-z0-9_]/gi, '');
  if (!tid) return new Response('[]', { headers: JSON_HEADERS });

  // Serve from the edge cache when warm.
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(new URL(request.url).toString());
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const h = { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${SUPABASE_ANON_KEY}` };
  try {
    // Read the REDACTED board view (B8), not the base table: it exposes score/budget/team
    // always but hides squad/captain for entries still in `phase='draft'` (except the owner),
    // so a rival can't copy an in-progress draft. Post-lock squads are shown as before.
    const entriesRes = await fetch(
      `${SUPABASE_URL}/rest/v1/board_entries?tournament_id=eq.${tid}&select=user_id,score,budget,state&order=score.desc&limit=${LIMIT}`,
      { headers: h },
    );
    // 503 (not 200 []) so the client FALLS BACK to its direct query rather than showing
    // an empty board — e.g. before public_leaderboard.sql grants anon SELECT. Not cached.
    if (!entriesRes.ok) return new Response('[]', { status: 503, headers: JSON_HEADERS });
    const entries = (await entriesRes.json()) as EntryRow[];

    let rows: ReturnType<typeof boardRow>[] = [];
    if (entries.length) {
      const inList = `(${entries.map(e => e.user_id).join(',')})`;
      const profRes = await fetch(
        `${SUPABASE_URL}/rest/v1/public_profiles?id=in.${inList}&select=id,team_name,team_emblem,username`,
        { headers: h },
      );
      const profs = (profRes.ok ? await profRes.json() : []) as ProfRow[];
      const byId = new Map(profs.map(p => [p.id, p]));
      rows = entries.map(e => boardRow(e, byId.get(e.user_id)));
    }

    const res = new Response(JSON.stringify(rows), {
      headers: { ...JSON_HEADERS, 'cache-control': 'public, max-age=20' },
    });
    context.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  } catch {
    return new Response('[]', { status: 503, headers: JSON_HEADERS }); // transient → client falls back
  }
};
