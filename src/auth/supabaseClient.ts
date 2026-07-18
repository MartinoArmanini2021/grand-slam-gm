import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Real accounts + email verification are powered by Supabase. Set the two env
// vars (see .env.example) to enable them; leave unset to run guest-only locally.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isAuthEnabled = Boolean(url && anon);

export const supabase: SupabaseClient | null = isAuthEnabled
  ? createClient(url as string, anon as string)
  : null;
