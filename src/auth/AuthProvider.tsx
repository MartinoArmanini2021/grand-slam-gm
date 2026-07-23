import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase, isAuthEnabled } from './supabaseClient';

interface AuthUser { id: string; email: string }

interface AuthCtx {
  ready: boolean;          // initial session check finished
  enabled: boolean;        // Supabase configured
  user: AuthUser | null;   // signed-in account
  guest: boolean;          // playing without an account
  signUp: (email: string, password: string) => Promise<{ needsVerification: boolean }>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resend: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  continueAsGuest: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);
const GUEST_KEY = 'gsgm-guest';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!isAuthEnabled); // no backend → ready at once
  const [user, setUser] = useState<AuthUser | null>(null);
  const [guest, setGuest] = useState(() => {
    try { return localStorage.getItem(GUEST_KEY) === '1'; } catch { return false; }
  });

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession()
      .then(({ data }) => {
        const u = data.session?.user;
        if (u) setUser({ id: u.id, email: u.email ?? '' });
      })
      .catch(() => { /* network/env failure — fall through to the login screen */ })
      .finally(() => setReady(true));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const u = session?.user;
      setUser(u ? { id: u.id, email: u.email ?? '' } : null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signUp: AuthCtx['signUp'] = async (email, password) => {
    if (!supabase) throw new Error('Accounts are not configured yet.');
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return { needsVerification: !data.session }; // no session ⇒ email confirmation pending
  };

  const signIn: AuthCtx['signIn'] = async (email, password) => {
    if (!supabase) throw new Error('Accounts are not configured yet.');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    // Always clear local state, even if the network sign-out fails (offline) —
    // otherwise the user appears stuck signed in.
    try { if (supabase) await supabase.auth.signOut(); } catch { /* ignore network error */ }
    finally {
      setUser(null);
      setGuest(false);
      try { localStorage.removeItem(GUEST_KEY); } catch { /* ignore */ }
    }
  };

  const resend: AuthCtx['resend'] = async (email) => {
    if (!supabase) throw new Error('Accounts are not configured yet.');
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) throw error;
  };

  const updatePassword: AuthCtx['updatePassword'] = async (password) => {
    if (!supabase) throw new Error('Accounts are not configured yet.');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  };

  const continueAsGuest = () => {
    setGuest(true);
    try { localStorage.setItem(GUEST_KEY, '1'); } catch { /* ignore */ }
  };

  return (
    <Ctx.Provider value={{ ready, enabled: isAuthEnabled, user, guest, signUp, signIn, signOut, resend, updatePassword, continueAsGuest }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth must be used within AuthProvider');
  return c;
}
