import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { TOURNAMENT, SURFACE } from '../data/tournamentConfig';
import { SQUAD_SIZE, STARTING_BUDGET } from '../data/squadRules';
import Logo from './Logo';
import HowToPlay from './HowToPlay';

type Mode = 'login' | 'register' | 'verify' | 'reset';

// A friend shared a private-league link → nudge the visitor to create an account so the
// pending join can apply once they're in (see App's ?join handler).
const hasPendingInvite = () => { try { return !!sessionStorage.getItem('gsgm-pending-join'); } catch { return false; } };

// Turn raw Supabase/network errors into copy a person can act on. Returns the sentinel
// 'unverified' so the caller can route to the resend screen instead of showing an error.
function friendlyError(err: unknown): string {
  const m = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (m.includes('email not confirmed')) return 'unverified';
  if (m.includes('invalid login')) return 'Wrong email or password.';
  if (m.includes('already registered') || m.includes('already exists') || m.includes('user already')) {
    return 'That email is already registered — try logging in instead.';
  }
  if (m.includes('failed to fetch') || m.includes('network')) return "You're offline — check your connection and try again.";
  if (m.includes('rate') || m.includes('too many')) return 'Too many attempts — wait a minute, then try again.';
  return err instanceof Error ? err.message : 'Something went wrong.';
}

export default function AuthScreen() {
  const { enabled, signIn, signUp, resend, resetPassword } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null); // non-error confirmations (reset sent)
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState('');
  const [showHowTo, setShowHowTo] = useState(false);
  const invited = hasPendingInvite();

  const validEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setNote(null);
    if (!validEmail) { setError('Enter a valid email address.'); return; }

    if (mode === 'reset') {
      setBusy(true);
      try { await resetPassword(email); setNote(`If an account exists for ${email}, a reset link is on its way.`); }
      catch (err) { setError(friendlyError(err)); }
      finally { setBusy(false); }
      return;
    }

    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setBusy(true);
    try {
      if (mode === 'register') {
        const { needsVerification } = await signUp(email, password);
        if (needsVerification) { setSentTo(email); setMode('verify'); }
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      const f = friendlyError(err);
      if (f === 'unverified') { setSentTo(email); setMode('verify'); } // route to the resend screen
      else setError(f);
    } finally {
      setBusy(false);
    }
  };

  const field = { background: 'var(--raised)', border: '1px solid rgba(10,27,51,0.12)', color: 'var(--ink)' } as const;

  return (
    <div className="min-h-[100dvh] flex items-center justify-center px-4 py-6 overflow-y-auto" style={{ background: 'linear-gradient(150deg,var(--ink) 0%,var(--navy-2) 55%,#0e2a52 100%)' }}>
      <div className="w-full my-auto" style={{ maxWidth: 400 }}>
        <div className="flex justify-center mb-4"><Logo height={40} reversed /></div>

        {/* Value block — tell a cold visitor what this is BEFORE the form (the biggest
            bounce point is a login wall with no pitch). */}
        <div className="text-center mb-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.22em] mb-1" style={{ color: SURFACE.accent }}>Fantasy · {TOURNAMENT.location.split(',')[0]} · {SURFACE.label}</div>
          <h1 className="text-2xl font-extrabold leading-tight text-white">{TOURNAMENT.edition}</h1>
          <p className="text-sm mt-1.5" style={{ color: 'var(--on-navy)' }}>Draft a squad of pros, captain your stars, and beat your friends.</p>
          <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
            {[`🎾 Draft ${SQUAD_SIZE} · $${STARTING_BUDGET}M`, '👑 Captain for ×2', '🏆 Free to play'].map(t => (
              <span key={t} className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.12)', color: '#fff' }}>{t}</span>
            ))}
          </div>
          <button onClick={() => setShowHowTo(true)} className="text-xs font-semibold mt-2.5 underline underline-offset-2" style={{ color: '#9FC3F5' }}>
            How does it work?
          </button>
        </div>

        {invited && (
          <div className="rounded-xl px-3 py-2.5 mb-3 text-center text-xs font-semibold" style={{ background: 'rgba(55,214,122,0.14)', border: '1px solid rgba(55,214,122,0.3)', color: '#BFF0D2' }}>
            🎾 A friend invited you to their league — create an account to join them.
          </div>
        )}

        <div className="rounded-2xl p-6 fade-in" style={{ background: '#FFFFFF', boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }}>
          {mode === 'verify' ? (
            <div className="text-center">
              <div className="text-4xl mb-3">📩</div>
              <h1 className="text-lg font-extrabold mb-1" style={{ color: 'var(--ink)' }}>Check your email</h1>
              <p className="text-sm mb-4" style={{ color: 'var(--ink-2)' }}>
                We sent a confirmation link to <b style={{ color: 'var(--ink)' }}>{sentTo}</b>. Click it, then come back and log in.
              </p>
              {error && <ErrBox msg={error} />}
              <button
                onClick={async () => { setError(null); setBusy(true); try { await resend(sentTo); setNote('Sent again — check your inbox and spam.'); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); } }}
                disabled={busy}
                className="w-full min-h-[44px] py-2.5 rounded-xl font-bold text-sm mb-2" style={{ background: 'rgba(14,111,196,0.1)', color: 'var(--blue)' }}
              >
                {busy ? 'Sending…' : 'Resend email'}
              </button>
              {note && <p className="text-xs mb-2" style={{ color: 'var(--green)' }}>{note}</p>}
              <p className="text-xs mb-3" style={{ color: 'var(--ink-3)' }}>
                No email after a minute? It may already be registered — just <button onClick={() => { setMode('login'); setError(null); setNote(null); }} className="font-semibold underline" style={{ color: 'var(--blue)' }}>log in</button>.
              </p>
              <button onClick={() => { setMode('register'); setError(null); setNote(null); }} className="w-full min-h-[44px] py-2.5 rounded-xl font-bold text-sm" style={{ background: 'var(--raised)', color: 'var(--ink-2)' }}>
                Wrong email? Start over
              </button>
            </div>
          ) : mode === 'reset' ? (
            <div>
              <h1 className="text-xl font-extrabold mb-1" style={{ color: 'var(--ink)' }}>Reset your password</h1>
              <p className="text-sm mb-4" style={{ color: 'var(--ink-2)' }}>Enter your email and we'll send you a link to set a new password.</p>
              <form onSubmit={submit} className="space-y-3">
                <input type="email" autoComplete="email" placeholder="Email" aria-label="Email" value={email}
                  onChange={e => setEmail(e.target.value)} disabled={!enabled}
                  className="w-full text-sm px-3 py-2.5 rounded-xl" style={field} />
                {error && <ErrBox msg={error} />}
                {note && <p className="text-xs" style={{ color: 'var(--green)' }}>{note}</p>}
                <button type="submit" disabled={busy || !enabled}
                  className="w-full min-h-[44px] py-2.5 rounded-xl font-bold text-sm text-white" style={{ background: 'var(--blue)', opacity: busy ? 0.7 : 1 }}>
                  {busy ? 'Sending…' : 'Send reset link'}
                </button>
              </form>
              <button onClick={() => { setMode('login'); setError(null); setNote(null); }} className="w-full mt-2 min-h-[44px] py-2.5 rounded-xl font-semibold text-sm" style={{ color: 'var(--ink-2)' }}>
                ‹ Back to log in
              </button>
            </div>
          ) : (
            <>
              {/* Tabs */}
              <div className="flex rounded-xl overflow-hidden mb-5" style={{ border: '1px solid rgba(10,27,51,0.1)' }}>
                {(['login', 'register'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => { setMode(m); setError(null); setNote(null); }}
                    className="flex-1 min-h-[44px] py-2.5 text-sm font-bold transition-colors"
                    style={{ background: mode === m ? 'var(--ink)' : '#FFFFFF', color: mode === m ? '#fff' : 'var(--ink-2)' }}
                  >
                    {m === 'login' ? 'Log in' : 'Sign up'}
                  </button>
                ))}
              </div>

              <h1 className="text-xl font-extrabold mb-1" style={{ color: 'var(--ink)' }}>
                {mode === 'login' ? 'Welcome back' : 'Create your account'}
              </h1>
              <p className="text-sm mb-4" style={{ color: 'var(--ink-2)' }}>
                {mode === 'login' ? 'Log in to manage your squad.' : 'Sign up to draft a squad and play in a league with friends.'}
              </p>

              {!enabled && (
                <div className="text-xs rounded-xl px-3 py-2.5 mb-4" style={{ background: 'rgba(217,154,0,0.1)', border: '1px solid rgba(217,154,0,0.25)', color: '#8a6a00' }}>
                  Accounts aren't configured on this deployment yet — please try again shortly.
                </div>
              )}

              <form onSubmit={submit} className="space-y-3">
                <input type="email" autoComplete="email" placeholder="Email" aria-label="Email" value={email}
                  onChange={e => setEmail(e.target.value)} disabled={!enabled}
                  className="w-full text-sm px-3 py-2.5 rounded-xl" style={field} />
                <input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  placeholder="Password" aria-label="Password" value={password} onChange={e => setPassword(e.target.value)} disabled={!enabled}
                  className="w-full text-sm px-3 py-2.5 rounded-xl" style={field} />

                {error && <ErrBox msg={error} />}

                <button type="submit" disabled={busy || !enabled}
                  className="w-full min-h-[44px] py-2.5 rounded-xl font-bold text-sm text-white transition-opacity"
                  style={{ background: enabled ? 'var(--blue)' : 'rgba(10,27,51,0.2)', cursor: enabled ? 'pointer' : 'not-allowed', opacity: busy ? 0.7 : 1 }}>
                  {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
                </button>
              </form>

              {mode === 'login' && enabled && (
                <button onClick={() => { setMode('reset'); setError(null); setNote(null); }} className="mt-3 text-xs font-semibold" style={{ color: 'var(--blue)' }}>
                  Forgot your password?
                </button>
              )}
              <p className="text-[11px] mt-4 text-center" style={{ color: 'var(--ink-3)' }}>
                Free to play. Your squad syncs across devices so you can pick up anywhere.
              </p>
            </>
          )}
        </div>

        <p className="text-center text-xs mt-4" style={{ color: 'var(--on-navy-2)' }}>Grand Slam GM · {TOURNAMENT.edition} fantasy</p>
      </div>
      <HowToPlay open={showHowTo} onClose={() => setShowHowTo(false)} />
    </div>
  );
}

function ErrBox({ msg }: { msg: string }) {
  return (
    <div className="text-xs rounded-xl px-3 py-2.5" style={{ background: 'rgba(229,71,43,0.08)', border: '1px solid rgba(229,71,43,0.25)', color: '#c0341c' }}>
      {msg}
    </div>
  );
}
