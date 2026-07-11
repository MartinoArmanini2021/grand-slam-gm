import { useState } from 'react';
import { PLAYERS } from '../data/players';
import type { Player, TournamentResult } from '../types';
import FormDots from '../components/FormDots';
import PlayerAvatar from '../components/PlayerAvatar';
import { getTier, TIER_META, TIER_ORDER } from '../data/tiers';
import { useGameStore } from '../store/gameStore';

const RESULT_ORDER: TournamentResult[] = ['W', 'F', 'SF', 'QF', 'R16', 'R32', 'R64', 'DNS'];

const TIER_RANGE: Record<string, string> = {
  Platinum: 'Top 6', Gold: 'Ranked 7–16', Silver: 'Ranked 17+',
};

function resultStyle(r: TournamentResult): [string, string] {
  if (r === 'W')   return ['rgba(217,154,0,0.15)',  '#D99A00'];
  if (r === 'F')   return ['rgba(10,27,51,0.07)', '#0a1f44'];
  if (r === 'SF')  return ['rgba(14,111,196,0.12)',  '#0e6fc4'];
  if (r === 'QF')  return ['rgba(18,161,80,0.12)',    '#12A150'];
  if (r === 'R16') return ['rgba(10,27,51,0.04)', '#5B6B84'];
  if (r === 'DNS') return ['transparent',           '#9AA7BC'];
  return ['rgba(10,27,51,0.03)', '#9AA7BC'];
}

export default function PlayersPage() {
  const openPlayer = useGameStore(s => s.openPlayer);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'ranking' | 'grass' | 'form' | 'price'>('ranking');

  const sorted = [...PLAYERS]
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sort === 'ranking') return a.ranking - b.ranking;
      if (sort === 'grass')   return b.surface.grass - a.surface.grass;
      if (sort === 'price')   return b.price - a.price;
      if (sort === 'form')    return b.form.filter(r => r === 'W').length - a.form.filter(r => r === 'W').length;
      return 0;
    });

  const tournaments = PLAYERS[0].yearResults.map(r => r.short);

  const groups = TIER_ORDER
    .map(tier => ({ tier, meta: TIER_META[tier], players: sorted.filter(p => getTier(p.ranking) === tier) }))
    .filter(g => g.players.length > 0);

  const Thead = (
    <thead>
      <tr style={{ borderBottom: '1px solid rgba(10,27,51,0.07)', background: '#FFFFFF' }}>
        <th className="text-left px-3 py-3 text-xs font-semibold w-8" style={{ color: '#9AA7BC' }}>#</th>
        <th className="text-left px-3 py-3 text-xs font-semibold" style={{ color: '#5B6B84' }}>Player</th>
        <th className="text-center px-2 py-3 text-xs font-semibold" style={{ color: '#12A150' }}>Grass</th>
        <th className="text-center px-2 py-3 text-xs font-semibold" style={{ color: '#0e6fc4' }}>Hard</th>
        <th className="text-center px-2 py-3 text-xs font-semibold" style={{ color: '#E5472B' }}>Clay</th>
        <th className="text-center px-2 py-3 text-xs font-semibold" style={{ color: '#5B6B84' }}>YTD</th>
        <th className="text-center px-2 py-3 text-xs font-semibold" style={{ color: '#5B6B84' }}>Form</th>
        {tournaments.map(t => (
          <th key={t} className="text-center px-2 py-3 text-xs font-semibold" style={{ color: '#9AA7BC' }}>{t}</th>
        ))}
        <th className="text-right px-3 py-3 text-xs font-semibold" style={{ color: '#0e6fc4' }}>Price</th>
      </tr>
    </thead>
  );

  const renderRow = (player: Player) => (
    <tr
      key={player.id}
      onClick={() => openPlayer(player.id)}
      className="cursor-pointer transition-colors"
      style={{ borderBottom: '1px solid rgba(10,27,51,0.04)', background: 'transparent' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(10,27,51,0.02)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      <td className="px-3 py-2.5 font-num text-xs" style={{ color: '#9AA7BC' }}>#{player.ranking}</td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <PlayerAvatar playerId={player.id} name={player.name} size="sm" />
          <div>
            <div className="font-semibold text-xs leading-tight" style={{ color: '#0a1f44' }}>{player.name}</div>
            {player.seed && <span className="font-num text-[10px]" style={{ color: '#5B6B84' }}>[{player.seed}]</span>}
          </div>
        </div>
      </td>
      <td className="px-2 py-2.5 text-center">
        <span className="font-num font-bold text-xs" style={{ color: player.surface.grass >= 80 ? '#12A150' : '#5B6B84' }}>
          {player.surface.grass}%
        </span>
      </td>
      <td className="px-2 py-2.5 text-center font-num text-xs" style={{ color: '#5B6B84' }}>{player.surface.hard}%</td>
      <td className="px-2 py-2.5 text-center font-num text-xs" style={{ color: '#5B6B84' }}>{player.surface.clay}%</td>
      <td className="px-2 py-2.5 text-center font-num text-xs" style={{ color: '#5B6B84' }}>{player.ytd.wins}–{player.ytd.losses}</td>
      <td className="px-2 py-2.5">
        <FormDots form={player.form} size="sm" />
      </td>
      {tournaments.map(t => {
        const res = player.yearResults.find(r => r.short === t);
        if (!res) return <td key={t} className="px-2 py-2.5 text-center font-num text-xs" style={{ color: '#9AA7BC' }}>—</td>;
        const [bg, color] = resultStyle(res.result);
        return (
          <td key={t} className="px-2 py-2.5 text-center">
            <span className="font-num text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: bg, color, border: `1px solid ${color}30` }}>
              {res.result}
            </span>
          </td>
        );
      })}
      <td className="px-3 py-2.5 text-right font-num font-bold text-sm" style={{ color: '#0e6fc4' }}>${player.price}M</td>
    </tr>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 fade-in">
      {/* Controls */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div>
          <h1 className="text-lg font-bold" style={{ color: '#0a1f44' }}>Player Stats</h1>
          <div className="text-xs" style={{ color: '#5B6B84' }}>Wimbledon 2026 · 32 players · by tier</div>
        </div>
        <div className="flex-1" />
        <input
          type="text"
          placeholder="Search…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="text-sm outline-none px-3 py-2 rounded-xl w-36"
          style={{ background: '#FFFFFF', border: '1px solid rgba(10,27,51,0.09)', color: '#0a1f44' }}
        />
        <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid rgba(10,27,51,0.07)' }}>
          {(['ranking','grass','form','price'] as const).map(s => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className="px-3 py-2 text-xs font-semibold transition-colors"
              style={{
                background: sort === s ? 'rgba(10,27,51,0.08)' : 'transparent',
                color: sort === s ? '#0a1f44' : '#5B6B84',
              }}
            >
              {s === 'grass' ? 'Grass' : s === 'form' ? 'Form' : s === 'price' ? 'Price' : 'Rank'}
            </button>
          ))}
        </div>
      </div>

      {/* Tier-grouped tables */}
      {groups.map(g => (
        <div key={g.tier} className="mb-6">
          <div className="flex items-center gap-2.5 mb-2.5 px-1">
            <span className="w-3 h-3 rounded-full" style={{ background: g.meta.color, boxShadow: `0 0 10px ${g.meta.color}66` }} />
            <h2 className="text-sm font-bold tracking-wide" style={{ color: g.meta.color }}>{g.meta.label}</h2>
            <span className="text-xs font-num" style={{ color: '#5B6B84' }}>{g.players.length}</span>
            <span className="text-[10px] font-num px-2 py-0.5 rounded-full" style={{ background: g.meta.soft, color: g.meta.color }}>
              {TIER_RANGE[g.tier]}
            </span>
          </div>
          <div className="rounded-2xl overflow-x-auto" style={{ border: `1px solid ${g.meta.color}22` }}>
            <table className="w-full text-sm min-w-[700px]">
              {Thead}
              <tbody>{g.players.map(renderRow)}</tbody>
            </table>
          </div>
        </div>
      ))}

      <p className="text-center text-xs mt-2" style={{ color: '#9AA7BC' }}>Tap any player to open their profile.</p>
    </div>
  );
}
