import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { PLAYERS, getPlayer } from '../data/players';
import SurfaceBar from '../components/SurfaceBar';
import FormDots from '../components/FormDots';
import PlayerAvatar from '../components/PlayerAvatar';
import { toast } from '../store/toastStore';

type SortKey = 'ranking' | 'price' | 'grass' | 'form';
type FilterSurface = 'all' | 'grass' | 'hard' | 'clay';

const TEAM_SIZE = 6;

const SURFACE_LABEL: Record<FilterSurface, string> = {
  all: 'All', grass: 'Grass', clay: 'Clay', hard: 'Hard',
};

const SORT_LABEL: Record<SortKey, string> = {
  ranking: '# Rank', price: '$ Price', grass: 'Grass %', form: 'Form',
};

export default function DraftPage() {
  const { myTeam, captain, budget, addPlayer, removePlayer, setCaptain, finalizeDraft, openPlayer } = useGameStore();
  const [sort, setSort] = useState<SortKey>('ranking');
  const [filter, setFilter] = useState<FilterSurface>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sorted = [...PLAYERS]
    .filter(p => {
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (filter === 'grass') return p.surface.grass >= 75;
      if (filter === 'clay') return p.surface.clay >= 75;
      if (filter === 'hard') return p.surface.hard >= 82;
      return true;
    })
    .sort((a, b) => {
      if (sort === 'ranking') return a.ranking - b.ranking;
      if (sort === 'price') return b.price - a.price;
      if (sort === 'grass') return b.surface.grass - a.surface.grass;
      if (sort === 'form') return b.form.filter(r => r === 'W').length - a.form.filter(r => r === 'W').length;
      return 0;
    });

  const canAdd = (price: number) => myTeam.length < TEAM_SIZE && budget >= price;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex gap-6 items-start">

        {/* ── Left: Player list ── */}
        <div className="flex-1 min-w-0">
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <input
              type="text"
              placeholder="Search player…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="text-sm outline-none px-3 py-2 rounded-xl w-44"
              style={{
                background: '#FFFFFF',
                border: '1px solid rgba(10,27,51,0.09)',
                color: '#0A1B33',
              }}
            />
            {/* Surface filter */}
            <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid rgba(10,27,51,0.07)' }}>
              {(['all','grass','clay','hard'] as FilterSurface[]).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className="px-3 py-2 text-xs font-semibold transition-colors"
                  style={{
                    background: filter === f
                      ? f === 'grass' ? 'rgba(18,161,80,0.15)'
                        : f === 'clay' ? 'rgba(229,71,43,0.15)'
                        : f === 'hard' ? 'rgba(20,102,214,0.15)'
                        : 'rgba(10,27,51,0.1)'
                      : 'transparent',
                    color: filter === f
                      ? f === 'grass' ? '#12A150'
                        : f === 'clay' ? '#E5472B'
                        : f === 'hard' ? '#1466D6'
                        : '#0A1B33'
                      : '#5B6B84',
                  }}
                >
                  {SURFACE_LABEL[f]}
                </button>
              ))}
            </div>
            {/* Sort */}
            <div className="flex rounded-xl overflow-hidden ml-auto" style={{ border: '1px solid rgba(10,27,51,0.07)' }}>
              {(['ranking','price','grass','form'] as SortKey[]).map(s => (
                <button
                  key={s}
                  onClick={() => setSort(s)}
                  className="px-3 py-2 text-xs font-semibold transition-colors"
                  style={{
                    background: sort === s ? 'rgba(10,27,51,0.08)' : 'transparent',
                    color: sort === s ? '#0A1B33' : '#5B6B84',
                  }}
                >
                  {SORT_LABEL[s]}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          <div className="space-y-1.5">
            {sorted.map(player => {
              const isSelected = myTeam.includes(player.id);
              const isExpanded = expandedId === player.id;
              const disabled = !isSelected && !canAdd(player.price);

              return (
                <div key={player.id}>
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : player.id)}
                    className="flex items-center gap-3 px-4 py-3 rounded-2xl cursor-pointer transition-all"
                    style={{
                      background: isSelected
                        ? 'rgba(18,161,80,0.06)'
                        : disabled ? 'rgba(10,27,51,0.02)' : '#FFFFFF',
                      border: `1px solid ${isSelected
                        ? 'rgba(18,161,80,0.25)'
                        : disabled ? 'rgba(10,27,51,0.04)' : 'rgba(10,27,51,0.07)'}`,
                      opacity: disabled && !isSelected ? 0.45 : 1,
                    }}
                  >
                    {/* Rank */}
                    <div className="font-num w-7 text-xs shrink-0 text-right" style={{ color: '#9AA7BC' }}>
                      {player.ranking}
                    </div>

                    {/* Avatar + name */}
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <PlayerAvatar playerId={player.id} name={player.name} size="sm" onClick={e => { e.stopPropagation(); openPlayer(player.id); }} />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate" style={{ color: '#0A1B33' }}>
                          {player.name}
                          {player.seed && (
                            <span className="ml-1.5 font-num text-[10px] px-1 py-0.5 rounded" style={{ background: 'rgba(10,27,51,0.07)', color: '#5B6B84' }}>
                              [{player.seed}]
                            </span>
                          )}
                        </div>
                        <div className="text-xs truncate" style={{ color: '#5B6B84' }}>{player.style}</div>
                      </div>
                    </div>

                    {/* Form (hidden on small) */}
                    <div className="hidden sm:block shrink-0">
                      <FormDots form={player.form} size="sm" />
                    </div>

                    {/* Surface nums */}
                    <div className="hidden lg:flex gap-3 text-xs shrink-0">
                      <span className="font-num font-semibold" style={{ color: '#12A150' }}>G {player.surface.grass}%</span>
                      <span className="font-num" style={{ color: '#1466D6' }}>H {player.surface.hard}%</span>
                      <span className="font-num" style={{ color: '#E5472B' }}>C {player.surface.clay}%</span>
                    </div>

                    {/* Price */}
                    <div className="font-num font-bold text-sm shrink-0 w-14 text-right" style={{ color: '#1466D6' }}>
                      ${player.price}M
                    </div>

                    {/* Add/Remove btn */}
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        isSelected ? removePlayer(player.id) : addPlayer(player.id);
                      }}
                      disabled={disabled && !isSelected}
                      className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                      style={{
                        background: isSelected
                          ? 'rgba(229,71,43,0.12)'
                          : disabled ? 'rgba(10,27,51,0.04)' : 'rgba(18,161,80,0.12)',
                        border: `1px solid ${isSelected
                          ? 'rgba(229,71,43,0.25)'
                          : disabled ? 'rgba(10,27,51,0.06)' : 'rgba(18,161,80,0.25)'}`,
                        color: isSelected ? '#E5472B' : disabled ? '#9AA7BC' : '#12A150',
                        cursor: disabled && !isSelected ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {isSelected ? 'Remove' : '+ Add'}
                    </button>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="mx-1 mb-1.5 px-5 py-4 rounded-b-2xl" style={{ background: '#F5F7FA', border: '1px solid rgba(10,27,51,0.07)', borderTop: 'none' }}>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: '#5B6B84' }}>Surface Win Rate</div>
                          <SurfaceBar hard={player.surface.hard} clay={player.surface.clay} grass={player.surface.grass} highlight="grass" />
                        </div>
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: '#5B6B84' }}>2026 Results</div>
                          <div className="flex flex-wrap gap-2">
                            {player.yearResults.map(r => (
                              <div key={r.short} className="text-center">
                                <div className="text-[9px] mb-1" style={{ color: '#5B6B84' }}>{r.short}</div>
                                <ResultBadge result={r.result} />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 pt-3 flex gap-4 text-xs" style={{ borderTop: '1px solid rgba(10,27,51,0.06)', color: '#5B6B84' }}>
                        <span>YTD {player.ytd.wins}W–{player.ytd.losses}L</span>
                        <span>{player.ytd.titles > 0 ? `${player.ytd.titles} title${player.ytd.titles > 1 ? 's' : ''}` : 'No titles'}</span>
                        <span>{player.hand === 'R' ? 'RH' : 'LH'} · Age {player.age}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Right: My Squad ── */}
        <div className="w-72 shrink-0 hidden lg:block">
          <div className="sticky top-20 rounded-2xl p-5" style={{ background: '#FFFFFF', border: '1px solid rgba(10,27,51,0.09)' }}>
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-bold text-sm" style={{ color: '#0A1B33' }}>My Squad</h2>
              <span className="font-num text-xs" style={{ color: '#5B6B84' }}>{myTeam.length} / {TEAM_SIZE}</span>
            </div>

            {/* Budget bar */}
            <div className="mb-4 pt-3">
              <div className="flex justify-between text-xs mb-1.5" style={{ color: '#5B6B84' }}>
                <span>Budget</span>
                <span className="font-num font-semibold" style={{ color: '#1466D6' }}>${budget.toFixed(1)}M</span>
              </div>
              <div className="h-1 rounded-full" style={{ background: 'rgba(10,27,51,0.07)' }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${budget}%`, background: '#1466D6' }} />
              </div>
            </div>

            {/* Team slots */}
            <div className="space-y-1.5 mb-4">
              {myTeam.length === 0 && (
                <div className="text-center py-6 text-sm" style={{ color: '#9AA7BC' }}>Pick 6 players</div>
              )}
              {myTeam.map(id => {
                const p = getPlayer(id);
                const isCap = captain === id;
                return (
                  <div
                    key={id}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl"
                    style={{
                      background: isCap ? 'rgba(217,154,0,0.07)' : 'rgba(10,27,51,0.03)',
                      border: `1px solid ${isCap ? 'rgba(217,154,0,0.2)' : 'rgba(10,27,51,0.06)'}`,
                    }}
                  >
                    <PlayerAvatar playerId={id} name={p.name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate" style={{ color: '#0A1B33' }}>{p.name}</div>
                      <div className="font-num text-[10px]" style={{ color: '#5B6B84' }}>${p.price}M · 🌱{p.surface.grass}%</div>
                    </div>
                    {isCap && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: 'rgba(217,154,0,0.15)', color: '#D99A00', border: '1px solid rgba(217,154,0,0.25)' }}>C</span>
                    )}
                    <button
                      onClick={() => setCaptain(id)}
                      className="text-xs px-1.5 py-1 rounded-lg transition-all shrink-0"
                      title="Set as captain"
                      style={{
                        background: isCap ? 'rgba(217,154,0,0.15)' : 'rgba(10,27,51,0.05)',
                        border: `1px solid ${isCap ? 'rgba(217,154,0,0.25)' : 'rgba(10,27,51,0.07)'}`,
                        color: isCap ? '#D99A00' : '#5B6B84',
                      }}
                    >
                      ⭐
                    </button>
                    <button
                      onClick={() => removePlayer(id)}
                      className="text-xs px-1.5 py-1 rounded-lg transition-all shrink-0"
                      style={{ background: 'rgba(10,27,51,0.04)', border: '1px solid rgba(10,27,51,0.06)', color: '#5B6B84' }}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
              {Array.from({ length: TEAM_SIZE - myTeam.length }).map((_, i) => (
                <div key={`e${i}`} className="px-3 py-2 rounded-xl text-xs text-center" style={{ border: '1px dashed rgba(10,27,51,0.06)', color: '#9AA7BC' }}>
                  Empty slot
                </div>
              ))}
            </div>

            {myTeam.length > 0 && !captain && (
              <p className="text-xs mb-3" style={{ color: '#D99A00' }}>⭐ Tap ⭐ to pick a captain</p>
            )}

            <button
              onClick={() => { finalizeDraft(); toast('Squad locked in — good luck! 🎾', 'good'); }}
              disabled={myTeam.length === 0}
              className="w-full py-2.5 rounded-xl font-bold text-sm transition-all"
              style={{
                background: myTeam.length > 0 ? '#1466D6' : 'rgba(10,27,51,0.05)',
                color: myTeam.length > 0 ? '#fff' : '#9AA7BC',
                cursor: myTeam.length === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              {myTeam.length === 0 ? 'Pick players first' : 'Lock Squad →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultBadge({ result }: { result: string }) {
  const cfg: Record<string, [string, string]> = {
    W:   ['rgba(217,154,0,0.15)',  '#D99A00'],
    F:   ['rgba(10,27,51,0.08)', '#0A1B33'],
    SF:  ['rgba(20,102,214,0.12)',  '#1466D6'],
    QF:  ['rgba(18,161,80,0.12)',    '#12A150'],
    R16: ['rgba(10,27,51,0.05)', '#5B6B84'],
    R32: ['rgba(10,27,51,0.04)', '#9AA7BC'],
    DNS: ['transparent',           '#9AA7BC'],
  };
  const [bg, color] = cfg[result] ?? ['transparent', '#5B6B84'];
  return (
    <span className="font-num text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: bg, color, border: `1px solid ${color}22` }}>
      {result}
    </span>
  );
}
