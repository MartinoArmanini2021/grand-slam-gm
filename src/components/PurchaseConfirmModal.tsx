import { useGameStore } from '../store/gameStore';
import { getTier } from '../data/tiers';
import { lastName } from '../data/format';
import { SQUAD_SIZE } from '../data/squadRules';
import { toast } from '../store/toastStore';
import { useEscapeToClose } from '../hooks';
import PlayerAvatar from './PlayerAvatar';
import type { Player } from '../types';

const TEAM_SIZE = SQUAD_SIZE;

// Shared purchase confirmation — used by the Market table and the on-court picker.
export default function PurchaseConfirmModal({ player, onClose, onPurchased }: { player: Player | null; onClose: () => void; onPurchased?: () => void }) {
  const { budget, addPlayer } = useGameStore();
  useEscapeToClose(onClose, !!player);
  if (!player) return null;

  const buy = () => {
    const before = useGameStore.getState().myTeam.length;
    addPlayer(player.id);
    const team = useGameStore.getState().myTeam;
    // addPlayer guards on phase/full/duplicate/budget/tier — only confirm if it took.
    if (team.includes(player.id) && team.length > before) {
      toast(`${lastName(player.name)} added to your squad`, 'good');
      if (team.length >= TEAM_SIZE) toast(`Squad full — ${TEAM_SIZE} players picked`, 'good');
      onClose();
      onPurchased?.(); // close the surrounding picker window too
    } else {
      toast(`Couldn't add ${lastName(player.name)} — over budget, squad full, or tier limit reached`, 'warn');
      onClose();
    }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 210, background: 'rgba(10,27,51,0.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Confirm signing ${player.name}`} className="fade-in rounded-2xl w-full" style={{ maxWidth: 360, padding: 20, background: '#fff' }}>
        <div className="flex items-center gap-3 mb-3">
          <PlayerAvatar playerId={player.id} name={player.name} size="lg" />
          <div>
            <div className="font-extrabold text-base" style={{ color: 'var(--ink)' }}>{player.name}</div>
            <div className="text-xs" style={{ color: 'var(--ink-2)' }}>#{player.ranking} · {getTier(player.ranking)}</div>
          </div>
        </div>
        <div className="rounded-xl px-3 py-2.5 mb-4 flex items-center justify-between text-sm" style={{ background: 'var(--raised)' }}>
          <span style={{ color: 'var(--ink-2)' }}>Price · budget after</span>
          <span className="font-num font-bold" style={{ color: 'var(--ink)' }}>${player.price}M · ${(budget - player.price).toFixed(1)}M</span>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold" style={{ background: '#F0F3F7', color: 'var(--ink)', border: '1px solid rgba(10,27,51,0.1)' }}>Cancel</button>
          <button onClick={buy} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: 'var(--green)' }}>Confirm buy</button>
        </div>
      </div>
    </div>
  );
}
