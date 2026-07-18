import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { PLAYERS } from '../data/players';
import { getTier, TIER_META } from '../data/tiers';
import PlayerAvatar from './PlayerAvatar';
import PurchaseConfirmModal from './PurchaseConfirmModal';
import type { Player } from '../types';

const TEAM_SIZE = 6;

export default function PlayerPickerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { myTeam, budget, removePlayer } = useGameStore();
  const [search, setSearch] = useState('');
  const [confirm, setConfirm] = useState<Player | null>(null);
  if (!open) return null;

  const list = [...PLAYERS]
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.ranking - b.ranking);

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(10,27,51,0.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
        <div onClick={e => e.stopPropagation()} className="fade-in w-full" style={{ maxWidth: 520, background: '#FFFFFF', borderRadius: '18px 18px 0 0', maxHeight: '82vh', display: 'flex', flexDirection: 'column' }}>
          {/* Header */}
          <div style={{ background: 'linear-gradient(120deg,#0a1f44,#123163)', padding: '16px 18px', borderRadius: '18px 18px 0 0' }}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-white font-extrabold text-base">Add players</div>
                <div className="text-xs" style={{ color: '#AFBFDA' }}>
                  <span className="font-num">${budget.toFixed(1)}M</span> left · {myTeam.length}/{TEAM_SIZE} picked
                </div>
              </div>
              <button onClick={onClose} className="text-white text-sm font-bold px-3 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.15)' }}>Done</button>
            </div>
            <input
              type="text"
              placeholder="Search player…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="mt-3 w-full text-sm outline-none px-3 py-2 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.14)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}
            />
          </div>

          {/* List */}
          <div className="overflow-y-auto p-2" style={{ flex: 1 }}>
            {list.map(p => {
              const owned = myTeam.includes(p.id);
              const full = myTeam.length >= TEAM_SIZE;
              const canAfford = budget >= p.price;
              const disabled = !owned && (full || !canAfford);
              const tm = TIER_META[getTier(p.ranking)];
              return (
                <div key={p.id} className="flex items-center gap-3 px-2 py-2 rounded-xl" style={{ opacity: disabled ? 0.5 : 1 }}>
                  <PlayerAvatar playerId={p.id} name={p.name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate" style={{ color: '#0a1f44' }}>{p.name}</div>
                    <div className="text-[11px]" style={{ color: tm.color }}>{getTier(p.ranking)} · #{p.ranking}</div>
                  </div>
                  <div className="font-num text-sm font-bold shrink-0 w-12 text-right" style={{ color: '#0e6fc4' }}>${p.price}M</div>
                  <button
                    onClick={() => {
                      if (owned) { removePlayer(p.id); return; }
                      if (disabled) return;
                      setConfirm(p);
                    }}
                    disabled={disabled}
                    className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg"
                    style={{
                      background: owned ? 'rgba(229,71,43,0.12)' : disabled ? 'rgba(10,27,51,0.05)' : '#0e6fc4',
                      color: owned ? '#E5472B' : disabled ? '#9AA7BC' : '#fff',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {owned ? 'Remove' : full ? 'Full' : !canAfford ? 'Too $' : '+ Add'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Purchase confirmation — shared with the Market */}
      <PurchaseConfirmModal player={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
