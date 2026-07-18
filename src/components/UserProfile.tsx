import { useProfile } from '../store/profileStore';
import { useAuth } from '../auth/AuthProvider';

export default function UserProfile({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { firstName, lastName, phone, email, set } = useProfile();
  const { user, guest, signOut } = useAuth();
  if (!open) return null;

  const accountEmail = user?.email ?? '';
  const field = { background: '#F5F7FA', border: '1px solid rgba(10,27,51,0.12)', color: '#0a1f44' } as const;
  const initials = (firstName[0] ?? '') + (lastName[0] ?? '') || (accountEmail[0] ?? 'U').toUpperCase();

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(10,27,51,0.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} className="fade-in rounded-2xl w-full" style={{ maxWidth: 420, background: '#fff', maxHeight: '88vh', overflowY: 'auto' }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4" style={{ background: 'linear-gradient(120deg,#0a1f44,#123163)', borderRadius: '16px 16px 0 0' }}>
          <div className="flex items-center justify-center rounded-xl text-lg font-extrabold" style={{ width: 44, height: 44, background: 'rgba(255,255,255,0.16)', color: '#fff' }}>
            {initials.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white font-extrabold text-base leading-tight truncate">
              {firstName || lastName ? `${firstName} ${lastName}`.trim() : 'Your profile'}
            </div>
            <div className="text-xs font-num truncate" style={{ color: '#AFBFDA' }}>{accountEmail || email || (guest ? 'Guest' : '')}</div>
          </div>
          <button onClick={onClose} className="text-white text-sm font-bold px-3 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.15)' }}>Done</button>
        </div>

        {/* Fields */}
        <div className="p-5 space-y-3">
          <Row label="First name">
            <input value={firstName} onChange={e => set({ firstName: e.target.value })} placeholder="First name" className="w-full text-sm outline-none px-3 py-2.5 rounded-xl" style={field} />
          </Row>
          <Row label="Surname">
            <input value={lastName} onChange={e => set({ lastName: e.target.value })} placeholder="Surname" className="w-full text-sm outline-none px-3 py-2.5 rounded-xl" style={field} />
          </Row>
          <Row label="Email">
            {accountEmail ? (
              <div className="w-full text-sm px-3 py-2.5 rounded-xl font-num flex items-center justify-between" style={{ ...field, color: '#5B6B84' }}>
                {accountEmail}
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(18,161,80,0.12)', color: '#12A150' }}>VERIFIED</span>
              </div>
            ) : (
              <input value={email} onChange={e => set({ email: e.target.value })} placeholder="you@email.com" type="email" className="w-full text-sm outline-none px-3 py-2.5 rounded-xl" style={field} />
            )}
          </Row>
          <Row label="Phone number">
            <input value={phone} onChange={e => set({ phone: e.target.value })} placeholder="+00 000 000 000" type="tel" className="w-full text-sm outline-none px-3 py-2.5 rounded-xl" style={field} />
          </Row>

          <p className="text-[11px] pt-1" style={{ color: '#9AA7BC' }}>
            Saved on this device. It'll sync to your account once accounts go live.
          </p>

          {(user || guest) && (
            <button
              onClick={() => { signOut(); onClose(); }}
              className="w-full py-2.5 rounded-xl text-sm font-bold mt-1"
              style={{ background: 'rgba(229,71,43,0.1)', color: '#E5472B', border: '1px solid rgba(229,71,43,0.25)' }}
            >
              {user ? 'Sign out' : 'Exit guest & sign in'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#5B6B84' }}>{label}</div>
      {children}
    </div>
  );
}
