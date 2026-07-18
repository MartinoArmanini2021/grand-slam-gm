const RULES: { icon: string; title: string; body: string }[] = [
  { icon: '🎾', title: 'Draft 6 players', body: 'You get $100M to sign a 6-player squad from the draw. Stars cost more — so you must choose: a couple of galácticos, or a deeper balanced squad.' },
  { icon: '📈', title: 'Win rounds, score points', body: 'Each time one of your players wins, you score: R32 +2, R16 +5, QF +10, SF +20, Final +40.' },
  { icon: '⭐', title: 'Pick a captain', body: 'Each round, name a captain — they score double. Change them round to round to chase the points.' },
  { icon: '🔥', title: 'Upset bonus', body: 'When a lower-ranked player beats a higher seed, you earn bonus points. Backing the right underdog pays off.' },
  { icon: '💸', title: 'Elimination = money back', body: 'When your player is knocked out you get part of their price back — and can spend it to transfer in someone still alive.' },
  { icon: '🔒', title: 'Transfers lock after the QF', body: 'You can reinforce your squad up to the quarter-finals. After that it’s locked for the semis and final — so plan ahead.' },
  { icon: '🏆', title: 'Beat your league', body: 'Everyone gets the same $100M. Climb the League standings and be crowned Grand Slam GM.' },
];

export default function HowToPlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(10,27,51,0.55)',
        backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="fade-in"
        style={{
          background: '#FFFFFF', borderRadius: 18, maxWidth: 520, width: '100%',
          maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(10,27,51,0.35)',
        }}
      >
        {/* Header */}
        <div style={{ background: 'linear-gradient(120deg,var(--ink),var(--navy-2))', padding: '22px 24px', borderRadius: '18px 18px 0 0', position: 'relative' }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--green-bright)', textTransform: 'uppercase' }}>How to play</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>Grand Slam GM</div>
          <div style={{ fontSize: 13, color: 'var(--on-navy)', marginTop: 2 }}>Be the general manager of your fantasy Slam squad.</div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ position: 'absolute', top: 16, right: 16, width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        {/* Rules */}
        <div style={{ padding: '8px 20px 4px' }}>
          {RULES.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 14, padding: '14px 4px', borderBottom: i < RULES.length - 1 ? '1px solid rgba(10,27,51,0.06)' : 'none' }}>
              <div style={{ fontSize: 22, lineHeight: 1.2, flexShrink: 0, width: 30, textAlign: 'center' }}>{r.icon}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{r.title}</div>
                <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.45, marginTop: 2 }}>{r.body}</div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div style={{ padding: '12px 20px 20px' }}>
          <button
            onClick={onClose}
            style={{ width: '100%', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 12, padding: '13px', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: '"Plus Jakarta Sans Variable",system-ui,sans-serif' }}
          >
            Let’s play →
          </button>
        </div>
      </div>
    </div>
  );
}
