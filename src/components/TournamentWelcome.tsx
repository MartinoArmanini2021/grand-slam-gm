import { useMemo } from 'react';
import { TOURNAMENT, SURFACE } from '../data/tournamentConfig';
import { SQUAD_SIZE, STARTING_BUDGET } from '../data/squadRules';
import { useProfile } from '../store/profileStore';

// ── The "you're in" moment ───────────────────────────────────────────────────
// A one-time celebratory overlay shown on Home right after a player joins the
// tournament. Confetti + a welcome card; dismiss to explore or jump to the Market.
// Motion is disabled under prefers-reduced-motion (handled in the scoped <style>).
const CONFETTI_COLORS = ['#D99A00', '#0E6FC4', '#12A150', '#E5472B', '#7DE2FC', '#FFFFFF'];

export default function TournamentWelcome({ onDone, onBuild }: { onDone: () => void; onBuild: () => void }) {
  const teamName = useProfile(s => s.teamName);
  const emblem = useProfile(s => s.teamEmblem);
  const accent = SURFACE.accent;
  const loc = TOURNAMENT.location.split(',')[0];

  // Confetti pieces computed once (stable across re-renders) — spread across the
  // width with varied colour, delay, duration and drift.
  const pieces = useMemo(() => Array.from({ length: 70 }, (_, i) => ({
    left: (i * 61) % 100,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    delay: (i % 12) * 0.18,
    duration: 2.6 + (i % 7) * 0.35,
    size: 6 + (i % 4) * 2,
    rot: (i * 37) % 360,
    round: i % 3 === 0,
  })), []);

  return (
    <div role="dialog" aria-modal="true" aria-label={`Welcome to the ${TOURNAMENT.edition}`}
      onClick={onDone}
      style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(6,17,34,0.72)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflow: 'hidden' }}>
      <style>{`
        @keyframes gsgm-confetti { 0% { transform: translateY(-12vh) rotate(0deg); opacity: 0; } 8% { opacity: 1; } 100% { transform: translateY(112vh) rotate(720deg); opacity: 1; } }
        @keyframes gsgm-pop { 0% { transform: scale(0.9); opacity: 0; } 60% { transform: scale(1.02); } 100% { transform: scale(1); opacity: 1; } }
        .gsgm-piece { position: absolute; top: -12vh; animation: gsgm-confetti linear infinite; }
        .gsgm-card { animation: gsgm-pop 0.4s cubic-bezier(0.2,0.8,0.3,1) both; }
        @media (prefers-reduced-motion: reduce) { .gsgm-piece { display: none; } .gsgm-card { animation: none; } }
      `}</style>

      {/* Confetti layer */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        {pieces.map((p, i) => (
          <span key={i} className="gsgm-piece" style={{
            left: `${p.left}%`, width: p.size, height: p.size * (p.round ? 1 : 1.6),
            background: p.color, borderRadius: p.round ? '50%' : 2,
            transform: `rotate(${p.rot}deg)`, animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s`,
          }} />
        ))}
      </div>

      {/* Card */}
      <div onClick={e => e.stopPropagation()} className="gsgm-card w-full text-center" style={{ maxWidth: 380, background: '#FFFFFF', borderRadius: 22, overflow: 'hidden', boxShadow: '0 24px 70px rgba(0,0,0,0.45)' }}>
        <div className="px-6 pt-7 pb-5" style={{ background: `linear-gradient(135deg, ${accent}, ${accent}bb)` }}>
          <div className="mx-auto mb-3 flex items-center justify-center rounded-2xl text-3xl" style={{ width: 64, height: 64, background: 'rgba(255,255,255,0.2)', border: '1.5px solid rgba(255,255,255,0.4)' }}>{emblem}</div>
          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/85">You're in</div>
          <h2 className="text-xl font-extrabold text-white leading-tight mt-1">Welcome to the<br />{TOURNAMENT.edition}</h2>
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-white/85 mt-1.5">{loc} · {SURFACE.label}</div>
        </div>
        <div className="px-6 py-5">
          <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
            <b style={{ color: 'var(--ink)' }}>{teamName}</b> is on the entry list. Draft {SQUAD_SIZE} players with your ${STARTING_BUDGET}M, name a captain, and climb the leaderboard.
          </p>
          <button onClick={onBuild}
            className="w-full min-h-[48px] py-3 rounded-xl font-extrabold text-sm text-white mt-4 transition-transform active:scale-[0.99]"
            style={{ background: accent, boxShadow: `0 8px 22px ${accent}55` }}>
            Build my squad →
          </button>
          <button onClick={onDone} className="w-full min-h-[44px] py-2.5 mt-1 rounded-xl font-semibold text-sm" style={{ color: 'var(--ink-2)' }}>
            Look around first
          </button>
        </div>
      </div>
    </div>
  );
}
