import { useState, useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import { PLAYERS, getPlayer } from '../data/players';
import { ROUNDS, isPlayerOut, getPlayerExit } from '../data/tournament';
import { getTier, TIER_META } from '../data/tiers';
import { tierCounts, squadShortfall, isSquadValid, isTierFull, TIER_MINIMUMS, SQUAD_SIZE, STARTING_BUDGET } from '../data/squadRules';
import PlayerAvatar from '../components/PlayerAvatar';
import PlayerTag from '../components/PlayerTag';
import PurchaseConfirmModal from '../components/PurchaseConfirmModal';
import PlayerPickerModal from '../components/PlayerPickerModal';
import { toast } from '../store/toastStore';
import { onActivate } from '../hooks';
import { TOURNAMENT, SURFACE } from '../data/tournamentConfig';
import type { RoundId, Player } from '../types';

type SortKey = 'ranking' | 'surface';

const TEAM_SIZE = SQUAD_SIZE;
// The tournament's own surface (e.g. hard for Montréal) — drives which win% the
// market emphasises (sort option, bold column, squad-row stat).
const SURF = TOURNAMENT.surface;
// Price is a strict function of ranking (priceFor), so a "$ Price" sort would be
// identical to "# Rank" — we offer Rank + the surface win% instead.
const SORT_LABEL: Record<SortKey, string> = { ranking: '# Rank', surface: `${SURFACE.label} %` };

export default function DraftPage() {
  const { myTeam, captain, viceCaptain, budget, phase, currentRoundIndex, removePlayer, setCaptain, setViceCaptain, finalizeDraft, openPlayer } = useGameStore();
  const [sort, setSort] = useState<SortKey>('ranking');
  const [search, setSearch] = useState('');
  const [confirm, setConfirm] = useState<Player | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const locked = phase !== 'draft'; // squad is locked after the draft — transfers happen on the Bracket page
  const revealed = ROUNDS.slice(0, currentRoundIndex).map(r => r.id) as RoundId[];
  const counts = tierCounts(myTeam);
  const valid = isSquadValid(myTeam);
  const shortfall = squadShortfall(myTeam);

  const sorted = useMemo(() => [...PLAYERS]
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sort === 'ranking') return a.ranking - b.ranking;
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

      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 lg:items-start">

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
              {(['ranking', 'surface'] as SortKey[]).map(s => (
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
                  <th className="text-center px-1 py-2 text-[11px] font-bold uppercase tracking-wide" rowSpan={2} style={{ color: 'var(--ink-3)', width: 34 }}>ATP</th>
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
                  const tier = getTier(player.ranking);
                  const tierFull = !isSelected && isTierFull(tier, myTeam); // quota met for this tier
                  const addable = !locked && !isSelected && !out && !full && canAfford && !tierFull;
                  const tierColor = TIER_META[tier].color;

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
                        opacity: out || tierFull ? 0.45 : 1, // shade players whose tier quota is met
                      }}
                      onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'rgba(10,27,51,0.02)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isSelected ? 'rgba(18,161,80,0.05)' : 'transparent'; }}
                    >
                      <td className="px-1 py-1.5 font-num text-xs text-center" style={{ color: tierColor, fontWeight: 700 }}>{player.ranking}</td>
                      <td className="px-2 py-1.5 w-full" style={{ maxWidth: 0 }}>
                        <div className="flex items-center gap-2 min-w-0">
                          <PlayerAvatar playerId={player.id} name={player.name} size="sm" onClick={e => { e.stopPropagation(); openPlayer(player.id); }} />
                          <div className="min-w-0">
                            <PlayerTag playerId={player.id} flag={player.flag} className="text-[9px] font-bold uppercase tracking-wide leading-tight truncate" style={{ color: 'var(--blue)' }} />
                            <div className="text-[13px] font-semibold leading-tight truncate flex items-center gap-1.5" style={{ color: 'var(--ink)' }}>
                              {player.name}
                              {out && <span className="text-[9px] font-bold px-1 py-0.5 rounded" style={{ background: 'rgba(229,71,43,0.12)', color: 'var(--ember)' }}>OUT {getPlayerExit(player.id)}</span>}
                            </div>
                            <div className="text-[10px] leading-tight truncate" style={{ color: 'var(--ink-3)' }}>{player.style}</div>
                            {/* Compact surface win% for small screens (the dedicated columns show from md up) */}
                            <div className="md:hidden mt-0.5 flex items-center gap-1.5 font-num text-[10px] leading-none whitespace-nowrap">
                              <span style={{ color: 'var(--green)', fontWeight: SURF === 'grass' ? 700 : 500 }}>G {player.surface.grass}</span>
                              <span style={{ color: 'var(--ink-3)' }}>·</span>
                              <span style={{ color: 'var(--blue)', fontWeight: SURF === 'hard' ? 700 : 500 }}>H {player.surface.hard}</span>
                              <span style={{ color: 'var(--ink-3)' }}>·</span>
                              <span style={{ color: 'var(--ember)', fontWeight: SURF === 'clay' ? 700 : 500 }}>C {player.surface.clay}</span>
                            </div>
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
                            {isSelected ? 'Remove' : out ? 'Out' : full ? 'Full' : tierFull ? 'Limit' : !canAfford ? 'Too $' : '+ Add'}
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

        {/* ── My Squad — comes FIRST: left sidebar on desktop, above the table on mobile ── */}
        <div className="w-full lg:w-72 shrink-0 order-first">
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

            {/* Tier requirement: exactly 2 Platinum, 3 Gold, 5 Silver of your 10. */}
            <div className="flex gap-2 mb-4">
              {TIER_MINIMUMS.map(({ tier, min }) => {
                const have = counts[tier];
                const ok = have === min;     // exact quota met
                const over = have > min;     // too many (legacy squads only — the Market now blocks this)
                const bg = ok ? 'rgba(18,161,80,0.08)' : over ? 'rgba(229,71,43,0.08)' : 'var(--raised)';
                const bd = ok ? 'rgba(18,161,80,0.28)' : over ? 'rgba(229,71,43,0.28)' : 'rgba(10,27,51,0.08)';
                const fg = ok ? 'var(--green)' : over ? 'var(--ember)' : 'var(--ink)';
                return (
                  <div key={tier} className="flex-1 rounded-lg px-2 py-1.5 text-center" style={{ background: bg, border: `1px solid ${bd}` }}>
                    <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: TIER_META[tier].color }}>{tier}</div>
                    <div className="font-num text-sm font-bold" style={{ color: fg }}>{have}/{min}{ok ? ' ✓' : over ? ' !' : ''}</div>
                  </div>
                );
              })}
            </div>

            <div className="space-y-1.5 mb-4">
              {myTeam.length === 0 && (
                <div className="text-center py-6 text-sm" style={{ color: 'var(--ink-3)' }}>Pick {TEAM_SIZE} players</div>
              )}
              {[...myTeam].sort((a, b) => getPlayer(a).ranking - getPlayer(b).ranking).map(id => {
                const p = getPlayer(id);
                const isCap = captain === id;
                const isVice = viceCaptain === id;
                const rowBg = isCap ? 'rgba(217,154,0,0.07)' : isVice ? 'rgba(14,111,196,0.06)' : 'rgba(10,27,51,0.03)';
                const rowBorder = isCap ? 'rgba(217,154,0,0.2)' : isVice ? 'rgba(14,111,196,0.2)' : 'rgba(10,27,51,0.06)';
                return (
                  <div key={id} className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: rowBg, border: `1px solid ${rowBorder}` }}>
                    <PlayerAvatar playerId={id} name={p.name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <PlayerTag playerId={id} flag={p.flag} className="text-[8px] font-bold uppercase tracking-wide leading-tight truncate" style={{ color: 'var(--blue)' }} />
                      <div className="text-xs font-medium truncate" style={{ color: 'var(--ink)' }}>{p.name}</div>
                      <div className="font-num text-[10px]" style={{ color: 'var(--ink-2)' }}>${p.price}M · 🎾{p.surface[SURF]}% {SURFACE.label}</div>
                    </div>
                    {/* Captain / Vice-captain toggles */}
                    {!locked && (
                      <>
                        <button onClick={() => setCaptain(id)} title="Captain (×2)" className="text-[11px] font-extrabold w-6 h-6 rounded-lg shrink-0 flex items-center justify-center transition-all" style={{ background: isCap ? 'var(--gold)' : 'rgba(10,27,51,0.05)', color: isCap ? '#fff' : 'var(--ink-3)', border: `1px solid ${isCap ? 'var(--gold)' : 'rgba(10,27,51,0.08)'}` }}>C</button>
                        <button onClick={() => setViceCaptain(id)} title="Vice-captain (×1.5)" className="text-[11px] font-extrabold w-6 h-6 rounded-lg shrink-0 flex items-center justify-center transition-all" style={{ background: isVice ? 'var(--blue)' : 'rgba(10,27,51,0.05)', color: isVice ? '#fff' : 'var(--ink-3)', border: `1px solid ${isVice ? 'var(--blue)' : 'rgba(10,27,51,0.08)'}` }}>V</button>
                        <button onClick={() => removePlayer(id)} title="Remove" className="text-xs w-6 h-6 rounded-lg shrink-0 flex items-center justify-center" style={{ background: 'rgba(10,27,51,0.04)', border: '1px solid rgba(10,27,51,0.06)', color: 'var(--ink-2)' }}>✕</button>
                      </>
                    )}
                    {locked && isCap && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: 'var(--gold)', color: '#fff' }}>C</span>}
                    {locked && isVice && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: 'var(--blue)', color: '#fff' }}>V</span>}
                  </div>
                );
              })}
              {!locked && Array.from({ length: TEAM_SIZE - myTeam.length }).map((_, i) => (
                <button key={`e${i}`} onClick={() => setPickerOpen(true)} className="w-full px-3 py-2 rounded-xl text-xs text-center transition-colors hover:bg-black/[0.03] cursor-pointer" style={{ border: '1px dashed rgba(10,27,51,0.14)', color: 'var(--ink-3)' }}>+ Add a player</button>
              ))}
            </div>

            {!locked && myTeam.length > 0 && (!captain || !viceCaptain) && (
              <p className="text-[11px] mb-3" style={{ color: 'var(--ink-2)' }}>
                Tap <b style={{ color: 'var(--gold)' }}>C</b> to set your captain (×2) and <b style={{ color: 'var(--blue)' }}>V</b> your vice (×1.5).
              </p>
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
      <PlayerPickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} />
    </div>
  );
}
