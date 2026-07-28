import { useEscapeToClose } from '../hooks';

const RULES: { icon: string; title: string; body: string }[] = [
  { icon: '🎾', title: 'Draft 10 players', body: 'You get $150M to sign a 10-player squad — exactly 2 Platinum, 3 Gold and 5 Silver. Stars cost more, so choose: two galácticos and bargain support, or a deeper balanced squad.' },
  { icon: '📈', title: 'Win rounds, score points', body: 'Every round your player wins scores — from the Round of 128 (+1) up through R64 +1, R32 +2, R16 +5, QF +10, SF +20, Final +40. Lower-ranked winners score more per win.' },
  { icon: '👑', title: 'Captain & Vice-Captain', body: 'Two of your squad lead on court: your Captain scores ×2 and your Vice-Captain ×1.5. The other 8 sit on the bench (they still score ×1). Re-pick your two leaders each round.' },
  { icon: '🔥', title: 'Upset bonus', body: 'When a lower-ranked player beats a higher seed, you earn bonus points (bigger in the later rounds). Backing the right underdog pays off.' },
  { icon: '💸', title: 'Elimination = money back', body: 'When your player is knocked out you get part of their price back — more the further they reached — and can spend it to transfer in someone still alive.' },
  { icon: '🔒', title: 'Transfers close before the final', body: 'Reinforce your squad through the semi-finals — a quarter-final casualty can still be replaced for the semis. Only the final squad is locked, so plan ahead.' },
  { icon: '🏆', title: 'Beat your league', body: 'Everyone gets the same $150M. Climb the League standings and be crowned Grand Slam GM.' },
];

export default function HowToPlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEscapeToClose(onClose, open);
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
