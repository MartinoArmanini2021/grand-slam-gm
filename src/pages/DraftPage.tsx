import { useState, useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import { PLAYERS, getPlayer } from '../data/players';
import { ROUNDS, isPlayerOut, getPlayerExit } from '../data/tournament';
import { getTier, TIER_META } from '../data/tiers';
import { tierCounts, squadShortfall, isSquadValid, TIER_MINIMUMS, SQUAD_SIZE, STARTING_BUDGET } from '../data/squadRules';
import PlayerAvatar from '../components/PlayerAvatar';
import PlayerTag from '../components/PlayerTag';
import PurchaseConfirmModal from '../components/PurchaseConfirmModal';
import { toast } from '../store/toastStore';
import { onActivate } from '../hooks';
import { TOURNAMENT, SURFACE } from '../data/tournamentConfig';
import type { RoundId, Player } from '../types';

type SortKey = 'ranking' | 'price' | 'surface';

const TEAM_SIZE = SQUAD_SIZE;
// The tournament's own surface (e.g. hard for Montréal) — drives which win% the
// market emphasises (sort option, bold column, squad-row stat).
const SURF = TOURNAMENT.surface;
const SORT_LABEL: Record<SortKey, string> = { ranking: '# Rank', price: '$ Price', surface: `${SURFACE.label} %` };

export default function DraftPage() {
  const { myTeam, captain, budget, phase, currentRoundIndex, removePlayer, setCaptain, finalizeDraft, openPlayer } = useGameStore();
  const [sort, setSort] = useState<SortKey>('ranking');
  const [search, setSearch] = useState('');
  const [confirm, setConfirm] = useState<Player | null>(null);

  const locked = phase !== 'draft'; // squad is locked after the draft — transfers happen on the Bracket page
  const revealed = ROUNDS.slice(0, currentRoundIndex).map(r => r.id) as RoundId[];
  const counts = tierCounts(myTeam);
  const valid = isSquadValid(myTeam);
  const shortfall = squadShortfall(myTeam);

  const sorted = useMemo(() => [...PLAYERS]
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sort === 'ranking') return a.ranking - b.ranking;
      if (sort === 'price') return b.price - a.price;
      if (sort === 'surface') return b.surface[SURF] - a.surface[SURF];
      return 0;
    }), [sort, search]);

  const th = 'text-left px-2 py-2 text-[11px] font-bold uppercase tracking-wide';

  const roundLabel = currentRoundIndex < ROUNDS.length ? ROUNDS[currentRoundIndex].label : 'Tournament complete';

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-3 pt-6 pb-6">
      {/* Status header */}
      <div className="mb-4">
        <div className="flex items-baseline gap-x-3 gap-y-1 flex-wrap">
          <h1 className="text-lg font-extrabold" style={{ color: 'var(--ink)' }}>Transfer Market</h1>
          <span className="text-xs font-bold uppercase tracking-[0.15em]" style={{ color: phase === 'draft' ? 'var(--green)' : 'var(--ember)' }}>
            {phase === 'draft' ? 'Draft open' : roundLabel}
          </span>
        </div>
        <p className="text-xs mt-0.5" style={{ color: 'var(--ink-2)' }}>
          {phase === 'draft'
            ? `Build your squad — $${budget.toFixed(1)}M to spend · ${myTeam.length}/${TEAM_SIZE} picked`
            : 'Squad locked for the tournament — swap eliminated players via transfers on the Bracket page.'}
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 items-start">

        {/* ── Left: Player table ── */}
        <div className="flex-1 min-w-0">
          {locked && (
            <div className="rounded-2xl px-4 py-2.5 mb-3 flex items-center gap-2 text-sm" style={{ background: 'rgba(10,27,51,0.03)', border: '1px solid rgba(10,27,51,0.1)', color: 'var(--ink-2)' }}>
              <span>🔒</span>
              <span>Squad locked for the tournament — make changes via <b style={{ color: 'var(--blue)' }}>transfers on the Bracket page</b>.</span>
            </div>
          )}
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <input
              type="text"
              placeholder="Search player…"
              aria-label="Search players"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="text-sm outline-none px-3 py-2 rounded-xl w-44"
              style={{ background: '#FFFFFF', border: '1px solid rgba(10,27,51,0.09)', color: 'var(--ink)' }}
            />
            <div className="flex rounded-xl overflow-hidden ml-auto" style={{ border: '1px solid rgba(10,27,51,0.07)' }}>
              {(['ranking', 'price', 'surface'] as SortKey[]).map(s => (
                <button
                  key={s}
                  onClick={() => setSort(s)}
                  className="px-3 py-2 text-xs font-semibold transition-colors"
                  style={{ background: sort === s ? 'rgba(10,27,51,0.08)' : 'transparent', color: sort === s ? 'var(--ink)' : 'var(--ink-2)' }}
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
                <tr style={{ background: 'var(--raised)' }}>
                  <th className={th} rowSpan={2} style={{ color: 'var(--ink-3)', textAlign: 'center', width: 54 }}><div style={{ lineHeight: 1.05 }}>ATP<br />Ranking</div></th>
                  <th className={th} rowSpan={2} style={{ color: 'var(--ink-2)' }}>Player</th>
                  <th className={`${th} hidden sm:table-cell`} rowSpan={2} style={{ color: 'var(--ink-2)', textAlign: 'center' }}>Age</th>
                  <th className={`${th} hidden md:table-cell`} colSpan={3} style={{ color: 'var(--ink-2)', textAlign: 'center', borderBottom: '1px solid rgba(10,27,51,0.08)' }}>Win&nbsp;%&nbsp;(YTD)</th>
                  <th className={`${th} hidden md:table-cell`} rowSpan={2} style={{ color: 'var(--ink-2)', textAlign: 'center' }}><div style={{ lineHeight: 1.05 }}>2026<br />W–L</div></th>
                  <th className={`${th} hidden lg:table-cell`} rowSpan={2} style={{ color: 'var(--gold)', textAlign: 'center' }}><div style={{ lineHeight: 1.05 }}>2026<br />Titles</div></th>
                  <th className={th} rowSpan={2} style={{ color: 'var(--blue)', textAlign: 'right' }}>Price</th>
                  <th className={th} rowSpan={2} style={{ width: 96 }}></th>
                </tr>
                <tr style={{ background: 'var(--raised)', borderBottom: '1px solid rgba(10,27,51,0.1)' }}>
                  <th className={`${th} hidden md:table-cell`} style={{ color: 'var(--green)', textAlign: 'center' }}>Grass</th>
                  <th className={`${th} hidden md:table-cell`} style={{ color: 'var(--blue)', textAlign: 'center' }}>Hard</th>
                  <th className={`${th} hidden md:table-cell`} style={{ color: 'var(--ember)', textAlign: 'center' }}>Clay</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(player => {
                  const isSelected = myTeam.includes(player.id);
                  const out = isPlayerOut(player.id, revealed);
                  const full = myTeam.length >= TEAM_SIZE;
                  const canAfford = budget >= player.price;
                  const addable = !locked && !isSelected && !out && !full && canAfford;
                  const tierColor = TIER_META[getTier(player.ranking)].color;

                  return (
                    <tr
                      key={player.id}
                      onClick={() => openPlayer(player.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={onActivate(() => openPlayer(player.id))}
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
                            <PlayerTag playerId={player.id} flag={player.flag} className="text-[9px] font-bold uppercase tracking-wide leading-tight truncate" style={{ color: 'var(--blue)' }} />
                            <div className="text-[13px] font-semibold leading-tight truncate flex items-center gap-1.5" style={{ color: 'var(--ink)' }}>
                              {player.name}
                              {out && <span className="text-[9px] font-bold px-1 py-0.5 rounded" style={{ background: 'rgba(229,71,43,0.12)', color: 'var(--ember)' }}>OUT {getPlayerExit(player.id)}</span>}
                            </div>
                            <div className="text-[10px] leading-tight truncate" style={{ color: 'var(--ink-3)' }}>{player.style}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-center font-num text-xs hidden sm:table-cell" style={{ color: 'var(--ink-2)' }}>{player.age}</td>
                      <td className="px-2 py-1.5 text-center font-num text-xs hidden md:table-cell" style={{ color: SURF === 'grass' ? 'var(--green)' : 'var(--ink-3)', fontWeight: SURF === 'grass' ? 700 : 400 }}>{player.surface.grass}%</td>
                      <td className="px-2 py-1.5 text-center font-num text-xs hidden md:table-cell" style={{ color: SURF === 'hard' ? 'var(--blue)' : 'var(--ink-3)', fontWeight: SURF === 'hard' ? 700 : 400 }}>{player.surface.hard}%</td>
                      <td className="px-2 py-1.5 text-center font-num text-xs hidden md:table-cell" style={{ color: SURF === 'clay' ? 'var(--ember)' : 'var(--ink-3)', fontWeight: SURF === 'clay' ? 700 : 400 }}>{player.surface.clay}%</td>
                      <td className="px-2 py-1.5 text-center font-num text-xs hidden md:table-cell" style={{ color: 'var(--ink-2)' }}>{player.ytd.wins}–{player.ytd.losses}</td>
                      <td className="px-2 py-1.5 text-center font-num text-xs hidden lg:table-cell" style={{ color: player.ytd.titles > 0 ? 'var(--gold)' : 'var(--ink-3)' }}>{player.ytd.titles}</td>
                      <td className="px-2 py-1.5 text-right font-num text-sm font-bold" style={{ color: 'var(--blue)' }}>${player.price}M</td>
                      <td className="px-2 py-1.5 text-right">
                        {locked ? (
                          isSelected
                            ? <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg whitespace-nowrap" style={{ background: 'rgba(18,161,80,0.1)', color: 'var(--green)' }}>In squad</span>
                            : <span className="text-[11px]" style={{ color: '#C7CFDA' }}>🔒</span>
                        ) : (
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
                              color: isSelected ? 'var(--ember)' : addable ? 'var(--green)' : 'var(--ink-3)',
                              cursor: (!isSelected && !addable) ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {isSelected ? 'Remove' : out ? 'Out' : full ? 'Full' : !canAfford ? 'Too $' : '+ Add'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── My Squad — right sidebar on desktop, stacked below the table on mobile ── */}
        <div className="w-full lg:w-72 shrink-0">
          <div className="lg:sticky lg:top-20 rounded-2xl p-5" style={{ background: '#FFFFFF', border: '1px solid rgba(10,27,51,0.09)' }}>
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-bold text-sm" style={{ color: 'var(--ink)' }}>My Squad</h2>
              <span className="font-num text-xs" style={{ color: 'var(--ink-2)' }}>{myTeam.length} / {TEAM_SIZE}</span>
            </div>

            <div className="mb-4 pt-3">
              <div className="flex justify-between text-xs mb-1.5" style={{ color: 'var(--ink-2)' }}>
                <span>Budget</span>
                <span className="font-num font-semibold" style={{ color: 'var(--blue)' }}>${budget.toFixed(1)}M</span>
              </div>
              <div className="h-1 rounded-full" style={{ background: 'rgba(10,27,51,0.07)' }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${(budget / STARTING_BUDGET) * 100}%`, background: 'var(--blue)' }} />
              </div>
            </div>

            {/* Tier requirement: ≥4 Silver, ≥2 Gold of your 8. */}
            <div className="flex gap-2 mb-4">
              {TIER_MINIMUMS.map(({ tier, min }) => {
                const have = counts[tier];
                const ok = have >= min;
                return (
                  <div key={tier} className="flex-1 rounded-lg px-2 py-1.5 text-center" style={{ background: ok ? 'rgba(18,161,80,0.08)' : 'var(--raised)', border: `1px solid ${ok ? 'rgba(18,161,80,0.28)' : 'rgba(10,27,51,0.08)'}` }}>
                    <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: TIER_META[tier].color }}>{tier}</div>
                    <div className="font-num text-sm font-bold" style={{ color: ok ? 'var(--green)' : 'var(--ink)' }}>{have}/{min}{ok ? ' ✓' : ''}</div>
                  </div>
                );
              })}
            </div>

            <div className="space-y-1.5 mb-4">
              {myTeam.length === 0 && (
                <div className="text-center py-6 text-sm" style={{ color: 'var(--ink-3)' }}>Pick {TEAM_SIZE} players</div>
              )}
              {myTeam.map(id => {
                const p = getPlayer(id);
                const isCap = captain === id;
                return (
                  <div key={id} className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: isCap ? 'rgba(217,154,0,0.07)' : 'rgba(10,27,51,0.03)', border: `1px solid ${isCap ? 'rgba(217,154,0,0.2)' : 'rgba(10,27,51,0.06)'}` }}>
                    <PlayerAvatar playerId={id} name={p.name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <PlayerTag playerId={id} flag={p.flag} className="text-[8px] font-bold uppercase tracking-wide leading-tight truncate" style={{ color: 'var(--blue)' }} />
                      <div className="text-xs font-medium truncate" style={{ color: 'var(--ink)' }}>{p.name}</div>
                      <div className="font-num text-[10px]" style={{ color: 'var(--ink-2)' }}>${p.price}M · 🎾{p.surface[SURF]}% {SURFACE.label}</div>
                    </div>
                    {isCap && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: 'rgba(217,154,0,0.15)', color: 'var(--gold)', border: '1px solid rgba(217,154,0,0.25)' }}>C</span>}
                    {!locked && <button onClick={() => setCaptain(id)} className="text-xs px-1.5 py-1 rounded-lg transition-all shrink-0" title="Set as captain" style={{ background: isCap ? 'rgba(217,154,0,0.15)' : 'rgba(10,27,51,0.05)', border: `1px solid ${isCap ? 'rgba(217,154,0,0.25)' : 'rgba(10,27,51,0.07)'}`, color: isCap ? 'var(--gold)' : 'var(--ink-2)' }}>⭐</button>}
                    {!locked && <button onClick={() => removePlayer(id)} className="text-xs px-1.5 py-1 rounded-lg transition-all shrink-0" style={{ background: 'rgba(10,27,51,0.04)', border: '1px solid rgba(10,27,51,0.06)', color: 'var(--ink-2)' }}>✕</button>}
                  </div>
                );
              })}
              {!locked && Array.from({ length: TEAM_SIZE - myTeam.length }).map((_, i) => (
                <div key={`e${i}`} className="px-3 py-2 rounded-xl text-xs text-center" style={{ border: '1px dashed rgba(10,27,51,0.06)', color: 'var(--ink-3)' }}>Empty slot</div>
              ))}
            </div>

            {!locked && myTeam.length > 0 && !captain && (
              <p className="text-xs mb-3" style={{ color: 'var(--gold)' }}>⭐ Tap ⭐ to pick a captain</p>
            )}

            {locked ? (
              <div className="w-full py-2.5 rounded-xl font-bold text-sm text-center" style={{ background: 'rgba(18,161,80,0.1)', color: 'var(--green)' }}>Squad locked ✓</div>
            ) : (
              <button
                onClick={() => { finalizeDraft(); toast('Squad locked in — good luck! 🎾', 'good'); }}
                disabled={!valid}
                className="w-full py-2.5 rounded-xl font-bold text-sm transition-all"
                style={{ background: valid ? 'var(--blue)' : 'rgba(10,27,51,0.05)', color: valid ? '#fff' : 'var(--ink-3)', cursor: valid ? 'pointer' : 'not-allowed' }}
              >
                {valid ? 'Lock Squad →'
                  : myTeam.length < TEAM_SIZE ? `Pick ${TEAM_SIZE - myTeam.length} more`
                  : `Need ${shortfall.map(s => `${s.missing} ${s.tier}`).join(', ')}`}
              </button>
            )}
            {!locked && !valid && myTeam.length > 0 && (
              <p className="text-[11px] text-center mt-2" style={{ color: 'var(--ink-3)' }}>
                A valid squad is {TEAM_SIZE} players with at least {TIER_MINIMUMS.map(t => `${t.min} ${t.tier}`).join(' & ')}.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Purchase confirmation */}
      <PurchaseConfirmModal player={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
