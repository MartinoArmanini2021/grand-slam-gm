import { useProfile } from '../store/profileStore';
import { TOURNAMENT, SURFACE } from '../data/tournamentConfig';
import Confetti from './Confetti';

// ── The conversion payoff ────────────────────────────────────────────────────
// Fires the moment a squad is LOCKED — the single most important event in the funnel.
// Celebrates it, confirms the player is live on the leaderboard, and pivots straight
// into the viral loop (create a private league / invite friends) at peak intent.
export default function SquadLockedModal({ open, onClose, onInvite }: { open: boolean; onClose: () => void; onInvite: () => void }) {
  const teamName = useProfile(s => s.teamName);
  const emblem = useProfile(s => s.teamEmblem);
  const accent = SURFACE.accent;
  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true" aria-label="Squad locked" onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(6,17,34,0.72)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflow: 'hidden' }}>
      <Confetti />
      <div onClick={e => e.stopPropagation()} className="fade-in w-full text-center" style={{ maxWidth: 380, background: '#FFFFFF', borderRadius: 18, overflow: 'hidden', boxShadow: '0 24px 70px rgba(0,0,0,0.45)' }}>
        <div className="px-6 pt-7 pb-5" style={{ background: `linear-gradient(135deg, ${accent}, ${accent}bb)` }}>
          <div className="mx-auto mb-3 flex items-center justify-center rounded-2xl text-3xl" style={{ width: 64, height: 64, background: 'rgba(255,255,255,0.2)', border: '1.5px solid rgba(255,255,255,0.4)' }}>{emblem}</div>
          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/85">Squad locked</div>
          <h2 className="text-xl font-extrabold text-white leading-tight mt-1">{teamName} is in! 🎾</h2>
          <div className="text-xs text-white/85 mt-1.5">You're live on the {TOURNAMENT.name} leaderboard.</div>
        </div>
        <div className="px-6 py-5">
          <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
            The real fun is beating people you know. Spin up a private league and pull your friends in — everyone drafts, one leaderboard, bragging rights on the line.
          </p>
          <button onClick={onInvite}
            className="w-full min-h-[48px] py-3 rounded-xl font-extrabold text-sm text-white mt-4 transition-transform active:scale-[0.99]"
            style={{ background: accent, boxShadow: `0 8px 22px ${accent}55` }}>
            Create a league & invite friends →
          </button>
          <button onClick={onClose} className="w-full min-h-[44px] py-2.5 mt-1 rounded-xl font-semibold text-sm" style={{ color: 'var(--ink-2)' }}>
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
