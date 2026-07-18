import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { PLAYERS } from '../data/players';
import { getTier, TIER_META } from '../data/tiers';
import PlayerAvatar from './PlayerAvatar';
import { toast } from '../store/toastStore';
import type { Player } from '../types';

const TEAM_SIZE = 6;

export default function PlayerPickerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { myTeam, budget, addPlayer, removePlayer } = useGameStore();
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

      {/* Purchase confirmation — same as the Market */}
      {confirm && (
        <div onClick={() => setConfirm(null)} style={{ position: 'fixed', inset: 0, zIndex: 210, background: 'rgba(10,27,51,0.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} className="fade-in rounded-2xl w-full" style={{ maxWidth: 360, padding: 20, background: '#fff' }}>
            <div className="flex items-center gap-3 mb-3">
              <PlayerAvatar playerId={confirm.id} name={confirm.name} size="lg" />
              <div>
                <div className="font-extrabold text-base" style={{ color: '#0a1f44' }}>{confirm.name}</div>
                <div className="text-xs" style={{ color: '#5B6B84' }}>#{confirm.ranking} · {getTier(confirm.ranking)}</div>
              </div>
            </div>
            <div className="rounded-xl px-3 py-2.5 mb-4 flex items-center justify-between text-sm" style={{ background: '#F5F7FA' }}>
              <span style={{ color: '#5B6B84' }}>Price · budget after</span>
              <span className="font-num font-bold" style={{ color: '#0a1f44' }}>${confirm.price}M · ${(budget - confirm.price).toFixed(1)}M</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setConfirm(null)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold" style={{ background: '#F0F3F7', color: '#0a1f44', border: '1px solid rgba(10,27,51,0.1)' }}>Cancel</button>
              <button
                onClick={() => {
                  addPlayer(confirm.id);
                  toast(`${confirm.name.split(' ').slice(-1)[0]} added to your squad`, 'good');
                  if (myTeam.length + 1 >= TEAM_SIZE) toast('Squad full — 6 players picked', 'good');
                  setConfirm(null);
                }}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white"
                style={{ background: '#12A150' }}
              >
                Confirm buy
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
