import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import Logo from './Logo';

type Mode = 'login' | 'register' | 'verify';

export default function AuthScreen() {
  const { enabled, signIn, signUp, resend, continueAsGuest } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setError('Enter a valid email address.'); return; }
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
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const field = {
    background: '#F5F7FA', border: '1px solid rgba(10,27,51,0.12)', color: '#0a1f44',
  } as const;

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'linear-gradient(150deg,#0a1f44 0%,#123163 55%,#0e2a52 100%)' }}>
      <div className="w-full" style={{ maxWidth: 400 }}>
        <div className="flex justify-center mb-6"><Logo height={40} reversed /></div>

        <div className="rounded-2xl p-6 fade-in" style={{ background: '#FFFFFF', boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }}>
          {mode === 'verify' ? (
            <div className="text-center">
              <div className="text-4xl mb-3">📩</div>
              <h1 className="text-lg font-extrabold mb-1" style={{ color: '#0a1f44' }}>Verify your email</h1>
              <p className="text-sm mb-4" style={{ color: '#5B6B84' }}>
                We sent a confirmation link to <b style={{ color: '#0a1f44' }}>{sentTo}</b>. Click it, then come back and log in.
              </p>
              {error && <ErrBox msg={error} />}
              <button
                onClick={async () => { setError(null); setBusy(true); try { await resend(sentTo); } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(false); } }}
                disabled={busy}
                className="w-full py-2.5 rounded-xl font-bold text-sm mb-2" style={{ background: 'rgba(14,111,196,0.1)', color: '#0e6fc4' }}
              >
                {busy ? 'Sending…' : 'Resend email'}
              </button>
              <button onClick={() => { setMode('login'); setError(null); }} className="w-full py-2.5 rounded-xl font-bold text-sm text-white" style={{ background: '#0e6fc4' }}>
                Back to log in
              </button>
            </div>
          ) : (
            <>
              {/* Tabs */}
              <div className="flex rounded-xl overflow-hidden mb-5" style={{ border: '1px solid rgba(10,27,51,0.1)' }}>
                {(['login', 'register'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => { setMode(m); setError(null); }}
                    className="flex-1 py-2.5 text-sm font-bold transition-colors"
                    style={{ background: mode === m ? '#0a1f44' : '#FFFFFF', color: mode === m ? '#fff' : '#5B6B84' }}
                  >
                    {m === 'login' ? 'Log in' : 'Sign up'}
                  </button>
                ))}
              </div>

              <h1 className="text-xl font-extrabold mb-1" style={{ color: '#0a1f44' }}>
                {mode === 'login' ? 'Welcome back' : 'Create your account'}
              </h1>
              <p className="text-sm mb-4" style={{ color: '#5B6B84' }}>
                {mode === 'login' ? 'Log in to manage your squad.' : 'Sign up to draft a squad and join a league.'}
              </p>

              {!enabled && (
                <div className="text-xs rounded-xl px-3 py-2.5 mb-4" style={{ background: 'rgba(217,154,0,0.1)', border: '1px solid rgba(217,154,0,0.25)', color: '#8a6a00' }}>
                  Accounts aren't configured on this deployment yet. You can still play as a guest below.
                </div>
              )}

              <form onSubmit={submit} className="space-y-3">
                <input type="email" autoComplete="email" placeholder="Email" value={email}
                  onChange={e => setEmail(e.target.value)} disabled={!enabled}
                  className="w-full text-sm outline-none px-3 py-2.5 rounded-xl" style={field} />
                <input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} disabled={!enabled}
                  className="w-full text-sm outline-none px-3 py-2.5 rounded-xl" style={field} />

                {error && <ErrBox msg={error} />}

                <button type="submit" disabled={busy || !enabled}
                  className="w-full py-2.5 rounded-xl font-bold text-sm text-white transition-opacity"
                  style={{ background: enabled ? '#0e6fc4' : 'rgba(10,27,51,0.2)', cursor: enabled ? 'pointer' : 'not-allowed', opacity: busy ? 0.7 : 1 }}>
                  {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
                </button>
              </form>
            </>
          )}

          <div className="mt-4 pt-4 text-center" style={{ borderTop: '1px solid rgba(10,27,51,0.07)' }}>
            <button onClick={continueAsGuest} className="text-sm font-semibold" style={{ color: '#5B6B84' }}>
              Continue as guest →
            </button>
          </div>
        </div>

        <p className="text-center text-xs mt-4" style={{ color: '#8FA1BE' }}>Grand Slam GM · Wimbledon 2026 fantasy</p>
      </div>
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
