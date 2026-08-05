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

// ── pure scoring (keep identical to src/scoring/serverEngine.ts) ──────────────
const rankingMultiplier = (rank: number) => 0.8 + 0.5 * ((Math.max(1, Math.min(40, rank)) - 1) / 39);
const upsetBonus = (w: number, l: number) => (w <= l ? 0 : Math.min(15, Math.round((w - l) * 0.4)));
// l may be undefined (off-roster opponent, no rank) → no upset, matching the client.
const winPoints = (base: number, w: number, l: number | undefined) =>
  Math.round(base * rankingMultiplier(w)) + (l == null ? 0 : Math.min(upsetBonus(w, l), Math.round(base * 1.5)));

interface MatchRow { round: string; p1: string; p2: string; winner: string | null }
interface EntryState {
  initialSquad?: string[];
  myTeam?: string[]; // current (live) squad — NOT used for scoring (P3)
  transfers?: { out: string; in: string; round: string }[];
  captainHistory?: { round: string; playerId: string }[];
  viceCaptainHistory?: { round: string; playerId: string }[];
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
    const captain = state.captainHistory?.find(c => c.round === round)?.playerId;
    const vice = state.viceCaptainHistory?.find(c => c.round === round)?.playerId;
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

    // Optional { tournamentId } body; default to the active tournament id.
    // Default MUST equal ACTIVE_TOURNAMENT_ID in src/data/tournamentConfig.ts — keep in
    // sync when switching tournaments (this file is standalone Deno, so it can't import it).
    // The cron should also post {"tournamentId":"montreal_2026"} explicitly (see docs/GO_LIVE.md).
    let tournamentId = 'montreal_2026';
    try { const b = await req.json(); if (b?.tournamentId) tournamentId = b.tournamentId; } catch { /* no body */ }

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
