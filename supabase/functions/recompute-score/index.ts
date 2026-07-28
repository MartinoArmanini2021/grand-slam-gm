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
const winPoints = (base: number, w: number, l: number) =>
  Math.round(base * rankingMultiplier(w)) + Math.min(upsetBonus(w, l), Math.round(base * 1.5));

interface MatchRow { round: string; p1: string; p2: string; winner: string | null }
interface EntryState {
  initialSquad?: string[];
  myTeam?: string[]; // current squad — fallback if a squad isn't locked yet
  transfers?: { out: string; in: string; round: string }[];
  captainHistory?: { round: string; playerId: string }[];
  viceCaptainHistory?: { round: string; playerId: string }[];
}

function scoreEntry(state: EntryState, matches: MatchRow[], rankById: Record<string, number>, playedRounds: string[]): number {
  const idx = (r: string) => ROUND_ORDER.indexOf(r);
  const rank = (id: string) => rankById[id] ?? 40;
  const initial = (state.initialSquad?.length ? state.initialSquad : state.myTeam) ?? [];
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
      const pts = winPoints(base, rank(id), rank(opp));
      total += id === captain ? pts * CAPTAIN_MULTIPLIER : id === vice ? Math.round(pts * VICE_MULTIPLIER) : pts;
    }
  }
  return total;
}

Deno.serve(async (req) => {
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const db = createClient(url, serviceKey);

    // Optional { tournamentId } body; default to the active tournament id.
    let tournamentId = 'wimbledon_2026';
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

    const { data: entries, error: eErr } = await db
      .from('entries').select('user_id, state').eq('tournament_id', tournamentId);
    if (eErr) throw eErr;

    let updated = 0;
    for (const e of entries ?? []) {
      const score = scoreEntry((e.state ?? {}) as EntryState, matches, rankById, playedRounds);
      const { error } = await db.from('entries').update({ score }).eq('user_id', e.user_id).eq('tournament_id', tournamentId);
      if (!error) updated++;
    }

    return new Response(JSON.stringify({ ok: true, tournamentId, playedRounds, entriesScored: updated }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
