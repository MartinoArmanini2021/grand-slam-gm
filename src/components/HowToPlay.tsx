import { useEscapeToClose } from '../hooks';
import { ROUNDS } from '../data/tournament';
import { MAX_TRANSFERS } from '../data/squadRules';

// Describe THIS tournament's scored rounds + points, derived from config so the copy is
// always accurate (a 6-round Masters and a 7-round Slam each read correctly).
const scoringLine = ROUNDS.map(r => `${r.short} +${r.points}`).join(', ');

const RULES: { icon: string; title: string; body: string }[] = [
  { icon: '🎾', title: 'Draft 10 players', body: 'You get $150M to sign a 10-player squad — exactly 2 Platinum, 3 Gold and 5 Silver. Stars cost more, so choose: two galácticos and bargain support, or a deeper balanced squad.' },
  { icon: '📈', title: 'Win rounds, score points', body: `Every round your player wins scores — ${scoringLine}. Deeper rounds are worth far more.` },
  { icon: '👑', title: 'Captain & Vice-Captain', body: 'Two of your squad lead on court: your Captain scores ×2 and your Vice-Captain ×1.5. The other 8 sit on the bench (they still score ×1). Re-pick your two leaders each round.' },
  { icon: '🔥', title: 'Upset bonus', body: 'Beat a higher-ranked player and your win is multiplied — the bigger the ranking gap, the bigger the multiplier (up to ×2). A favourite winning still scores the full base. Back the right underdog and it pays off.' },
  { icon: '💸', title: 'Elimination = money back', body: 'When your player is knocked out you get part of their price back — more the further they reached, since an early exit leaves the most value unspent — and you can put that money straight back into someone still alive.' },
  { icon: '🔁', title: `${MAX_TRANSFERS} transfers per tournament`, body: `Signing a replacement costs one of your ${MAX_TRANSFERS} transfers for the whole event. Recovery is a lifeline, not a reset — spend them on the losses that really hurt, because your draft is still what decides your tournament.` },
  { icon: '🔒', title: 'Transfers close before the final', body: 'Reinforce your squad through the semi-finals — a quarter-final casualty can still be replaced for the semis. Only the final squad is locked, so plan ahead.' },
  { icon: '🤝', title: 'Play with friends', body: 'Sign up (it\'s free), then go to League → Private → Create a league and share its 6-letter code. Your friends sign up, open League → Private, and enter the code — now you\'re all on the same leaderboard.' },
  { icon: '🏆', title: 'Beat your league', body: 'Everyone gets the same $150M. Climb the League standings and be crowned Grand Slam GM.' },
];

export default function HowToPlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEscapeToClose(onClose, open);
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        // Pin the overlay's HEIGHT to the DYNAMIC viewport (100dvh) — not `inset:0`, which
        // stretches to the layout viewport BEHIND the mobile URL bar and made the card spill
        // past the visible top/bottom. box-sizing:border-box keeps padding inside 100dvh.
        position: 'fixed', top: 0, left: 0, right: 0, height: '100dvh', boxSizing: 'border-box',
        zIndex: 200, background: 'rgba(10,27,51,0.55)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflowY: 'auto',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="fade-in"
        style={{
          background: '#FFFFFF', borderRadius: 18, maxWidth: 520, width: '100%',
          // Relative to the overlay (already =100dvh minus its 16px padding), so the card can
          // never exceed the VISIBLE area regardless of vh/svh/dvh quirks; it scrolls
          // internally when the rules are taller than the screen.
          maxHeight: '100%', overflowY: 'auto', WebkitOverflowScrolling: 'touch',
          boxShadow: '0 20px 60px rgba(10,27,51,0.35)',
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
