import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase, isAuthEnabled } from './supabaseClient';
import { useGameStore } from '../store/gameStore';
import { useProfile } from '../store/profileStore';
import { track, identify, resetIdentity } from '../data/analytics';

interface AuthUser { id: string; email: string }

interface AuthCtx {
  ready: boolean;          // initial session check finished
  enabled: boolean;        // Supabase configured
  user: AuthUser | null;   // signed-in account (an account is required — no guest mode)
  signUp: (email: string, password: string) => Promise<{ needsVerification: boolean }>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resend: (email: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!isAuthEnabled); // no backend → ready at once
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    if (!supabase) return;
    // Tidy up any legacy guest flag from before guest mode was removed.
    try { localStorage.removeItem('gsgm-guest'); } catch { /* ignore */ }
    supabase.auth.getSession()
      .then(({ data }) => {
        const u = data.session?.user;
        if (u) { setUser({ id: u.id, email: u.email ?? '' }); identify(u.id, { email: u.email }); }
      })
      .catch(() => { /* network/env failure — fall through to the login screen */ })
      .finally(() => setReady(true));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const u = session?.user;
      setUser(u ? { id: u.id, email: u.email ?? '' } : null);
      if (u) identify(u.id, { email: u.email });
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signUp: AuthCtx['signUp'] = async (email, password) => {
    if (!supabase) throw new Error('Accounts are not configured yet.');
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    track('signed_up', { needsVerification: !data.session });
    return { needsVerification: !data.session }; // no session ⇒ email confirmation pending
  };

  const signIn: AuthCtx['signIn'] = async (email, password) => {
    if (!supabase) throw new Error('Accounts are not configured yet.');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    track('signed_in');
  };

  const signOut = async () => {
    // Always clear local state, even if the network sign-out fails (offline) —
    // otherwise the user appears stuck signed in.
    try { if (supabase) await supabase.auth.signOut(); } catch { /* ignore network error */ }
    finally {
      track('signed_out'); resetIdentity();
      setUser(null);
      // Wipe on-device game + profile so one account's squad/score/name can never
      // bleed into the next person to sign in on this browser. The next identity
      // rehydrates its own data from the cloud (or starts fresh). Also clear the
      // first-run flags so the next person gets their own name prompt + rules intro.
      try {
        useGameStore.getState().resetGame(); useProfile.getState().reset();
        localStorage.removeItem('gsgm-named'); localStorage.removeItem('gsgm-seen-rules');
      } catch { /* ignore */ }
    }
  };

  const resend: AuthCtx['resend'] = async (email) => {
    if (!supabase) throw new Error('Accounts are not configured yet.');
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) throw error;
  };

  const resetPassword: AuthCtx['resetPassword'] = async (email) => {
    if (!supabase) throw new Error('Accounts are not configured yet.');
    // Sends a recovery link. When the user returns via that link, Supabase fires a
    // PASSWORD_RECOVERY auth event and they can set a new password (change-password UI).
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    if (error) throw error;
  };

  const updatePassword: AuthCtx['updatePassword'] = async (password) => {
    if (!supabase) throw new Error('Accounts are not configured yet.');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  };

  return (
    <Ctx.Provider value={{ ready, enabled: isAuthEnabled, user, signUp, signIn, signOut, resend, resetPassword, updatePassword }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth must be used within AuthProvider');
  return c;
}
