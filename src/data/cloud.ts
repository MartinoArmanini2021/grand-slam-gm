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
export async function saveProfile(userId: string, p: CloudProfile): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: userId, ...p }, { onConflict: 'id' });
  if (error) console.warn('[cloud] saveProfile:', error.message);
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
