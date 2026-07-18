import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { PLAYERS, getPlayer } from '../data/players';
import { ROUNDS, isPlayerOut, getPlayerExit } from '../data/tournament';
import { getTier, TIER_META } from '../data/tiers';
import PlayerAvatar from '../components/PlayerAvatar';
import { toast } from '../store/toastStore';
import type { RoundId, Player } from '../types';

type SortKey = 'ranking' | 'price' | 'grass';

const TEAM_SIZE = 6;
const SORT_LABEL: Record<SortKey, string> = { ranking: '# Rank', price: '$ Price', grass: 'Grass %' };

export default function DraftPage() {
  const { myTeam, captain, budget, currentRoundIndex, addPlayer, removePlayer, setCaptain, finalizeDraft, openPlayer } = useGameStore();
  const [sort, setSort] = useState<SortKey>('ranking');
  const [search, setSearch] = useState('');
  const [confirm, setConfirm] = useState<Player | null>(null);

  const revealed = ROUNDS.slice(0, currentRoundIndex).map(r => r.id) as RoundId[];

  const sorted = [...PLAYERS]
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sort === 'ranking') return a.ranking - b.ranking;
      if (sort === 'price') return b.price - a.price;
      if (sort === 'grass') return b.surface.grass - a.surface.grass;
      return 0;
    });

  const th = 'text-left px-2 py-2 text-[11px] font-bold uppercase tracking-wide';

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-3 py-6">
      <div className="flex gap-4 lg:gap-6 items-start">

        {/* ── Left: Player table ── */}
        <div className="flex-1 min-w-0">
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <input
              type="text"
              placeholder="Search player…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="text-sm outline-none px-3 py-2 rounded-xl w-44"
              style={{ background: '#FFFFFF', border: '1px solid rgba(10,27,51,0.09)', color: '#0a1f44' }}
            />
            <div className="flex rounded-xl overflow-hidden ml-auto" style={{ border: '1px solid rgba(10,27,51,0.07)' }}>
              {(['ranking', 'price', 'grass'] as SortKey[]).map(s => (
                <button
                  key={s}
                  onClick={() => setSort(s)}
                  className="px-3 py-2 text-xs font-semibold transition-colors"
                  style={{ background: sort === s ? 'rgba(10,27,51,0.08)' : 'transparent', color: sort === s ? '#0a1f44' : '#5B6B84' }}
                >
                  {SORT_LABEL[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(10,27,51,0.08)' }}>
            <table className="w-full text-sm border-collapse bg-white">
              <thead>
                <tr style={{ background: '#F5F7FA' }}>
                  <th className={th} rowSpan={2} style={{ color: '#9AA7BC', textAlign: 'center', width: 54 }}><div style={{ lineHeight: 1.05 }}>ATP<br />Ranking</div></th>
                  <th className={th} rowSpan={2} style={{ color: '#5B6B84' }}>Player</th>
                  <th className={`${th} hidden sm:table-cell`} rowSpan={2} style={{ color: '#5B6B84', textAlign: 'center' }}>Age</th>
                  <th className={`${th} hidden md:table-cell`} colSpan={3} style={{ color: '#5B6B84', textAlign: 'center', borderBottom: '1px solid rgba(10,27,51,0.08)' }}>Win&nbsp;%&nbsp;(YTD)</th>
                  <th className={`${th} hidden md:table-cell`} rowSpan={2} style={{ color: '#5B6B84', textAlign: 'center' }}><div style={{ lineHeight: 1.05 }}>2026<br />W–L</div></th>
                  <th className={`${th} hidden lg:table-cell`} rowSpan={2} style={{ color: '#D99A00', textAlign: 'center' }}><div style={{ lineHeight: 1.05 }}>2026<br />Titles</div></th>
                  <th className={th} rowSpan={2} style={{ color: '#0e6fc4', textAlign: 'right' }}>Price</th>
                  <th className={th} rowSpan={2} style={{ width: 78 }}></th>
                </tr>
                <tr style={{ background: '#F5F7FA', borderBottom: '1px solid rgba(10,27,51,0.1)' }}>
                  <th className={`${th} hidden md:table-cell`} style={{ color: '#12A150', textAlign: 'center' }}>Grass</th>
                  <th className={`${th} hidden md:table-cell`} style={{ color: '#0e6fc4', textAlign: 'center' }}>Hard</th>
                  <th className={`${th} hidden md:table-cell`} style={{ color: '#E5472B', textAlign: 'center' }}>Clay</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(player => {
                  const isSelected = myTeam.includes(player.id);
                  const out = isPlayerOut(player.id, revealed);
                  const full = myTeam.length >= TEAM_SIZE;
                  const canAfford = budget >= player.price;
                  const addable = !isSelected && !out && !full && canAfford;
                  const tierColor = TIER_META[getTier(player.ranking)].color;

                  return (
                    <tr
                      key={player.id}
                      onClick={() => openPlayer(player.id)}
                      className="cursor-pointer transition-colors"
                      style={{
                        borderBottom: '1px solid rgba(10,27,51,0.05)',
                        background: isSelected ? 'rgba(18,161,80,0.05)' : 'transparent',
                        opacity: out ? 0.5 : 1,
                      }}
                      onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'rgba(10,27,51,0.02)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isSelected ? 'rgba(18,161,80,0.05)' : 'transparent'; }}
                    >
                      <td className="px-2 py-1.5 font-num text-xs text-center" style={{ color: tierColor, fontWeight: 700 }}>{player.ranking}</td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <PlayerAvatar playerId={player.id} name={player.name} size="sm" onClick={e => { e.stopPropagation(); openPlayer(player.id); }} />
                          <div className="min-w-0">
                            <div className="text-[13px] font-semibold leading-tight truncate flex items-center gap-1.5" style={{ color: '#0a1f44' }}>
                              {player.name}
                              {out && <span className="text-[9px] font-bold px-1 py-0.5 rounded" style={{ background: 'rgba(229,71,43,0.12)', color: '#E5472B' }}>OUT {getPlayerExit(player.id)}</span>}
                            </div>
                            <div className="text-[10px] leading-tight truncate" style={{ color: '#9AA7BC' }}>{player.style}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-center font-num text-xs hidden sm:table-cell" style={{ color: '#5B6B84' }}>{player.age}</td>
                      <td className="px-2 py-1.5 text-center font-num text-xs font-bold hidden md:table-cell" style={{ color: '#12A150' }}>{player.surface.grass}%</td>
                      <td className="px-2 py-1.5 text-center font-num text-xs hidden md:table-cell" style={{ color: '#5B6B84' }}>{player.surface.hard}%</td>
                      <td className="px-2 py-1.5 text-center font-num text-xs hidden md:table-cell" style={{ color: '#5B6B84' }}>{player.surface.clay}%</td>
                      <td className="px-2 py-1.5 text-center font-num text-xs hidden md:table-cell" style={{ color: '#5B6B84' }}>{player.ytd.wins}–{player.ytd.losses}</td>
                      <td className="px-2 py-1.5 text-center font-num text-xs hidden lg:table-cell" style={{ color: player.ytd.titles > 0 ? '#D99A00' : '#9AA7BC' }}>{player.ytd.titles}</td>
                      <td className="px-2 py-1.5 text-right font-num text-sm font-bold" style={{ color: '#0e6fc4' }}>${player.price}M</td>
                      <td className="px-2 py-1.5 text-right">
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            if (isSelected) { removePlayer(player.id); return; }
                            if (addable) setConfirm(player);
                          }}
                          disabled={!isSelected && !addable}
                          className="text-[11px] font-bold px-2.5 py-1 rounded-lg transition-all whitespace-nowrap"
                          style={{
                            background: isSelected ? 'rgba(229,71,43,0.12)' : addable ? 'rgba(18,161,80,0.12)' : 'rgba(10,27,51,0.04)',
                            border: `1px solid ${isSelected ? 'rgba(229,71,43,0.25)' : addable ? 'rgba(18,161,80,0.25)' : 'rgba(10,27,51,0.06)'}`,
                            color: isSelected ? '#E5472B' : addable ? '#12A150' : '#9AA7BC',
                            cursor: (!isSelected && !addable) ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {isSelected ? 'Remove' : out ? 'Out' : full ? 'Full' : !canAfford ? 'Too $' : '+ Add'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Right: My Squad ── */}
        <div className="w-72 shrink-0 hidden lg:block">
          <div className="sticky top-20 rounded-2xl p-5" style={{ background: '#FFFFFF', border: '1px solid rgba(10,27,51,0.09)' }}>
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-bold text-sm" style={{ color: '#0a1f44' }}>My Squad</h2>
              <span className="font-num text-xs" style={{ color: '#5B6B84' }}>{myTeam.length} / {TEAM_SIZE}</span>
            </div>

            <div className="mb-4 pt-3">
              <div className="flex justify-between text-xs mb-1.5" style={{ color: '#5B6B84' }}>
                <span>Budget</span>
                <span className="font-num font-semibold" style={{ color: '#0e6fc4' }}>${budget.toFixed(1)}M</span>
              </div>
              <div className="h-1 rounded-full" style={{ background: 'rgba(10,27,51,0.07)' }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${budget}%`, background: '#0e6fc4' }} />
              </div>
            </div>

            <div className="space-y-1.5 mb-4">
              {myTeam.length === 0 && (
                <div className="text-center py-6 text-sm" style={{ color: '#9AA7BC' }}>Pick 6 players</div>
              )}
              {myTeam.map(id => {
                const p = getPlayer(id);
                const isCap = captain === id;
                return (
                  <div key={id} className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: isCap ? 'rgba(217,154,0,0.07)' : 'rgba(10,27,51,0.03)', border: `1px solid ${isCap ? 'rgba(217,154,0,0.2)' : 'rgba(10,27,51,0.06)'}` }}>
                    <PlayerAvatar playerId={id} name={p.name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate" style={{ color: '#0a1f44' }}>{p.name}</div>
                      <div className="font-num text-[10px]" style={{ color: '#5B6B84' }}>${p.price}M · 🌱{p.surface.grass}%</div>
                    </div>
                    {isCap && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: 'rgba(217,154,0,0.15)', color: '#D99A00', border: '1px solid rgba(217,154,0,0.25)' }}>C</span>}
                    <button onClick={() => setCaptain(id)} className="text-xs px-1.5 py-1 rounded-lg transition-all shrink-0" title="Set as captain" style={{ background: isCap ? 'rgba(217,154,0,0.15)' : 'rgba(10,27,51,0.05)', border: `1px solid ${isCap ? 'rgba(217,154,0,0.25)' : 'rgba(10,27,51,0.07)'}`, color: isCap ? '#D99A00' : '#5B6B84' }}>⭐</button>
                    <button onClick={() => removePlayer(id)} className="text-xs px-1.5 py-1 rounded-lg transition-all shrink-0" style={{ background: 'rgba(10,27,51,0.04)', border: '1px solid rgba(10,27,51,0.06)', color: '#5B6B84' }}>✕</button>
                  </div>
                );
              })}
              {Array.from({ length: TEAM_SIZE - myTeam.length }).map((_, i) => (
                <div key={`e${i}`} className="px-3 py-2 rounded-xl text-xs text-center" style={{ border: '1px dashed rgba(10,27,51,0.06)', color: '#9AA7BC' }}>Empty slot</div>
              ))}
            </div>

            {myTeam.length > 0 && !captain && (
              <p className="text-xs mb-3" style={{ color: '#D99A00' }}>⭐ Tap ⭐ to pick a captain</p>
            )}

            <button
              onClick={() => { finalizeDraft(); toast('Squad locked in — good luck! 🎾', 'good'); }}
              disabled={myTeam.length === 0}
              className="w-full py-2.5 rounded-xl font-bold text-sm transition-all"
              style={{ background: myTeam.length > 0 ? '#0e6fc4' : 'rgba(10,27,51,0.05)', color: myTeam.length > 0 ? '#fff' : '#9AA7BC', cursor: myTeam.length === 0 ? 'not-allowed' : 'pointer' }}
            >
              {myTeam.length === 0 ? 'Pick players first' : 'Lock Squad →'}
            </button>
          </div>
        </div>
      </div>

      {/* Purchase confirmation */}
      {confirm && (
        <div onClick={() => setConfirm(null)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(10,27,51,0.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
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
    </div>
  );
}
