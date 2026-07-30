import { useState, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { PLAYERS } from '../data/players';
import { getTier, TIER_META } from '../data/tiers';
import { SQUAD_SIZE, isTierFull } from '../data/squadRules';
import { useEscapeToClose } from '../hooks';
import PlayerAvatar from './PlayerAvatar';
import PlayerTag from './PlayerTag';
import PurchaseConfirmModal from './PurchaseConfirmModal';
import type { Player } from '../types';

const TEAM_SIZE = SQUAD_SIZE;

export default function PlayerPickerModal({ open, onClose, assignRole }: { open: boolean; onClose: () => void; assignRole?: 'C' | 'V' | null }) {
  const { myTeam, budget, removePlayer } = useGameStore();
  const [search, setSearch] = useState('');
  const [confirm, setConfirm] = useState<Player | null>(null);
  // Reset the filter and any pending confirm each time the picker opens, so the
  // Replace flow doesn't reopen still filtered by the last search.
  useEffect(() => { if (open) { setSearch(''); setConfirm(null); } }, [open]);
  useEscapeToClose(onClose, open);
  if (!open) return null;

  const list = [...PLAYERS]
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.ranking - b.ranking);

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(10,27,51,0.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
        <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Add players" className="fade-in w-full" style={{ maxWidth: 520, background: '#FFFFFF', borderRadius: '18px 18px 0 0', maxHeight: '82vh', display: 'flex', flexDirection: 'column' }}>
          {/* Header */}
          <div style={{ background: 'linear-gradient(120deg,var(--ink),var(--navy-2))', padding: '16px 18px', borderRadius: '18px 18px 0 0' }}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-white font-extrabold text-base">{assignRole === 'C' ? 'Sign your Captain' : assignRole === 'V' ? 'Sign your Vice' : 'Add players'}</div>
                <div className="text-xs" style={{ color: 'var(--on-navy)' }}>
                  {assignRole ? <>pick a player — they’re signed {assignRole === 'C' ? 'as Captain ×2' : 'as Vice ×1.5'} · </> : null}
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
              className="mt-3 w-full text-sm px-3 py-2 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.14)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}
            />
          </div>

          {/* List */}
          <div className="overflow-y-auto p-2" style={{ flex: 1 }}>
            {list.map(p => {
              const owned = myTeam.includes(p.id);
              const full = myTeam.length >= TEAM_SIZE;
              const canAfford = budget >= p.price;
              const tier = getTier(p.ranking);
              const tierFull = !owned && isTierFull(tier, myTeam);
              const disabled = !owned && (full || !canAfford || tierFull);
              const tm = TIER_META[tier];
              return (
                <div key={p.id} className="flex items-center gap-3 px-2 py-2 rounded-xl" style={{ opacity: disabled ? 0.5 : 1 }}>
                  <PlayerAvatar playerId={p.id} name={p.name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <PlayerTag playerId={p.id} flag={p.flag} className="text-[9px] font-bold uppercase tracking-wide leading-tight truncate" style={{ color: 'var(--blue)' }} />
                    <div className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{p.name}</div>
                    <div className="text-[11px]" style={{ color: tm.color }}>{getTier(p.ranking)} · #{p.ranking}</div>
                  </div>
                  <div className="font-num text-sm font-bold shrink-0 w-12 text-right" style={{ color: 'var(--blue)' }}>${p.price}M</div>
                  <button
                    onClick={() => {
                      if (owned) { removePlayer(p.id); return; }
                      if (disabled) return;
                      setConfirm(p);
                    }}
                    disabled={disabled}
                    className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg"
                    style={{
                      background: owned ? 'rgba(229,71,43,0.12)' : disabled ? 'rgba(10,27,51,0.05)' : 'var(--blue)',
                      color: owned ? 'var(--ember)' : disabled ? 'var(--ink-3)' : '#fff',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {owned ? 'Remove' : full ? 'Full' : tierFull ? 'Limit' : !canAfford ? 'Too $' : '+ Add'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Purchase confirmation — shared with the Market. On a successful buy it
          closes the picker too, so the selection window shuts after each pick. */}
      <PurchaseConfirmModal player={confirm} onClose={() => setConfirm(null)} onPurchased={onClose} assignRole={assignRole} />
    </>
  );
}
