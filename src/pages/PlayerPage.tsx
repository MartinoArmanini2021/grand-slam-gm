import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { findPlayer, PLAYERS } from '../data/players';
import { getTier, TIER_META } from '../data/tiers';
import { WIMBLEDON_2026 } from '../data/wimbledon2026';
import { ROUNDS, isPlayerOut, getPlayerExit, getOpponentId } from '../data/tournament';
import { lastName } from '../data/format';
import { nickOf } from '../data/nicknames';
import { TOURNAMENT } from '../data/tournamentConfig';
import type { Player, RoundId, TournamentResult } from '../types';
import PlayerAvatar from '../components/PlayerAvatar';
import SurfaceBar from '../components/SurfaceBar';

const SURFACE_DOT: Record<string, string> = { grass: '#12A150', clay: '#E5472B', hard: '#0e6fc4' };

function resultStyle(r: TournamentResult): [string, string] {
  if (r === 'W')   return ['rgba(217,154,0,0.16)',  '#D99A00'];
  if (r === 'F')   return ['rgba(10,27,51,0.08)',   '#0a1f44'];
  if (r === 'SF')  return ['rgba(14,111,196,0.12)',  '#0e6fc4'];
  if (r === 'QF')  return ['rgba(18,161,80,0.12)',   '#12A150'];
  if (r === 'R16') return ['rgba(10,27,51,0.05)',    '#5B6B84'];
  if (r === 'DNS') return ['transparent',            '#9AA7BC'];
  return ['rgba(10,27,51,0.04)', '#9AA7BC'];
}

export default function PlayerPage() {
  const { viewPlayer, playerReturnTab, setActiveTab, currentRoundIndex } = useGameStore();
  const p = viewPlayer ? findPlayer(viewPlayer) ?? null : null;
  if (!p) return null;

  const revealed = ROUNDS.slice(0, currentRoundIndex).map(r => r.id) as RoundId[];
  const isOut = isPlayerOut(p.id, revealed);
  // Who this player faces NEXT in the draw (from the current round onward) — the
  // default opponent shown in the head-to-head.
  const nextOppId = (() => {
    for (let i = currentRoundIndex; i < ROUNDS.length; i++) {
      const oid = getOpponentId(p.id, ROUNDS[i].id);
      if (oid) return oid;
    }
    return undefined;
  })();

  const tier = getTier(p.ranking);
  const tm = TIER_META[tier];
  const ytdPlayed = p.ytd.wins + p.ytd.losses;
  const winRate = ytdPlayed > 0 ? Math.round(p.ytd.wins / ytdPlayed * 100) : 0;
  const first = p.name.split(' ')[0];
  const hand = p.hand === 'R' ? 'right' : 'left';
  const article = /^[aeiou]/i.test(p.style) ? 'an' : 'a';
  const bio = `${first} is ${article} ${p.style.toLowerCase()} from ${p.country}, currently ranked #${p.ranking} on the ATP Tour. ` +
    `At ${p.age} and ${hand}-handed, ${first} ${p.ytd.titles > 0 ? `has ${p.ytd.titles} title${p.ytd.titles > 1 ? 's' : ''} in 2026.` : 'is still chasing a first title in 2026.'}`;

  const backLabel: Record<string, string> = {
    draft: 'Market', team: 'My Squad', league: 'League', home: 'Home', tournament: 'Bracket',
  };

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-3 py-6 fade-in">
      <button onClick={() => setActiveTab(playerReturnTab)} className="text-sm font-semibold mb-4" style={{ color: 'var(--blue)' }}>
        ‹ {backLabel[playerReturnTab] ?? 'Back'}
      </button>

      {/* Hero */}
      <div className="relative rounded-2xl overflow-hidden mb-4 p-6" style={{ background: 'linear-gradient(120deg,var(--ink),var(--navy-2))' }}>
        <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse 50% 90% at 88% 40%, ${tm.color}22 0%, transparent 70%)` }} />
        <div className="relative flex items-center gap-5">
          <PlayerAvatar playerId={p.id} name={p.name} size="xl" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-3xl">{p.flag}</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${tm.color}22`, color: tm.color, border: `1px solid ${tm.color}55` }}>
                {tier}
              </span>
              {isOut && (
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full" style={{ background: 'var(--ember)', color: '#fff' }}>
                  ELIMINATED · {getPlayerExit(p.id)}
                </span>
              )}
            </div>
            {nickOf(p.id) && (
              <div className="text-sm font-bold tracking-wide leading-tight" style={{ color: 'var(--gold-bright)' }}>“{nickOf(p.id)}”</div>
            )}
            <h1 className="text-2xl font-extrabold tracking-tight text-white leading-tight">{p.name}</h1>
            <div className="text-sm" style={{ color: 'var(--on-navy)' }}>
              #{p.ranking} ATP{p.seed ? ` · Seed ${p.seed}` : ''} · {p.style}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-num text-3xl font-extrabold" style={{ color: 'var(--gold-bright)' }}>${p.price}M</div>
            <div className="text-[10px]" style={{ color: 'var(--on-navy-2)' }}>price</div>
          </div>
        </div>
        <p className="relative text-sm mt-4 leading-relaxed" style={{ color: 'var(--on-navy)' }}>{bio}</p>
      </div>

      {/* Quick facts */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
        {[
          { label: 'Rank', value: `#${p.ranking}` },
          { label: 'Age', value: p.age },
          { label: 'Hand', value: p.hand === 'R' ? 'Right' : 'Left' },
          { label: 'Win %', value: `${winRate}%` },
          { label: 'Titles', value: p.ytd.titles },
          { label: 'Record', value: `${p.ytd.wins}-${p.ytd.losses}` },
        ].map((f, i) => (
          <div key={i} className="rounded-xl p-3 text-center" style={{ background: '#FFFFFF', border: '1px solid rgba(10,27,51,0.08)' }}>
            <div className="font-num text-lg font-bold" style={{ color: 'var(--ink)' }}>{f.value}</div>
            <div className="text-[10px] mt-0.5" style={{ color: 'var(--ink-2)' }}>{f.label}</div>
          </div>
        ))}
      </div>

      <div className="mb-4">
        <Panel title="Surface win rate">
          <SurfaceBar hard={p.surface.hard} clay={p.surface.clay} grass={p.surface.grass} highlight={TOURNAMENT.surface} />
        </Panel>
      </div>

      {/* 2026 tournament results */}
      <Panel title="2026 tournament results">
        <div className="flex gap-3 flex-wrap">
          {p.yearResults.map((r, i) => {
            const [bg, color] = resultStyle(r.result);
            return (
              <div key={i} className="text-center min-w-[3.5rem]">
                <div className="flex items-center justify-center gap-1 text-[11px] mb-1.5" style={{ color: 'var(--ink-2)' }}>
                  {r.short}
                  <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: SURFACE_DOT[r.surface] }} />
                </div>
                <span className="font-num text-sm font-bold px-2.5 py-1 rounded inline-block" style={{ background: bg, color, border: `1px solid ${color}30` }}>
                  {r.result}
                </span>
                <div className="text-[9px] mt-1" style={{ color: 'var(--ink-3)' }}>{r.tournament}</div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-4 mt-4 pt-3 text-[11px]" style={{ borderTop: '1px solid rgba(10,27,51,0.06)', color: 'var(--ink-3)' }}>
          <span><span className="w-1.5 h-1.5 rounded-full inline-block mr-1" style={{ background: SURFACE_DOT.hard }} />Hard</span>
          <span><span className="w-1.5 h-1.5 rounded-full inline-block mr-1" style={{ background: SURFACE_DOT.clay }} />Clay</span>
          <span><span className="w-1.5 h-1.5 rounded-full inline-block mr-1" style={{ background: SURFACE_DOT.grass }} />Grass</span>
          <span className="ml-auto">W = Champion · F = Final · SF/QF/R16 = round reached</span>
        </div>
      </Panel>

      {/* Head-to-head */}
      <div className="mt-4">
        <H2HSection player={p} defaultOppId={nextOppId} />
      </div>
    </div>
  );
}

function H2HSection({ player, defaultOppId }: { player: Player; defaultOppId?: string }) {
  const opponents = PLAYERS.filter(o => o.id !== player.id).sort((a, b) => a.ranking - b.ranking);
  // Default to the opponent this player faces NEXT in the draw; the selector still
  // lets you review any head-to-head.
  const [oppId, setOppId] = useState(defaultOppId ?? opponents[0]?.id ?? '');
  const opp = opponents.find(o => o.id === oppId) ?? opponents[0];
  if (!opp) return null;

  // Real Wimbledon 2026 meeting (if both are in the draw)
  const meeting = WIMBLEDON_2026.find(m =>
    (m.p1.name === player.name && m.p2.name === opp.name) ||
    (m.p2.name === player.name && m.p1.name === opp.name));
  const ROUND_FULL: Record<string, string> = { R32: 'Round of 32', R16: 'Round of 16', QF: 'Quarter-final', SF: 'Semi-final', F: 'Final' };

  const rows: { label: string; a: number; b: number; higher: boolean; fmt: (n: number) => string }[] = [
    { label: 'ATP ranking', a: player.ranking, b: opp.ranking, higher: false, fmt: n => `#${n}` },
    { label: 'Grass win %', a: player.surface.grass, b: opp.surface.grass, higher: true, fmt: n => `${n}%` },
    { label: 'Hard win %', a: player.surface.hard, b: opp.surface.hard, higher: true, fmt: n => `${n}%` },
    { label: 'Clay win %', a: player.surface.clay, b: opp.surface.clay, higher: true, fmt: n => `${n}%` },
    { label: '2026 wins', a: player.ytd.wins, b: opp.ytd.wins, higher: true, fmt: n => `${n}` },
    { label: '2026 titles', a: player.ytd.titles, b: opp.ytd.titles, higher: true, fmt: n => `${n}` },
  ];

  return (
    <Panel title="Head-to-head">
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <PlayerAvatar playerId={player.id} name={player.name} size="sm" />
          <span className="text-sm font-bold truncate" style={{ color: 'var(--ink)' }}>{lastName(player.name)}</span>
        </div>
        <span className="text-xs font-bold" style={{ color: 'var(--ink-3)' }}>vs</span>
        <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
          <PlayerAvatar playerId={opp.id} name={opp.name} size="sm" />
          <select
            value={oppId}
            onChange={e => setOppId(e.target.value)}
            aria-label="Compare with player"
            className="text-sm font-semibold rounded-lg px-2 py-1.5 outline-none max-w-[150px]"
            style={{ background: 'var(--raised)', border: '1px solid rgba(10,27,51,0.12)', color: 'var(--ink)' }}
          >
            {opponents.map(o => (
              <option key={o.id} value={o.id} style={{ color: TIER_META[getTier(o.ranking)].color, fontWeight: 600 }}>
                #{o.ranking} · {o.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Real meeting at Wimbledon 2026 */}
      <div className="rounded-xl px-3 py-2.5 mb-3 text-xs" style={{ background: meeting ? 'rgba(18,161,80,0.06)' : 'rgba(10,27,51,0.03)', border: `1px solid ${meeting ? 'rgba(18,161,80,0.18)' : 'rgba(10,27,51,0.06)'}` }}>
        {meeting ? (
          <span style={{ color: 'var(--ink)' }}>
            🎾 Met at {TOURNAMENT.edition} · <b>{ROUND_FULL[meeting.round]}</b> — <b style={{ color: 'var(--green)' }}>{lastName(meeting.winner)}</b> won <span className="font-num" style={{ color: 'var(--ink-2)' }}>{meeting.score}</span>
          </span>
        ) : (
          <span style={{ color: 'var(--ink-3)' }}>They didn't meet in the {TOURNAMENT.edition} draw. Full career H2H arrives with the live-data feed.</span>
        )}
      </div>

      {/* Stat-by-stat */}
      <div>
        {rows.map((r, i) => {
          const aWin = r.a === r.b ? null : (r.higher ? r.a > r.b : r.a < r.b);
          return (
            <div key={i} className="flex items-center py-1.5 text-sm" style={{ borderTop: i > 0 ? '1px solid rgba(10,27,51,0.05)' : 'none' }}>
              <div className="flex-1 text-left font-num font-bold" style={{ color: aWin === true ? 'var(--green)' : 'var(--ink)' }}>{r.fmt(r.a)}</div>
              <div className="w-28 text-center text-[10px] uppercase tracking-wide" style={{ color: 'var(--ink-2)' }}>{r.label}</div>
              <div className="flex-1 text-right font-num font-bold" style={{ color: aWin === false ? 'var(--green)' : 'var(--ink)' }}>{r.fmt(r.b)}</div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: '#FFFFFF', border: '1px solid rgba(10,27,51,0.08)', boxShadow: '0 1px 2px rgba(10,27,51,0.04)' }}>
      <h3 className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--ink-2)' }}>{title}</h3>
      {children}
    </div>
  );
}
