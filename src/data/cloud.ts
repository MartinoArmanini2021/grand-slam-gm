// ── Cloud data access (Supabase) ─────────────────────────────────────────────
// Thin, typed wrappers over the Supabase tables. Every function is a no-op / null
// when Supabase isn't configured (guest mode), so callers never need to branch —
// the app runs identically offline. RLS on the server is the real guard; these
// just map between the app's shapes and the DB columns.

import { supabase } from '../auth/supabaseClient';

// Row shape for public.profiles (snake_case, as stored).
export interface CloudProfile {
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  country: string | null;
  team_name: string | null;
  team_emblem: string | null;
}

// Fetch the signed-in user's profile row (null if none / guest / error).
export async function fetchProfile(userId: string): Promise<CloudProfile | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('username, first_name, last_name, country, team_name, team_emblem')
    .eq('id', userId)
    .maybeSingle();
  if (error) { console.warn('[cloud] fetchProfile:', error.message); return null; }
  return (data as CloudProfile | null) ?? null;
}

// Upsert the signed-in user's profile row. RLS allows writing only your own id.
// `username` is UNIQUE, so a collision would otherwise fail the WHOLE upsert and lose
// the team name/emblem/etc too — on that error we retry without the username so
// everything else still persists (the username just keeps its previous value).
export async function saveProfile(userId: string, p: CloudProfile): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: userId, ...p }, { onConflict: 'id' });
  if (!error) return;
  const isDupUsername = error.code === '23505' || /username/i.test(error.message);
  if (isDupUsername) {
    const { username: _taken, ...rest } = p;
    const { error: retryError } = await supabase
      .from('profiles')
      .upsert({ id: userId, ...rest }, { onConflict: 'id' });
    console.warn(retryError
      ? `[cloud] saveProfile retry: ${retryError.message}`
      : '[cloud] saveProfile: username already taken — kept previous username, saved the rest');
    return;
  }
  console.warn('[cloud] saveProfile:', error.message);
}

// ── Entries (a user's squad + progress for one tournament) ────────────────────

// The public global league id, cached (every entry lands here unless it's moved to
// a private league later).
let cachedPublicLeagueId: string | null = null;
export async function publicLeagueId(): Promise<string | null> {
  if (!supabase) return null;
  if (cachedPublicLeagueId) return cachedPublicLeagueId;
  const { data, error } = await supabase
    .from('leagues').select('id').eq('is_public', true).limit(1).maybeSingle();
  if (error) { console.warn('[cloud] publicLeagueId:', error.message); return null; }
  cachedPublicLeagueId = data?.id ?? null;
  return cachedPublicLeagueId;
}

// What the client writes for its entry: the scoring inputs (typed columns the
// server scorer reads) + a full state snapshot for device restore. Never `score`.
export interface EntryWrite {
  squad: string[];
  captainHistory: unknown;
  phase: string;
  currentRoundIndex: number;
  budget: number;
  state: unknown;       // the persisted gameStore snapshot
}

// Returns null for a CONFIRMED absence (no row), and THROWS on a load failure
// (network/query/RLS error). Callers must distinguish the two: treating a failed
// load as "no entry" would let the onboarding gate reset+overwrite a real cloud squad.
export async function fetchEntry(
  userId: string, leagueId: string, tournamentId: string,
): Promise<{ score: number; state: Record<string, unknown>; updatedAt: string | null; rev: number } | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('entries')
    .select('score, state, updated_at, rev')
    .eq('user_id', userId).eq('league_id', leagueId).eq('tournament_id', tournamentId)
    .maybeSingle();
  // Backward-compatible: if the `rev` column isn't added yet (add_entry_rev.sql not applied),
  // retry without it so entry loading never breaks on the deploy-before-migration window.
  if (error && revColumnMissing(error)) {
    const legacy = await supabase
      .from('entries').select('score, state, updated_at')
      .eq('user_id', userId).eq('league_id', leagueId).eq('tournament_id', tournamentId).maybeSingle();
    if (legacy.error) { console.warn('[cloud] fetchEntry:', legacy.error.message); throw new Error(`fetchEntry: ${legacy.error.message}`); }
    return legacy.data
      ? { score: legacy.data.score as number, state: (legacy.data.state ?? {}) as Record<string, unknown>, updatedAt: (legacy.data.updated_at as string) ?? null, rev: 0 }
      : null;
  }
  if (error) { console.warn('[cloud] fetchEntry:', error.message); throw new Error(`fetchEntry: ${error.message}`); }
  return data
    ? { score: data.score as number, state: (data.state ?? {}) as Record<string, unknown>, updatedAt: (data.updated_at as string) ?? null, rev: (data.rev as number) ?? 0 }
    : null;
}

// The `rev` column (add_entry_rev.sql) may not be applied yet at deploy time; detect its
// absence so the save/fetch paths can fall back to their pre-version-guard behavior.
function revColumnMissing(e: { code?: string; message?: string }): boolean {
  return e.code === '42703' || /column .*\brev\b.* does not exist/i.test(e.message ?? '');
}

// ── Leagues (public + private, join-by-code) ─────────────────────────────────

export interface MyLeague { id: string; name: string; code: string | null; isPublic: boolean; ownerId: string | null }
export interface LeagueMember { userId: string; username: string; teamName: string; teamEmblem: string }

// Every league you can see: the public placeholder + any private league you're a
// member of (RLS on `leagues` returns exactly these). Public first.
export async function fetchMyLeagues(): Promise<MyLeague[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('leagues').select('id, name, code, is_public, owner_id')
    .order('is_public', { ascending: false });
  if (error) { console.warn('[cloud] fetchMyLeagues:', error.message); return []; }
  return (data ?? []).map(l => ({
    id: l.id as string, name: l.name as string, code: l.code as string | null,
    isPublic: l.is_public as boolean, ownerId: l.owner_id as string | null,
  }));
}

// The members of a league (with their safe profile fields) — for the manage roster.
export async function fetchLeagueMembers(leagueId: string): Promise<LeagueMember[]> {
  if (!supabase) return [];
  const { data: members } = await supabase.from('league_members').select('user_id').eq('league_id', leagueId);
  const ids = (members ?? []).map(m => m.user_id as string);
  if (!ids.length) return [];
  const { data: profs } = await supabase.from('public_profiles').select('id, username, team_name, team_emblem').in('id', ids);
  const byId = new Map((profs ?? []).map(p => [p.id, p]));
  return ids.map(id => {
    const p = byId.get(id);
    return { userId: id, username: (p?.username as string) || '', teamName: (p?.team_name as string) || 'Team', teamEmblem: (p?.team_emblem as string) || '🎾' };
  });
}

export async function deleteLeague(leagueId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc('delete_league', { p_league: leagueId });
  if (error) throw error;
}
export async function leaveLeague(leagueId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc('leave_league', { p_league: leagueId });
  if (error) throw error;
}
export async function removeMember(leagueId: string, userId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc('remove_member', { p_league: leagueId, p_user: userId });
  if (error) throw error;
}

// Create a private league (server picks the invite code, auto-joins you). Throws on error.
export async function createLeague(name: string): Promise<{ id: string; code: string }> {
  if (!supabase) throw new Error('Accounts are not configured.');
  const { data, error } = await supabase.rpc('create_league', { p_name: name });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return { id: row.id as string, code: row.code as string };
}

// Join a private league by its code. Throws (with a friendly message) on a bad code.
export async function joinLeague(code: string): Promise<{ id: string; name: string }> {
  if (!supabase) throw new Error('Accounts are not configured.');
  const { data, error } = await supabase.rpc('join_league', { p_code: code });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return { id: row.id as string, name: row.name as string };
}

// One row per real player in a league's tournament, for the shared leaderboard.
export interface CloudBoardRow {
  userId: string;
  teamName: string;
  teamEmblem: string;
  username: string;
  score: number;
  budget: number;
  squad: string[];
  captain: string | null;
  viceCaptain: string | null;
}

type EntryRow = { user_id: string; score: number | null; budget: number | null; state: unknown };
type ProfRow = { id: string; team_name: string | null; team_emblem: string | null; username: string | null };

// Build a board row from a member id + their (optional) entry + (optional) profile.
// A member with no entry yet still appears — score 0, empty squad — so friends who've
// joined but not drafted are visible (the "who still needs to pick" signal).
function boardRow(userId: string, entry: EntryRow | undefined, prof: ProfRow | undefined): CloudBoardRow {
  const st = (entry?.state ?? {}) as { myTeam?: string[]; captain?: string | null; viceCaptain?: string | null };
  return {
    userId,
    teamName: prof?.team_name || 'Team',
    teamEmblem: prof?.team_emblem || '🎾',
    username: prof?.username || '',
    // Score is the SERVER-authoritative column only (the client can't write `score`).
    // We deliberately do NOT fall back to the client-written `state.myScore` — that would
    // be spoofable. Everyone reads 0 until the server scorer runs, then it's truth.
    score: (entry?.score as number | null) ?? 0,
    budget: (entry?.budget as number) ?? 0,
    squad: Array.isArray(st.myTeam) ? st.myTeam : [],
    captain: st.captain ?? null,
    viceCaptain: st.viceCaptain ?? null,
  };
}

const PUBLIC_BOARD_LIMIT = 250; // top managers shown on the global board (bounded for scale)

// The leaderboard for a league. Two shapes, so the data is always complete AND scalable:
//  • allMembers (PRIVATE league): one row per MEMBER — including friends who joined but
//    haven't drafted yet (they show with no squad). Small, so we list everyone.
//  • otherwise (PUBLIC global league): the top entries by score, read DIRECTLY (never a
//    full-membership scan — the public league can hold hundreds of thousands of rows).
// Names come from the public_profiles view (safe columns only; PII stays private).
export async function fetchLeaderboard(
  leagueId: string, tournamentId: string, opts: { allMembers?: boolean } = {},
): Promise<CloudBoardRow[]> {
  if (!supabase) return [];

  if (opts.allMembers) {
    const { data: members, error: mErr } = await supabase
      .from('league_members').select('user_id').eq('league_id', leagueId);
    if (mErr) { console.warn('[cloud] leaderboard members:', mErr.message); return []; }
    const ids = (members ?? []).map(m => m.user_id as string);
    if (!ids.length) return [];
    const [entriesRes, profsRes] = await Promise.all([
      supabase.from('entries').select('user_id, score, budget, state').in('user_id', ids).eq('tournament_id', tournamentId),
      supabase.from('public_profiles').select('id, team_name, team_emblem, username').in('id', ids),
    ]);
    if (entriesRes.error) console.warn('[cloud] leaderboard entries:', entriesRes.error.message);
    const entryBy = new Map((entriesRes.data as EntryRow[] ?? []).map(e => [e.user_id, e]));
    const profBy = new Map((profsRes.data as ProfRow[] ?? []).map(p => [p.id, p]));
    return ids.map(uid => boardRow(uid, entryBy.get(uid), profBy.get(uid)));
  }

  // Public board: prefer the CACHED edge endpoint (/api/leaderboard/:tid) so board reads
  // scale with the cache, not the user count. Fall back to a direct Supabase query when
  // it's unavailable (local dev, or before the function is deployed).
  try {
    const res = await fetch(`/api/leaderboard/${encodeURIComponent(tournamentId)}`);
    if (res.ok) {
      const rows = await res.json();
      // Require a NON-EMPTY result to trust the cache: an empty [] is ambiguous (a truly
      // empty board vs. anon can't read yet because public_leaderboard.sql isn't applied),
      // so fall back to the authenticated direct query, which is always correct.
      if (Array.isArray(rows) && rows.length > 0) return rows as CloudBoardRow[];
    }
  } catch { /* fall through to a direct query */ }

  // Fallback: ranked entries, bounded, direct from Supabase.
  const { data: entries, error } = await supabase
    .from('entries')
    .select('user_id, score, budget, state')
    .eq('tournament_id', tournamentId)
    .order('score', { ascending: false })
    .limit(PUBLIC_BOARD_LIMIT);
  if (error) { console.warn('[cloud] leaderboard:', error.message); return []; }
  const rows = (entries as EntryRow[] ?? []);
  if (!rows.length) return [];
  const ids = rows.map(e => e.user_id);
  const { data: profs } = await supabase
    .from('public_profiles').select('id, team_name, team_emblem, username').in('id', ids);
  const profBy = new Map((profs as ProfRow[] ?? []).map(p => [p.id, p]));
  return rows.map(e => boardRow(e.user_id, e, profBy.get(e.user_id)));
}

// Save with OPTIMISTIC CONCURRENCY (F2). `baseRev` is the rev the caller last read; the
// write only lands if the row's rev still equals it, so a stale writer (a second tab/device
// that edited from an older read) can't silently clobber a newer save. Returns:
//   { ok:true, rev }         — saved; `rev` is the new value to remember
//   { ok:false, conflict }   — someone else wrote first; caller should re-fetch + converge
//   { ok:false }             — a transient/other failure; caller surfaces "not saved"
// The server scorer bumps score/updated_at but NOT rev, so this never false-conflicts on a
// scoring cycle. (Migration-safe: pre-existing rows are rev=0, matching a first baseRev of 0.)
export async function saveEntry(
  userId: string, leagueId: string, tournamentId: string, e: EntryWrite, baseRev = 0,
): Promise<{ ok: boolean; rev: number; conflict?: boolean }> {
  if (!supabase) return { ok: false, rev: baseRev };
  const base = {
    squad: e.squad, captain_history: e.captainHistory, phase: e.phase,
    current_round_index: e.currentRoundIndex, budget: e.budget, state: e.state,
    updated_at: new Date().toISOString(),
  };
  // Pre-migration fallback: no `rev` column yet → plain upsert (old last-writer-wins).
  const legacyUpsert = async (): Promise<{ ok: boolean; rev: number }> => {
    const { error } = await supabase!.from('entries')
      .upsert({ user_id: userId, league_id: leagueId, tournament_id: tournamentId, ...base }, { onConflict: 'user_id,league_id,tournament_id' });
    if (error) console.warn('[cloud] saveEntry (legacy) failed:', error.message);
    return { ok: !error, rev: baseRev };
  };

  // 1) Guarded UPDATE: succeeds only if rev is unchanged since we read it.
  const { data: upd, error: uErr } = await supabase.from('entries')
    .update({ ...base, rev: baseRev + 1 })
    .eq('user_id', userId).eq('league_id', leagueId).eq('tournament_id', tournamentId).eq('rev', baseRev)
    .select('rev').maybeSingle();
  if (uErr && revColumnMissing(uErr)) return legacyUpsert();
  if (uErr) { console.warn('[cloud] saveEntry update:', uErr.message); return { ok: false, rev: baseRev }; }
  if (upd) return { ok: true, rev: (upd.rev as number) };
  // 2) No row updated → the entry doesn't exist yet (first save → insert) OR rev moved on.
  const { data: ins, error: iErr } = await supabase.from('entries')
    .insert({ user_id: userId, league_id: leagueId, tournament_id: tournamentId, ...base, rev: 1 })
    .select('rev').maybeSingle();
  if (iErr && revColumnMissing(iErr)) return legacyUpsert();
  if (!iErr && ins) return { ok: true, rev: (ins.rev as number) };
  // A unique-violation on insert means the row EXISTS but rev didn't match → real conflict.
  if (iErr && iErr.code === '23505') { console.warn('[cloud] saveEntry: concurrent write conflict'); return { ok: false, rev: baseRev, conflict: true }; }
  console.warn('[cloud] saveEntry failed:', iErr?.message);
  return { ok: false, rev: baseRev };
}
