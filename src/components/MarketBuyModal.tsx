import { getTier } from '../data/tiers';
import { useEscapeToClose } from '../hooks';
import PlayerAvatar from './PlayerAvatar';
import type { Player } from '../types';

// Confirm a LIVE market purchase. On confirm the buy is applied immediately (saved), but it stays
// UNDOABLE until its round starts — so the manager can change their mind without a separate lock
// step. Presentational: onConfirm does the buy; no store logic lives in this modal.
export default function MarketBuyModal({ player, budgetAfter, onConfirm, onClose }: { player: Player | null; budgetAfter: number; onConfirm: () => void; onClose: () => void }) {
  useEscapeToClose(onClose, !!player);
  if (!player) return null;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 210, background: 'rgba(10,27,51,0.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Confirm buying ${player.name}`} className="fade-in rounded-2xl w-full" style={{ maxWidth: 360, padding: 20, background: '#fff' }}>
        <div className="flex items-center gap-3 mb-3">
          <PlayerAvatar playerId={player.id} name={player.name} size="lg" />
          <div>
            <div className="font-extrabold text-base" style={{ color: 'var(--ink)' }}>{player.name}</div>
            <div className="text-xs" style={{ color: 'var(--ink-2)' }}>#{player.ranking} · {getTier(player.ranking)}</div>
          </div>
        </div>
        <div className="rounded-xl px-3 py-2.5 mb-3 flex items-center justify-between text-sm" style={{ background: 'var(--raised)' }}>
          <span style={{ color: 'var(--ink-2)' }}>Price · budget after</span>
          <span className="font-num font-bold" style={{ color: 'var(--ink)' }}>${player.price}M · ${budgetAfter.toFixed(1)}M</span>
        </div>
        <p className="text-[11px] mb-4" style={{ color: 'var(--ink-3)' }}>
          They join your squad now — but you can <b style={{ color: 'var(--ink)' }}>Undo</b> right up until the round starts.
        </p>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold" style={{ background: '#F0F3F7', color: 'var(--ink)', border: '1px solid rgba(10,27,51,0.1)' }}>Cancel</button>
          <button onClick={() => { onConfirm(); onClose(); }} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: 'var(--green)' }}>Sign player</button>
        </div>
      </div>
    </div>
  );
}
