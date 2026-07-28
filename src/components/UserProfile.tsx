import { useState, useEffect } from 'react';
import { useProfile } from '../store/profileStore';
import { useAuth } from '../auth/AuthProvider';
import { useGameStore } from '../store/gameStore';
import { toast } from '../store/toastStore';
import { useEscapeToClose } from '../hooks';

export default function UserProfile({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { firstName, lastName, username, phone, country, email, teamName, teamEmblem, set } = useProfile();
  const { user, guest, enabled, signOut, updatePassword } = useAuth();
  const openTeam = useGameStore(s => s.openTeam);
  const resetGame = useGameStore(s => s.resetGame);

  const [confirmReset, setConfirmReset] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Clear transient state whenever the panel closes, so the two-step "Restart"
  // confirm can't be left armed (a data-loss trap) and stale password text/messages
  // don't linger into the next open.
  useEffect(() => {
    if (!open) { setConfirmReset(false); setShowPw(false); setPwMsg(null); setNewPw(''); setConfirmPw(''); }
  }, [open]);
  useEscapeToClose(onClose, open);

  if (!open) return null;

  const accountEmail = user?.email ?? '';
  const field = { background: 'var(--raised)', border: '1px solid rgba(10,27,51,0.12)', color: 'var(--ink)' } as const;
  const initials = ((firstName[0] ?? '') + (lastName[0] ?? '')) || (username[0] ?? accountEmail[0] ?? 'U');
  // Required for the live league: username, name, surname, email, phone, country.
  const incomplete = [username, firstName, lastName, accountEmail || email, phone, country].some(v => !v.trim());
  const reqStyle = (v: string) => (v.trim() ? field : { ...field, border: '1px solid rgba(229,71,43,0.55)' });

  const changePassword = async (): Promise<boolean> => {
    setPwMsg(null);
    if (newPw.length < 6) { setPwMsg({ ok: false, text: 'Password must be at least 6 characters.' }); return false; }
    if (newPw !== confirmPw) { setPwMsg({ ok: false, text: 'Passwords do not match.' }); return false; }
    setPwBusy(true);
    try {
      await updatePassword(newPw);
      setNewPw(''); setConfirmPw('');
      toast('Password updated', 'good');
      return true;
    } catch (e) {
      setPwMsg({ ok: false, text: e instanceof Error ? e.message : 'Failed to update.' });
      return false;
    } finally {
      setPwBusy(false);
    }
  };

  return (
    <>
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(10,27,51,0.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} className="fade-in rounded-2xl w-full" style={{ maxWidth: 420, background: '#fff', maxHeight: '88dvh', overflowY: 'auto' }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 sticky top-0" style={{ background: 'linear-gradient(120deg,var(--ink),var(--navy-2))', borderRadius: '16px 16px 0 0', zIndex: 1 }}>
          <div className="flex items-center justify-center rounded-xl text-lg font-extrabold uppercase" style={{ width: 44, height: 44, background: 'rgba(255,255,255,0.16)', color: '#fff' }}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white font-extrabold text-base leading-tight truncate">
              {firstName || lastName ? `${firstName} ${lastName}`.trim() : (username || 'Your profile')}
            </div>
            <div className="text-xs font-num truncate" style={{ color: 'var(--on-navy)' }}>{accountEmail || email || (guest ? 'Guest' : '')}</div>
          </div>
          <button onClick={onClose} className="text-white text-sm font-bold px-3 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.15)' }}>Done</button>
        </div>

        <div className="p-4 sm:p-5 space-y-2.5">
          {incomplete && (
            <div className="text-xs rounded-xl px-3 py-2" style={{ background: 'rgba(217,154,0,0.1)', border: '1px solid rgba(217,154,0,0.25)', color: '#8a6a00' }}>
              Please complete the <b>required</b> fields (marked <span style={{ color: 'var(--ember)' }}>*</span>) — they'll be needed to join the live league.
            </div>
          )}
          <Row label="Username" req>
            <input value={username} onChange={e => set({ username: e.target.value })} placeholder="Pick a username" className="w-full text-sm outline-none px-3 py-2.5 rounded-xl" style={reqStyle(username)} />
          </Row>
          <div className="grid grid-cols-2 gap-3">
            <Row label="First name" req>
              <input value={firstName} onChange={e => set({ firstName: e.target.value })} placeholder="First name" className="w-full text-sm outline-none px-3 py-2.5 rounded-xl" style={reqStyle(firstName)} />
            </Row>
            <Row label="Surname" req>
              <input value={lastName} onChange={e => set({ lastName: e.target.value })} placeholder="Surname" className="w-full text-sm outline-none px-3 py-2.5 rounded-xl" style={reqStyle(lastName)} />
            </Row>
          </div>
          <Row label="Email" req>
            {accountEmail ? (
              <div className="w-full text-sm px-3 py-2.5 rounded-xl font-num flex items-center justify-between" style={{ ...field, color: 'var(--ink-2)' }}>
                {accountEmail}
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(18,161,80,0.12)', color: 'var(--green)' }}>VERIFIED</span>
              </div>
            ) : (
              <input value={email} onChange={e => set({ email: e.target.value })} placeholder="you@email.com" type="email" className="w-full text-sm outline-none px-3 py-2.5 rounded-xl" style={reqStyle(email)} />
            )}
          </Row>
          <div className="grid grid-cols-2 gap-3">
            <Row label="Phone" req>
              <input value={phone} onChange={e => set({ phone: e.target.value })} placeholder="+00 000 000" type="tel" className="w-full text-sm outline-none px-3 py-2.5 rounded-xl" style={reqStyle(phone)} />
            </Row>
            <Row label="Country" req>
              <input value={country} onChange={e => set({ country: e.target.value })} placeholder="Country" className="w-full text-sm outline-none px-3 py-2.5 rounded-xl" style={reqStyle(country)} />
            </Row>
          </div>

          {/* Team shortcut */}
          <Row label="Your team">
            <button
              onClick={() => { openTeam('you'); onClose(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left"
              style={{ ...field }}
            >
              <span className="flex items-center justify-center rounded-lg text-lg" style={{ width: 30, height: 30, background: 'rgba(14,111,196,0.1)' }}>{teamEmblem}</span>
              <span className="flex-1 text-sm font-bold" style={{ color: 'var(--ink)' }}>{teamName}</span>
              <span className="text-xs font-semibold" style={{ color: 'var(--blue)' }}>Edit on team page ›</span>
            </button>
          </Row>

          {/* Password — a single button opens a separate popup */}
          <div className="pt-2" style={{ borderTop: '1px solid rgba(10,27,51,0.07)' }}>
            {user ? (
              <button onClick={() => { setNewPw(''); setConfirmPw(''); setPwMsg(null); setShowPw(true); }} className="w-full py-2.5 rounded-xl text-sm font-bold mt-1" style={{ background: 'rgba(14,111,196,0.1)', color: 'var(--blue)' }}>
                Change password →
              </button>
            ) : (
              <div className="text-xs rounded-xl px-3 py-2.5 mt-1" style={{ background: 'rgba(217,154,0,0.1)', border: '1px solid rgba(217,154,0,0.25)', color: '#8a6a00' }}>
                {enabled ? 'Log in to change your password.' : 'Password change is available once accounts are enabled.'}
              </div>
            )}
          </div>

          <p className="text-[11px] pt-1" style={{ color: 'var(--ink-3)' }}>Saved on this device. It'll sync to your account once accounts go live.</p>

          {/* Start over — wipes the squad and score so you can draft again.
              Two-step so it can't be hit by accident. Your team name/logo is kept. */}
          <div>
            <button
              onClick={() => { if (confirmReset) { resetGame(); setConfirmReset(false); onClose(); toast('New tournament — draft your squad 🎾', 'good'); } else setConfirmReset(true); }}
              className="w-full py-2.5 rounded-xl text-sm font-bold transition-colors"
              style={confirmReset
                ? { background: 'var(--ember)', color: '#fff' }
                : { background: 'rgba(10,27,51,0.04)', color: 'var(--ink-2)', border: '1px solid rgba(10,27,51,0.12)' }}
            >
              {confirmReset ? 'Tap again to confirm — this wipes your squad' : '↻ Restart tournament'}
            </button>
            {confirmReset && (
              <button onClick={() => setConfirmReset(false)} className="w-full text-center text-[11px] mt-1.5 font-semibold" style={{ color: 'var(--ink-3)' }}>Cancel</button>
            )}
          </div>

          {(user || guest) && (
            <button onClick={() => { signOut(); onClose(); }} className="w-full py-2.5 rounded-xl text-sm font-bold" style={{ background: 'rgba(229,71,43,0.1)', color: 'var(--ember)', border: '1px solid rgba(229,71,43,0.25)' }}>
              {user ? 'Sign out' : 'Exit guest & sign in'}
            </button>
          )}
        </div>
      </div>
    </div>

    {/* Change-password — a separate popup on top of the profile */}
    {showPw && (
      <div onClick={() => setShowPw(false)} style={{ position: 'fixed', inset: 0, zIndex: 210, background: 'rgba(10,27,51,0.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div onClick={e => e.stopPropagation()} className="fade-in rounded-2xl w-full" style={{ maxWidth: 380, background: '#fff', padding: 20 }}>
          <div className="flex items-center justify-between mb-3">
            <div className="font-extrabold text-base" style={{ color: 'var(--ink)' }}>Change password</div>
            <button onClick={() => setShowPw(false)} className="text-sm font-bold px-2.5 py-1 rounded-lg" style={{ background: 'var(--raised)', color: 'var(--ink-2)' }}>✕</button>
          </div>
          <div className="space-y-2">
            <input value={newPw} onChange={e => setNewPw(e.target.value)} type="password" placeholder="New password" autoComplete="new-password" className="w-full text-sm outline-none px-3 py-2.5 rounded-xl" style={field} />
            <input value={confirmPw} onChange={e => setConfirmPw(e.target.value)} type="password" placeholder="Confirm new password" autoComplete="new-password" className="w-full text-sm outline-none px-3 py-2.5 rounded-xl" style={field} />
            {pwMsg && (
              <div className="text-xs rounded-xl px-3 py-2" style={{ background: pwMsg.ok ? 'rgba(18,161,80,0.08)' : 'rgba(229,71,43,0.08)', color: pwMsg.ok ? 'var(--green)' : '#c0341c', border: `1px solid ${pwMsg.ok ? 'rgba(18,161,80,0.25)' : 'rgba(229,71,43,0.25)'}` }}>{pwMsg.text}</div>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowPw(false)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold" style={{ background: '#F0F3F7', color: 'var(--ink)', border: '1px solid rgba(10,27,51,0.1)' }}>Cancel</button>
              <button onClick={async () => { if (await changePassword()) setShowPw(false); }} disabled={pwBusy} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: 'var(--blue)' }}>{pwBusy ? 'Updating…' : 'Update'}</button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

function Row({ label, req, children }: { label: string; req?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: 'var(--ink-2)' }}>
        {label}{req && <span style={{ color: 'var(--ember)' }}> *</span>}
      </div>
      {children}
    </div>
  );
}
