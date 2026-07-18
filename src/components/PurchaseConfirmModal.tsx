import { useGameStore } from '../store/gameStore';
import { getTier } from '../data/tiers';
import { lastName } from '../data/format';
import { toast } from '../store/toastStore';
import PlayerAvatar from './PlayerAvatar';
import type { Player } from '../types';

const TEAM_SIZE = 6;

// Shared purchase confirmation — used by the Market table and the on-court picker.
export default function PurchaseConfirmModal({ player, onClose }: { player: Player | null; onClose: () => void }) {
  const { myTeam, budget, addPlayer } = useGameStore();
  if (!player) return null;

  const buy = () => {
    addPlayer(player.id);
    toast(`${lastName(player.name)} added to your squad`, 'good');
    if (myTeam.length + 1 >= TEAM_SIZE) toast('Squad full — 6 players picked', 'good');
    onClose();
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 210, background: 'rgba(10,27,51,0.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} className="fade-in rounded-2xl w-full" style={{ maxWidth: 360, padding: 20, background: '#fff' }}>
        <div className="flex items-center gap-3 mb-3">
          <PlayerAvatar playerId={player.id} name={player.name} size="lg" />
          <div>
            <div className="font-extrabold text-base" style={{ color: '#0a1f44' }}>{player.name}</div>
            <div className="text-xs" style={{ color: '#5B6B84' }}>#{player.ranking} · {getTier(player.ranking)}</div>
          </div>
        </div>
        <div className="rounded-xl px-3 py-2.5 mb-4 flex items-center justify-between text-sm" style={{ background: '#F5F7FA' }}>
          <span style={{ color: '#5B6B84' }}>Price · budget after</span>
          <span className="font-num font-bold" style={{ color: '#0a1f44' }}>${player.price}M · ${(budget - player.price).toFixed(1)}M</span>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold" style={{ background: '#F0F3F7', color: '#0a1f44', border: '1px solid rgba(10,27,51,0.1)' }}>Cancel</button>
          <button onClick={buy} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: '#12A150' }}>Confirm buy</button>
        </div>
      </div>
    </div>
  );
}
