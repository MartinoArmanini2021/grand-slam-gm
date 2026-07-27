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
