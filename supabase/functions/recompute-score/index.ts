// ── recompute-score ── Supabase Edge Function (Deno) ─────────────────────────
// Authoritative, server-side scoring. The client can save its squad (entries.state)
// but MUST NOT be trusted for the leaderboard number — RLS blocks clients from
// writing entries.score (see supabase/server_scoring.sql). This function, running
// with the service-role key, is the only writer of that column.
//
// It scores every entry against the RESULTS the server holds (public.matches),
// crediting a squad member's win only if the match result actually exists in the DB
// — so a player can never claim points for a round the tournament hasn't played.
//
// The scoring math is copied verbatim from src/scoring/serverEngine.ts, which a
// parity unit test pins to the client engine (they must stay identical). If you
// change one, change both and re-run `vitest serverScoring`.
//
// Deploy:  supabase functions deploy recompute-score
// Invoke:  supabase functions invoke recompute-score      (or via a cron / webhook)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { assertServiceRole } from '../_shared/serviceGuard.ts';

// Base points per round — the one canonical curve (a Masters final = a Slam final).
const ROUND_POINTS: Record<string, number> = {
  R128: 1, R64: 1, R32: 2, R16: 5, QF: 10, SF: 20, F: 40,
};
const ROUND_ORDER = ['R128', 'R64', 'R32', 'R16', 'QF', 'SF', 'F'];
const CAPTAIN_MULTIPLIER = 2;
const VICE_MULTIPLIER = 1.5;

// ── pure scoring (keep identical to src/scoring/serverEngine.ts + tournament.ts) ──────────────
// Win = base × upset multiplier: favourites/equal keep the FULL base (×1.0); a lower-ranked player
// beating a higher-ranked one lifts the factor toward ×2.0, bigger gap → bigger lift (saturating).
// l may be undefined (off-roster opponent, no rank) → no upset, matching the client.
const UPSET_HALF = 30;
const upsetMultiplier = (w: number, l: number | undefined) =>
  (l == null || w <= l) ? 1 : 1 + (w - l) / ((w - l) + UPSET_HALF);
const winPoints = (base: number, w: number, l: number | undefined) => Math.round(base * upsetMultiplier(w, l));

interface MatchRow { round: string; p1: string; p2: string; winner: string | null }
interface EntryState {
  initialSquad?: string[];
  myTeam?: string[]; // current (live) squad — NOT used for scoring (P3)
  transfers?: { out: string; in: string; round: string }[];
  captainHistory?: { round: string; playerId: string }[];
  viceCaptainHistory?: { round: string; playerId: string }[];
}

// Captain/vice OF RECORD for a round: the pick set for that round, else carried forward from the
// most recent earlier round (a captain stays in force until changed → doubled every round, not only
// R64). Gaps filled from the past only. IDENTICAL to tournament.ts + serverEngine.ts (parity).
function leaderOfRecord(history: { round: string; playerId: string }[] | undefined, round: string): string | undefined {
  const ri = ROUND_ORDER.indexOf(round);
  let best: { round: string; playerId: string } | undefined;
  for (const h of history ?? []) {
    const hi = ROUND_ORDER.indexOf(h.round);
    if (hi >= 0 && hi <= ri && (best === undefined || ROUND_ORDER.indexOf(best.round) < hi)) best = h;
  }
  return best?.playerId;
}

function scoreEntry(state: EntryState, matches: MatchRow[], rankById: Record<string, number>, playedRounds: string[]): number {
  const idx = (r: string) => ROUND_ORDER.indexOf(r);
  const rank = (id: string) => rankById[id] ?? 40;
  // INTEGRITY (P3): score ONLY off the frozen initialSquad snapshot; a never-locked entry
  // scores 0 (pending). Never fall back to the live myTeam, or an unlocked user could bank
  // points off a squad edited AFTER results are known. Keep identical to serverEngine.ts.
  const initial = state.initialSquad ?? [];
  let total = 0;
  for (const round of playedRounds) {
    const ri = idx(round);
    let squad = [...initial];
    for (const t of state.transfers ?? []) if (idx(t.round) < ri) squad = squad.map(id => (id === t.out ? t.in : id));
    const captain = leaderOfRecord(state.captainHistory, round);
    const vice = leaderOfRecord(state.viceCaptainHistory, round);
    const base = ROUND_POINTS[round] ?? 0;
    const rm = matches.filter(m => m.round === round);
    for (const id of squad) {
      const m = rm.find(x => x.p1 === id || x.p2 === id);
      if (!m || m.winner !== id) continue;
      const opp = m.p1 === id ? m.p2 : m.p1;
      const pts = winPoints(base, rank(id), rankById[opp]); // raw opp rank → undefined = no upset
      total += id === captain ? pts * CAPTAIN_MULTIPLIER : id === vice ? pts * VICE_MULTIPLIER : pts; // vice ×1.5 unrounded → 0.5 scores
    }
  }
  return total;
}

Deno.serve(async (req) => {
  // B1: only the cron/service-role may invoke this — reject anon/user JWTs (the public anon
  // key is a valid JWT and would otherwise let any visitor trigger a rescore = DoS).
  const denied = assertServiceRole(req);
  if (denied) return denied;
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const db = createClient(url, serviceKey);

    // Which tournament to score. The cron posts it explicitly (from public.app_config, the single
    // source of truth). If a bodyless manual invoke omits it, fall back to app_config too — so this
    // default can never drift from the crons. The hardcoded fallback guards a missing config row.
    // (Scoring only reads matches/entries by tournament_id — no field/page coupling — so it's always
    // safe to score whatever the config says.)
    let tournamentId: string | undefined;
    try { const b = await req.json(); tournamentId = b?.tournamentId; } catch { /* no body */ }
    if (!tournamentId) {
      const { data: cfg } = await db.from('app_config').select('value').eq('key', 'active_tournament_id').maybeSingle();
      tournamentId = cfg?.value ?? 'montreal_2026';
    }

    // Results the server holds → the rounds that are actually "done".
    const { data: matchRows, error: mErr } = await db
      .from('matches').select('round, p1_id, p2_id, winner_id').eq('tournament_id', tournamentId);
    if (mErr) throw mErr;
    const matches: MatchRow[] = (matchRows ?? []).map(m => ({ round: m.round, p1: m.p1_id, p2: m.p2_id, winner: m.winner_id }));
    const playedRounds = ROUND_ORDER.filter(r => matches.some(m => m.round === r && m.winner));

    const { data: rankRows, error: rErr } = await db.from('player_stats').select('id, ranking');
    if (rErr) throw rErr;
    const rankById: Record<string, number> = Object.fromEntries((rankRows ?? []).map(r => [r.id, r.ranking]));

    // Paginate the entries read. PostgREST caps a single response (db-max-rows, default
    // ~1000), so a bare select would silently score only the FIRST page and freeze
    // everyone else's leaderboard at scale. Loop with .range() until a short page ends it.
    const PAGE = 1000;
    const entries: { user_id: string; state: unknown }[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error: eErr } = await db
        .from('entries').select('user_id, state').eq('tournament_id', tournamentId)
        .range(from, from + PAGE - 1);
      if (eErr) throw eErr;
      const rows = (data ?? []) as { user_id: string; state: unknown }[];
      entries.push(...rows);
      if (rows.length < PAGE) break;
    }

    // Compute every score in memory, then apply them SET-BASED via one RPC per chunk
    // (a single `update … from jsonb_to_recordset`) instead of one round-trip per entry —
    // the serial loop would never finish inside the cron window at 100k+ entries.
    const scores = entries.map(e => ({
      user_id: e.user_id,
      score: scoreEntry((e.state ?? {}) as EntryState, matches, rankById, playedRounds),
    }));
    let updated = 0;
    const CHUNK = 5000;
    for (let i = 0; i < scores.length; i += CHUNK) {
      const chunk = scores.slice(i, i + CHUNK);
      const { error } = await db.rpc('apply_entry_scores', { p_tournament: tournamentId, p_scores: chunk });
      if (error) throw error;
      updated += chunk.length;
    }

    // Heartbeat for the watchdog (supabase/pipeline_watchdog.sql). A fresh last_run_at means the
    // scorer completed; if it stalls or errors, this stops updating and the watchdog alerts. Best-
    // effort — if the table doesn't exist yet (watchdog not applied), never fail the rescore over it.
    try {
      await db.from('scoring_health').upsert(
        { tournament_id: tournamentId, last_run_at: new Date().toISOString(), ok: true, entries_scored: updated, error: null },
        { onConflict: 'tournament_id' });
    } catch { /* health write is best-effort */ }

    return new Response(JSON.stringify({ ok: true, tournamentId, playedRounds, entriesScored: updated }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('recompute-score error:', err); // B6: log detail server-side, don't leak it
    return new Response(JSON.stringify({ ok: false, error: 'internal error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
