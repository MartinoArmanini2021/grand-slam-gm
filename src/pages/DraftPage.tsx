import { useState, useMemo, useRef } from 'react';
import { useGameStore } from '../store/gameStore';
import { useLiveStore } from '../store/liveStore';
import { PLAYERS, getPlayer } from '../data/players';
import { ROUNDS, isPlayerOut, getPlayerExit, tournamentStarted, isEliminated, liveBudget, playerRefund, cashedInTotal, transferWindowOpen, roundHasResult } from '../data/tournament';
import { getTier, TIER_META, type Tier } from '../data/tiers';
import { tierCounts, squadShortfall, isSquadValid, isTierFull, TIER_MINIMUMS, SQUAD_SIZE, STARTING_BUDGET } from '../data/squadRules';
import PlayerAvatar from '../components/PlayerAvatar';
import PlayerVideoButton from '../components/PlayerVideoButton';
import PlayerTag from '../components/PlayerTag';
import PurchaseConfirmModal from '../components/PurchaseConfirmModal';
import MarketBuyModal from '../components/MarketBuyModal';
import TransferHelpModal from '../components/TransferHelpModal';
import PlayerPickerModal from '../components/PlayerPickerModal';
import SquadLockedModal from '../components/SquadLockedModal';
import Countdown from '../components/Countdown';
import { onActivate } from '../hooks';
import { toast } from '../store/toastStore';
import { TOURNAMENT, SURFACE } from '../data/tournamentConfig';
import type { RoundId, Player } from '../types';

type SortKey = 'ranking' | 'surface' | 'price';

const TEAM_SIZE = SQUAD_SIZE;
// The tournament's own surface (e.g. hard for Montréal) — drives which win% the
// market emphasises (sort option, bold column, squad-row stat).
const SURF = TOURNAMENT.surface;
const SORT_LABEL: Record<SortKey, string> = { ranking: '# Rank', surface: `${SURFACE.label} %`, price: '$ Price' };

export default function DraftPage() {
  const { myTeam, captain, viceCaptain, budget, phase, currentRoundIndex, initialSquad, transfers, cashedIn, removePlayer, cashInPlayer, buyPlayer, undoBuy, setCaptain, setViceCaptain, finalizeDraft, openPlayer, setActiveTab } = useGameStore();
  const [sort, setSort] = useState<SortKey>('ranking');
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<Tier | null>(null);
  const [confirm, setConfirm] = useState<Player | null>(null);
  const [buyConfirm, setBuyConfirm] = useState<Player | null>(null); // LIVE market buy → confirm → buy
  const [showTransferHelp, setShowTransferHelp] = useState(false);   // "How transfers work" help card
  // Optional EARLY finalize (session only). Buys already commit on purchase and auto-lock when their
  // round starts; this just hides the Undo controls for a manager who's sure. Not persisted.
  const [finalized, setFinalized] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showLocked, setShowLocked] = useState(false);
  // "Watch the players" hint — shown atop the list until the user dismisses it (persisted),
  // so newcomers who don't know the field learn about the ▶ video links.
  const [videoHint, setVideoHint] = useState(() => { try { return localStorage.getItem('gsgm-video-hint') !== 'off'; } catch { return true; } });
  const dismissVideoHint = () => { setVideoHint(false); try { localStorage.setItem('gsgm-video-hint', 'off'); } catch { /* ignore */ } };

  // Live tournament state — subscribe to the draw + results so budgets/eliminations re-render
  // the instant a result lands (liveBudget/isEliminated read the live store non-reactively).
  const draw = useLiveStore(s => s.draw);
  const results = useLiveStore(s => s.results);

  const locked = phase !== 'draft';       // squad is locked after the draft…
  const live = locked;                     // …and once locked, the Market IS the transfer desk
  const windowOpen = transferWindowOpen(); // results-derived: actually closes for the Final
  const draftClosed = tournamentStarted(); // P6: no locking once the tournament has a result
  const revealed = ROUNDS.slice(0, currentRoundIndex).map(r => r.id) as RoundId[];
  const counts = tierCounts(myTeam);
  const valid = isSquadValid(myTeam);
  const shortfall = squadShortfall(myTeam);

  // LIVE money is committed + immediate: cashing in claims the refund and buying spends it the
  // moment you tap — no pending/preview layer, the squad you see IS your saved squad. Fewer than 10
  // players and any tier mix are fine; nothing here flags a squad as "wrong".
  const liveBud = useMemo(() => liveBudget(initialSquad, transfers, myTeam, cashedIn),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [initialSquad, transfers, myTeam, cashedIn, draw, results]);
  const displayBudget = live ? liveBud : budget;
  // Open slots = players cashed in but not yet backfilled by a buy → you can buy that many.
  const openCount = cashedIn.filter(c => !transfers.some(t => t.out === c)).length;
  const canBuy = live && windowOpen && openCount > 0;
  // Eliminated players still in your active squad → ready to Cash In.
  const cashable = useMemo(() => (live ? myTeam.filter(id => isEliminated(id)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [live, myTeam, draw, results]);
  const cashedTotal = useMemo(() => cashedInTotal(cashedIn),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cashedIn, draw, results]);

  // A buy is UNLOCKED (undoable) while the round it first scores in hasn't started; once that round
  // has a result it's locked in. `finalized` (Lock Squad) hides Undo early, by the manager's choice.
  const isUndoableBuy = (id: string): boolean => {
    if (finalized) return false;
    const t = transfers.find(x => x.in === id);
    if (!t) return false;
    const scoresFrom = ROUNDS[ROUNDS.findIndex(r => r.id === t.round) + 1]?.id;
    return !!scoresFrom && !roundHasResult(scoresFrom) && !isEliminated(id);
  };
  const unlockedBuys = useMemo(() => (live ? transfers.filter(t => isUndoableBuy(t.in)).map(t => t.in) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [live, transfers, finalized, draw, results]);

  // A small localized "+$X" that floats up from the tapped Cash In button, for tactile feedback.
  const fxKey = useRef(0);
  const [cashFx, setCashFx] = useState<{ x: number; y: number; amount: number; key: number } | null>(null);
  // Immediate actions: cash in claims the refund now; buy commits now (undoable until its round).
  const doCashIn = (id: string, e?: React.MouseEvent) => {
    const amt = playerRefund(id);
    if (e) setCashFx({ x: e.clientX, y: e.clientY, amount: amt, key: ++fxKey.current });
    cashInPlayer(id);
    toast(`Cashed in ${getPlayer(id).name} · +$${amt}M`, 'good');
  };
  const doBuy = (id: string) => { buyPlayer(id); setFinalized(false); toast(`Signed ${getPlayer(id).name} — you can undo until the round starts`, 'good'); };

  const sorted = useMemo(() => [...PLAYERS]
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))
    .filter(p => !tierFilter || getTier(p.ranking) === tierFilter)
    .sort((a, b) => {
      if (sort === 'ranking') return a.ranking - b.ranking;
      if (sort === 'surface') return b.surface[SURF] - a.surface[SURF];
      if (sort === 'price') return b.price - a.price || a.ranking - b.ranking; // dearest first; rank breaks ties
      return 0;
    }), [sort, search, tierFilter]);

  // Once live, hide knocked-out players from the market list — it's just the field still in
  // contention, so it's easy to see who you can actually buy. (They stay in My Squad with Cash In.)
  const visible = useMemo(() => (live ? sorted.filter(p => !isEliminated(p.id)) : sorted),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sorted, live, draw, results]);

  const th = 'text-left px-2 py-2 text-[11px] font-bold uppercase tracking-wide';

  const roundLabel = currentRoundIndex < ROUNDS.length ? ROUNDS[currentRoundIndex].label : 'Tournament complete';

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-3 pt-6 pb-6">
      {/* Status header */}
      <div className="mb-4">
        <div className="flex items-baseline gap-x-3 gap-y-1 flex-wrap">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight" style={{ color: 'var(--ink)' }}>Transfer Market</h1>
          <span className="text-xs font-bold uppercase tracking-[0.15em]" style={{ color: phase === 'draft' ? 'var(--green)' : 'var(--ember)' }}>
            {phase === 'draft' ? 'Draft open' : roundLabel}
          </span>
        </div>
        <p className="text-xs mt-0.5" style={{ color: 'var(--ink-2)' }}>
          {phase === 'draft'
            ? `Build your squad — $${budget.toFixed(1)}M to spend · ${myTeam.length}/${TEAM_SIZE} picked`
            : !windowOpen
              ? 'Transfer window closed — your squad is locked for the final.'
              : cashable.length > 0
                ? `${cashable.length} eliminated player${cashable.length === 1 ? '' : 's'} to Cash In — claim the money, then buy any replacement you like.`
                : openCount > 0
                  ? `$${liveBud.toFixed(1)}M to spend · ${openCount} open slot${openCount === 1 ? '' : 's'} — buy a replacement of any tier below.`
                  : unlockedBuys.length > 0
                    ? `${unlockedBuys.length} new signing${unlockedBuys.length === 1 ? '' : 's'} — you can still undo until the round starts, or Lock Squad to confirm now.`
                    : `$${liveBud.toFixed(1)}M available — Cash In an eliminated player to free up money.`}
        </p>
        {live && (
          <button onClick={() => setShowTransferHelp(true)} className="text-xs font-bold mt-1 underline underline-offset-2" style={{ color: 'var(--ember)' }}>
            How transfers work
          </button>
        )}
        {phase === 'draft' && (
          <div className="max-w-xl">
            <Countdown target={TOURNAMENT.schedule?.[TOURNAMENT.rounds[0]]}
              title="Draft closes when the first round starts" note="Lock your squad before then." />
          </div>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 lg:items-start">

        {/* ── Left: Player table ── */}
        <div className="flex-1 min-w-0">
          {/* Live status: Cash In eliminated players → spend the money on any replacement */}
          {live && !windowOpen && (
            <div className="rounded-2xl px-4 py-2.5 mb-3 flex items-center gap-2 text-sm" style={{ background: 'rgba(10,27,51,0.03)', border: '1px solid rgba(10,27,51,0.1)', color: 'var(--ink-2)' }}>
              <span>🔒</span>
              <span>Transfer window closed — no changes after the semi-finals. Your squad is locked for the final.</span>
            </div>
          )}
          {live && windowOpen && cashable.length > 0 && (
            <div className="rounded-2xl px-4 py-2.5 mb-3 flex items-center gap-2 text-sm" style={{ background: 'rgba(229,71,43,0.06)', border: '1px solid rgba(229,71,43,0.22)', color: 'var(--ink)' }}>
              <span>💸</span>
              <span><b>{cashable.length}</b> of your players {cashable.length === 1 ? 'is' : 'are'} out. Tap <b style={{ color: 'var(--ember)' }}>Cash In</b> next to {cashable.length === 1 ? 'it' : 'them'} in <b>My Squad</b> to claim the refund — then buy any replacement below.</span>
            </div>
          )}
          {live && windowOpen && cashable.length === 0 && openCount > 0 && (
            <div className="rounded-2xl px-4 py-2.5 mb-3 flex items-center gap-2 text-sm" style={{ background: 'rgba(217,154,0,0.07)', border: '1px solid rgba(217,154,0,0.3)', color: 'var(--ink)' }}>
              <span>🛒</span>
              <span>You have <b>{openCount}</b> open slot{openCount === 1 ? '' : 's'} and <b className="font-num" style={{ color: 'var(--blue)' }}>${liveBud.toFixed(1)}M</b> to spend. Tap <b style={{ color: 'var(--green)' }}>+ Buy</b> on any still-alive player — any tier.</span>
            </div>
          )}
          {live && windowOpen && cashable.length === 0 && openCount === 0 && (
            <div className="rounded-2xl px-4 py-2.5 mb-3 flex items-center gap-2 text-sm" style={{ background: 'rgba(18,161,80,0.06)', border: '1px solid rgba(18,161,80,0.2)', color: 'var(--ink-2)' }}>
              <span>✅</span>
              <span>All your players are still in the draw — nothing to cash in yet.</span>
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
              className="text-sm px-3 py-2 rounded-xl w-44"
              style={{ background: '#FFFFFF', border: '1px solid rgba(10,27,51,0.09)', color: 'var(--ink)' }}
            />
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-[10px] font-bold uppercase tracking-wide shrink-0" style={{ color: 'var(--ink-3)' }}>Sort by</span>
              <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid rgba(10,27,51,0.07)' }}>
                {(['ranking', 'surface', 'price'] as SortKey[]).map(s => (
                  <button
                    key={s}
                    onClick={() => setSort(s)}
                    className="px-3 py-2 min-h-[40px] text-xs font-semibold transition-colors"
                    style={{ background: sort === s ? 'rgba(10,27,51,0.08)' : 'transparent', color: sort === s ? 'var(--ink)' : 'var(--ink-2)' }}
                  >
                    {SORT_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Tier filter — the squad is an exact 2 Platinum · 3 Gold · 5 Silver quota, so the
              tier IS the puzzle. These chips both filter the market and show your progress;
              a tier you still need pulses so you know where to look. */}
          {!locked && (
            <div className="flex items-center gap-2 mb-3 overflow-x-auto no-scrollbar">
              <span className="text-[10px] font-bold uppercase tracking-wide shrink-0" style={{ color: 'var(--ink-3)' }}>Filter</span>
              <button
                onClick={() => setTierFilter(null)}
                className="shrink-0 px-3 min-h-[38px] rounded-xl text-xs font-bold transition-colors"
                style={{ background: tierFilter === null ? 'var(--ink)' : '#FFFFFF', color: tierFilter === null ? '#fff' : 'var(--ink-2)', border: '1px solid rgba(10,27,51,0.1)' }}
              >All</button>
              {TIER_MINIMUMS.map(({ tier, min }) => {
                const have = counts[tier];
                const need = have < min;
                const active = tierFilter === tier;
                const color = TIER_META[tier].color;
                return (
                  <button
                    key={tier}
                    onClick={() => setTierFilter(active ? null : tier)}
                    className="shrink-0 flex items-center gap-1.5 px-3 min-h-[38px] rounded-xl text-xs font-bold transition-all"
                    style={{
                      background: active ? color : need ? `${color}14` : '#FFFFFF',
                      color: active ? '#fff' : color,
                      border: `1px solid ${active ? color : `${color}44`}`,
                      boxShadow: need && !active ? `0 0 0 2px ${color}22` : 'none',
                    }}
                  >
                    <span>{tier}</span>
                    <span className="font-num" style={{ opacity: 0.9 }}>{have}/{min}{have === min ? ' ✓' : ''}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* "Don't know the players?" — nudge new managers to the ▶ video links */}
          {videoHint && (
            <div className="rounded-2xl px-3 py-2.5 mb-3 flex items-center gap-3" style={{ background: 'rgba(255,0,0,0.05)', border: '1px solid rgba(255,0,0,0.18)' }}>
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full shrink-0" style={{ background: '#FF0000', color: '#fff' }} aria-hidden="true">
                <svg width={13} height={13} viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              </span>
              <p className="flex-1 min-w-0 text-[13px] leading-snug" style={{ color: 'var(--ink)' }}>
                <b>Don’t know the players?</b> Tap the red <span style={{ color: '#FF0000', fontWeight: 700 }}>▶</span> next to any name to watch them in action on YouTube.
              </p>
              <button onClick={dismissVideoHint} aria-label="Dismiss tip" className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-colors hover:bg-black/[0.05]" style={{ color: 'var(--ink-3)' }}>✕</button>
            </div>
          )}

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
                {visible.map(player => {
                  const isSelected = myTeam.includes(player.id);
                  const ownedLive = myTeam.includes(player.id); // owned in the PREVIEW (committed + staged buy)
                  // Live: eliminated = knocked out per the RESULTS (isEliminated). Draft: per revealed rounds.
                  const out = live ? isEliminated(player.id) : isPlayerOut(player.id, revealed);
                  const full = myTeam.length >= TEAM_SIZE;
                  const canAfford = budget >= player.price;
                  const tier = getTier(player.ranking);
                  const tierFull = !isSelected && isTierFull(tier, myTeam); // quota met for this tier
                  const addable = !locked && !isSelected && !out && !full && canAfford && !tierFull;
                  // Live: buyable into an open (cashed-in) slot — any tier, just still-alive, not
                  // already owned/staged, and affordable off the PREVIEW budget.
                  const buyable = live && canBuy && !ownedLive && !out && liveBud >= player.price;
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
                          <PlayerVideoButton name={player.name} />
                          <div className="min-w-0">
                            <PlayerTag playerId={player.id} flag={player.flag} className="text-[9px] font-bold uppercase tracking-wide leading-tight truncate" style={{ color: 'var(--blue)' }} />
                            <div className="text-[13px] font-semibold leading-tight truncate flex items-center gap-1.5" style={{ color: 'var(--ink)' }}>
                              {player.name}
                              {out && <span className="text-[9px] font-bold px-1 py-0.5 rounded" style={{ background: 'rgba(229,71,43,0.12)', color: 'var(--ember)' }}>OUT {getPlayerExit(player.id)}</span>}
                            </div>
                            <div className="text-[10px] leading-tight truncate" style={{ color: 'var(--ink-3)' }}>
                              <span style={{ color: tierColor, fontWeight: 700 }}>{tier}</span> · {player.style}
                            </div>
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
                        {!live ? (
                          /* ── DRAFT: add / remove ── */
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              if (isSelected) { removePlayer(player.id); return; }
                              if (addable) setConfirm(player);
                            }}
                            disabled={!isSelected && !addable}
                            title={isSelected ? 'Remove from squad' : out ? 'Eliminated' : full ? 'Squad already full (10/10)' : tierFull ? `You already have your ${tier} players` : !canAfford ? `Costs $${player.price}M — over your remaining budget` : 'Add to squad'}
                            className="text-[11px] font-bold px-3 min-h-[36px] rounded-lg transition-transform active:scale-95 whitespace-nowrap"
                            style={{
                              background: isSelected ? 'rgba(229,71,43,0.12)' : addable ? 'var(--green)' : 'rgba(10,27,51,0.04)',
                              border: `1px solid ${isSelected ? 'rgba(229,71,43,0.25)' : addable ? 'var(--green)' : 'rgba(10,27,51,0.06)'}`,
                              color: isSelected ? 'var(--ember)' : addable ? '#fff' : 'var(--ink-3)',
                              cursor: (!isSelected && !addable) ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {isSelected ? 'Remove' : out ? 'Out' : full ? 'Full' : tierFull ? `${tier} full` : !canAfford ? 'Over $' : '+ Add'}
                          </button>
                        ) : ownedLive ? (
                          /* in your squad — a fresh (still-undoable) signing shows NEW, else In squad */
                          isUndoableBuy(player.id)
                            ? <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg whitespace-nowrap" style={{ background: 'rgba(217,154,0,0.14)', color: 'var(--gold)' }}>New</span>
                            : <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg whitespace-nowrap" style={{ background: 'rgba(18,161,80,0.1)', color: 'var(--green)' }}>In squad</span>
                        ) : !windowOpen ? (
                          <span className="text-[11px]" style={{ color: '#C7CFDA' }}>🔒</span>
                        ) : canBuy ? (
                          /* ── LIVE: an open slot exists — buy any still-alive, affordable player (STAGED) ── */
                          <button
                            onClick={e => { e.stopPropagation(); if (buyable) setBuyConfirm(player); }}
                            disabled={!buyable}
                            title={liveBud < player.price ? `Costs $${player.price}M — over your $${liveBud.toFixed(1)}M` : `Buy ${player.name}`}
                            className="text-[11px] font-bold px-3 min-h-[36px] rounded-lg transition-transform active:scale-95 whitespace-nowrap"
                            style={{
                              background: buyable ? 'var(--green)' : 'rgba(10,27,51,0.04)',
                              border: `1px solid ${buyable ? 'var(--green)' : 'rgba(10,27,51,0.06)'}`,
                              color: buyable ? '#fff' : 'var(--ink-3)',
                              cursor: buyable ? 'pointer' : 'not-allowed',
                            }}
                          >
                            {liveBud < player.price ? 'Over $' : '+ Buy'}
                          </button>
                        ) : (
                          /* ── LIVE: no open slot — cash in an eliminated player first ── */
                          <span className="text-[11px]" style={{ color: 'var(--ink-3)' }}>Available</span>
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
              <span className="font-num text-xs" style={{ color: 'var(--ink-2)' }}>{live ? myTeam.length : myTeam.length} / {TEAM_SIZE}</span>
            </div>

            <div className="mb-4 pt-3">
              <div className="flex justify-between text-xs mb-1.5" style={{ color: 'var(--ink-2)' }}>
                <span>{live ? 'Available' : 'Budget'}</span>
                <span className="font-num font-semibold" style={{ color: 'var(--blue)' }}>${displayBudget.toFixed(1)}M</span>
              </div>
              <div className="h-1 rounded-full" style={{ background: 'rgba(10,27,51,0.07)' }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (displayBudget / STARTING_BUDGET) * 100)}%`, background: 'var(--blue)' }} />
              </div>
              {/* Money you've CASHED IN so far (manual refunds), plus a nudge for money still unclaimed. */}
              {live && cashedTotal > 0 && (
                <div className="flex justify-between text-[11px] mt-1.5" style={{ color: 'var(--ink-2)' }}>
                  <span>💸 Cashed in {cashedIn.length} player{cashedIn.length === 1 ? '' : 's'}</span>
                  <span className="font-num font-semibold" style={{ color: 'var(--gold)' }}>+${cashedTotal.toFixed(1)}M</span>
                </div>
              )}
            </div>

            {/* Tier requirement: exactly 2 Platinum, 3 Gold, 5 Silver of your 10. Draft-only —
                once live, transfers may be any tier, so the quota no longer applies. */}
            {!live && (
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
            )}

            <div className="space-y-1.5 mb-4">
              {!live && myTeam.length === 0 && (
                <div className="text-center py-6 text-sm" style={{ color: 'var(--ink-3)' }}>Pick {TEAM_SIZE} players</div>
              )}

              {/* ── DRAFT: build the squad (Captain / Vice / remove) ── */}
              {!live && [...myTeam].sort((a, b) => getPlayer(a).ranking - getPlayer(b).ranking).map(id => {
                const p = getPlayer(id);
                const isCap = captain === id;
                const isVice = viceCaptain === id;
                return (
                  <div key={id} className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: isCap ? 'rgba(217,154,0,0.07)' : isVice ? 'rgba(14,111,196,0.06)' : 'rgba(10,27,51,0.03)', border: `1px solid ${isCap ? 'rgba(217,154,0,0.2)' : isVice ? 'rgba(14,111,196,0.2)' : 'rgba(10,27,51,0.06)'}` }}>
                    <PlayerAvatar playerId={id} name={p.name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <PlayerTag playerId={id} flag={p.flag} className="text-[8px] font-bold uppercase tracking-wide leading-tight truncate" style={{ color: 'var(--blue)' }} />
                      <div className="text-xs font-medium truncate" style={{ color: 'var(--ink)' }}>{p.name}</div>
                      <div className="font-num text-[10px]" style={{ color: 'var(--ink-2)' }}>${p.price}M · 🎾{p.surface[SURF]}% {SURFACE.label}</div>
                    </div>
                    <button onClick={() => setCaptain(id)} title="Captain (×2)" aria-label={`Make ${p.name} captain`} className="text-xs font-extrabold w-9 h-9 rounded-lg shrink-0 flex items-center justify-center transition-transform active:scale-90" style={{ background: isCap ? 'var(--gold)' : 'rgba(10,27,51,0.05)', color: isCap ? '#fff' : 'var(--ink-3)', border: `1px solid ${isCap ? 'var(--gold)' : 'rgba(10,27,51,0.08)'}` }}>C</button>
                    <button onClick={() => setViceCaptain(id)} title="Vice-captain (×1.5)" aria-label={`Make ${p.name} vice-captain`} className="text-xs font-extrabold w-9 h-9 rounded-lg shrink-0 flex items-center justify-center transition-transform active:scale-90" style={{ background: isVice ? 'var(--blue)' : 'rgba(10,27,51,0.05)', color: isVice ? '#fff' : 'var(--ink-3)', border: `1px solid ${isVice ? 'var(--blue)' : 'rgba(10,27,51,0.08)'}` }}>V</button>
                    <button onClick={() => removePlayer(id)} title="Remove" aria-label={`Remove ${p.name}`} className="text-xs w-9 h-9 rounded-lg shrink-0 flex items-center justify-center transition-transform active:scale-90" style={{ background: 'rgba(10,27,51,0.04)', border: '1px solid rgba(10,27,51,0.06)', color: 'var(--ink-2)' }}>✕</button>
                  </div>
                );
              })}
              {!locked && Array.from({ length: TEAM_SIZE - myTeam.length }).map((_, i) => (
                <button key={`e${i}`} onClick={() => setPickerOpen(true)} className="w-full px-3 py-2 rounded-xl text-xs text-center transition-colors hover:bg-black/[0.03] cursor-pointer" style={{ border: '1px dashed rgba(10,27,51,0.14)', color: 'var(--ink-3)' }}>+ Add a player</button>
              ))}

              {/* ── LIVE: preview squad — committed players + PENDING buys (gold), each undoable ── */}
              {live && [...myTeam].sort((a, b) => getPlayer(a).ranking - getPlayer(b).ranking).map(id => {
                const p = getPlayer(id);
                const isCap = captain === id;
                const isVice = viceCaptain === id;
                const isNew = isUndoableBuy(id);              // freshly signed — committed but still undoable
                const dead = !isNew && isEliminated(id);      // owned, out, not yet cashed in
                const refund = dead ? playerRefund(id) : 0;
                const rowBg = isNew ? 'rgba(217,154,0,0.09)' : dead ? 'rgba(229,71,43,0.06)' : isCap ? 'rgba(217,154,0,0.07)' : isVice ? 'rgba(14,111,196,0.06)' : 'rgba(10,27,51,0.03)';
                const rowBorder = isNew ? 'rgba(217,154,0,0.55)' : dead ? 'rgba(229,71,43,0.22)' : isCap ? 'rgba(217,154,0,0.2)' : isVice ? 'rgba(14,111,196,0.2)' : 'rgba(10,27,51,0.06)';
                return (
                  <div key={id} className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: rowBg, border: `1px solid ${rowBorder}` }}>
                    <div style={{ opacity: dead ? 0.55 : 1 }}><PlayerAvatar playerId={id} name={p.name} size="sm" /></div>
                    <div className="flex-1 min-w-0">
                      <PlayerTag playerId={id} flag={p.flag} className="text-[8px] font-bold uppercase tracking-wide leading-tight truncate" style={{ color: 'var(--blue)' }} />
                      <div className="text-xs font-medium truncate" style={{ color: 'var(--ink)' }}>{p.name}</div>
                      {isNew ? (
                        <div className="font-num text-[10px]" style={{ color: 'var(--gold)', fontWeight: 700 }}>NEW signing · ${p.price}M</div>
                      ) : dead ? (
                        <div className="font-num text-[10px] flex items-center gap-1.5 leading-tight">
                          <span style={{ color: 'var(--ember)', fontWeight: 700 }}>OUT {getPlayerExit(id) ?? '1st rd'}</span>
                          <span style={{ color: 'var(--ink-3)' }}>·</span>
                          <span style={{ color: 'var(--gold)', fontWeight: 700 }}>+${refund}M back</span>
                        </div>
                      ) : (
                        <div className="font-num text-[10px]" style={{ color: 'var(--ink-2)' }}>${p.price}M · 🎾{p.surface[SURF]}% {SURFACE.label}</div>
                      )}
                    </div>
                    {isNew ? (
                      <button onClick={() => undoBuy(id)} aria-label={`Undo signing ${p.name}`} className="text-[11px] font-bold px-2.5 h-9 rounded-lg shrink-0 transition-transform active:scale-90" style={{ background: 'rgba(10,27,51,0.05)', color: 'var(--ink-2)', border: '1px solid rgba(10,27,51,0.12)' }}>Undo</button>
                    ) : dead && windowOpen ? (
                      <button onClick={e => doCashIn(id, e)} aria-label={`Cash in ${p.name} for $${refund}M`} className="text-[11px] font-bold px-2.5 h-9 rounded-lg shrink-0 transition-transform active:scale-90 whitespace-nowrap" style={{ background: 'var(--ember)', color: '#fff', border: '1px solid var(--ember)' }}>Cash In +${refund}M</button>
                    ) : (
                      <>
                        {!dead && isCap && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: 'var(--gold)', color: '#fff' }}>C</span>}
                        {!dead && isVice && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: 'var(--blue)', color: '#fff' }}>V</span>}
                      </>
                    )}
                  </div>
                );
              })}

              {/* LIVE: open slots freed by cashing in — buy a replacement from the market */}
              {live && Array.from({ length: openCount }).map((_, i) => (
                <div key={`open${i}`} className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ border: '1px dashed rgba(217,154,0,0.55)', background: 'rgba(217,154,0,0.05)' }}>
                  <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-base" style={{ background: 'rgba(217,154,0,0.14)' }}>🛒</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold" style={{ color: 'var(--ink)' }}>Open slot</div>
                    <div className="text-[10px]" style={{ color: 'var(--ink-3)' }}>Tap <b style={{ color: 'var(--green)' }}>+ Buy</b> on any player →</div>
                  </div>
                </div>
              ))}
            </div>

            {!locked && myTeam.length > 0 && (!captain || !viceCaptain) && (
              <p className="text-[11px] mb-3" style={{ color: 'var(--ink-2)' }}>
                Tap <b style={{ color: 'var(--gold)' }}>C</b> to set your captain (×2) and <b style={{ color: 'var(--blue)' }}>V</b> your vice (×1.5).
              </p>
            )}

            {live ? (
              !windowOpen ? (
                <div className="w-full py-2.5 rounded-xl font-bold text-sm text-center" style={{ background: 'rgba(18,161,80,0.1)', color: 'var(--green)' }}>Locked for the final ✓</div>
              ) : unlockedBuys.length > 0 ? (
                /* Signings are already saved but still UNLOCKED — they auto-lock when the round
                   starts. This lets a manager lock them in NOW (hide the Undo controls) if they're set. */
                <>
                  <button
                    onClick={() => setFinalized(true)}
                    className="w-full py-3 rounded-xl font-bold text-sm text-white transition-transform active:scale-[0.99]"
                    style={{ background: 'var(--blue)' }}
                  >
                    Lock Squad → <span style={{ opacity: 0.85 }}>({unlockedBuys.length} signing{unlockedBuys.length === 1 ? '' : 's'})</span>
                  </button>
                  <p className="text-[11px] text-center mt-2" style={{ color: 'var(--ink-3)' }}>
                    Your signings are saved. They lock automatically when the round starts — or lock them now.
                  </p>
                </>
              ) : cashable.length > 0 ? (
                <div className="w-full py-2.5 rounded-xl font-bold text-sm text-center" style={{ background: 'rgba(229,71,43,0.08)', color: 'var(--ember)', border: '1px solid rgba(229,71,43,0.28)' }}>💸 Cash in {cashable.length} eliminated player{cashable.length === 1 ? '' : 's'}</div>
              ) : openCount > 0 ? (
                <div className="w-full py-2.5 rounded-xl font-bold text-sm text-center" style={{ background: 'rgba(217,154,0,0.1)', color: 'var(--gold)', border: '1px solid rgba(217,154,0,0.28)' }}>🛒 {openCount} open slot{openCount === 1 ? '' : 's'} · ${liveBud.toFixed(1)}M to spend</div>
              ) : (
                <div className="w-full py-2.5 rounded-xl font-bold text-sm text-center" style={{ background: 'rgba(18,161,80,0.1)', color: 'var(--green)' }}>Squad locked ✓</div>
              )
            ) : draftClosed ? (
              <div className="w-full py-2.5 rounded-xl font-bold text-sm text-center" style={{ background: 'rgba(229,71,43,0.08)', color: 'var(--ember)', border: '1px solid rgba(229,71,43,0.25)' }}>
                Draft closed — the tournament has started
              </div>
            ) : (
              <button
                onClick={() => { finalizeDraft(); setShowLocked(true); }}
                disabled={!valid}
                className="w-full py-3 rounded-xl font-bold text-sm transition-transform active:scale-[0.99]"
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

      {/* Cash-in feedback: a "+$X" that floats up from where you tapped, then clears itself. */}
      {cashFx && (
        <div
          key={cashFx.key}
          className="pointer-events-none fixed z-[300] font-num font-extrabold cash-fx"
          style={{ left: cashFx.x, top: cashFx.y, color: 'var(--gold)', fontSize: 18, textShadow: '0 1px 4px rgba(0,0,0,0.3)' }}
          onAnimationEnd={() => setCashFx(null)}
        >
          +${cashFx.amount}M 💸
        </div>
      )}

      {/* Purchase confirmation — draft add, and live market buy (commits immediately, undoable). */}
      <PurchaseConfirmModal player={confirm} onClose={() => setConfirm(null)} />
      <MarketBuyModal
        player={buyConfirm}
        budgetAfter={buyConfirm ? liveBud - buyConfirm.price : 0}
        onConfirm={() => buyConfirm && doBuy(buyConfirm.id)}
        onClose={() => setBuyConfirm(null)}
      />
      <TransferHelpModal open={showTransferHelp} onClose={() => setShowTransferHelp(false)} />
      <PlayerPickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} />
      <SquadLockedModal open={showLocked} onClose={() => setShowLocked(false)} onInvite={() => { setShowLocked(false); setActiveTab('league'); }} />
    </div>
  );
}
