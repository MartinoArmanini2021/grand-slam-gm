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

export async function fetchEntry(
  userId: string, leagueId: string, tournamentId: string,
): Promise<{ score: number; state: Record<string, unknown> } | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('entries')
    .select('score, state')
    .eq('user_id', userId).eq('league_id', leagueId).eq('tournament_id', tournamentId)
    .maybeSingle();
  if (error) { console.warn('[cloud] fetchEntry:', error.message); return null; }
  return data ? { score: data.score as number, state: (data.state ?? {}) as Record<string, unknown> } : null;
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
}

// The leaderboard for a league = its members' entries for the tournament, joined to
// their (safe) profiles. Membership-based: read the league's members, then their
// entries. Works for the public global league (everyone is a member) and any private
// league you belong to. (Score is client-sourced from the snapshot until the server
// scorer is live; the board swaps to the authoritative entries.score column then.)
export async function fetchLeaderboard(leagueId: string, tournamentId: string): Promise<CloudBoardRow[]> {
  if (!supabase) return [];
  const { data: members, error: memberError } = await supabase
    .from('league_members').select('user_id').eq('league_id', leagueId);
  if (memberError) { console.warn('[cloud] fetchLeaderboard members:', memberError.message); return []; }
  const memberIds = (members ?? []).map(m => m.user_id as string);
  if (!memberIds.length) return [];

  const { data: entries, error } = await supabase
    .from('entries')
    .select('user_id, score, budget, state')
    .in('user_id', memberIds)
    .eq('tournament_id', tournamentId);
  if (error) { console.warn('[cloud] fetchLeaderboard:', error.message); return []; }
  if (!entries?.length) return [];

  const ids = entries.map(e => e.user_id as string);
  // Read names from the public_profiles view (safe columns only) — the base profiles
  // table is locked to own-row reads so PII (first/last name, country) isn't exposed.
  const { data: profs } = await supabase
    .from('public_profiles').select('id, team_name, team_emblem, username').in('id', ids);
  const byId = new Map((profs ?? []).map(p => [p.id, p]));

  return entries.map(e => {
    const st = (e.state ?? {}) as { myScore?: number; myTeam?: string[] };
    const p = byId.get(e.user_id as string);
    return {
      userId: e.user_id as string,
      teamName: p?.team_name || 'Team',
      teamEmblem: p?.team_emblem || '🎾',
      username: p?.username || '',
      // Prefer the authoritative column once the server sets it; else the snapshot.
      score: (e.score as number) || (typeof st.myScore === 'number' ? st.myScore : 0),
      budget: (e.budget as number) ?? 0,
      squad: Array.isArray(st.myTeam) ? st.myTeam : [],
    };
  });
}

export async function saveEntry(
  userId: string, leagueId: string, tournamentId: string, e: EntryWrite,
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('entries').upsert({
    user_id: userId,
    league_id: leagueId,
    tournament_id: tournamentId,
    squad: e.squad,
    captain_history: e.captainHistory,
    phase: e.phase,
    current_round_index: e.currentRoundIndex,
    budget: e.budget,
    state: e.state,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,league_id,tournament_id' });
  if (error) console.warn('[cloud] saveEntry:', error.message);
}
