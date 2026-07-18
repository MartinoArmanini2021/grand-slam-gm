import { useState } from 'react';
import { PLAYERS, getPlayer } from '../data/players';
import { getTier, TIER_META } from '../data/tiers';
import PlayerAvatar from '../components/PlayerAvatar';

const OPTIONS = [...PLAYERS].sort((a, b) => a.ranking - b.ranking);

type Better = 'a' | 'b' | null;
const cmp = (a: number, b: number, higherWins = true): Better =>
  a === b ? null : (higherWins ? a > b : a < b) ? 'a' : 'b';

export default function PlayerCompare() {
  const [aId, setAId] = useState('sinner');
  const [bId, setBId] = useState('djokovic');
  const A = getPlayer(aId), B = getPlayer(bId);
  const winRate = (p: typeof A) => Math.round(p.ytd.wins / (p.ytd.wins + p.ytd.losses) * 100);

  const rows: { label: string; a: string | number; b: string | number; av: number; bv: number; higher?: boolean; tint?: boolean }[] = [
    { label: 'Ranking', a: `#${A.ranking}`, b: `#${B.ranking}`, av: A.ranking, bv: B.ranking, higher: false, tint: true },
    { label: 'Grass win %', a: `${A.surface.grass}%`, b: `${B.surface.grass}%`, av: A.surface.grass, bv: B.surface.grass, higher: true, tint: true },
    { label: 'Hard win %', a: `${A.surface.hard}%`, b: `${B.surface.hard}%`, av: A.surface.hard, bv: B.surface.hard, higher: true, tint: true },
    { label: 'Clay win %', a: `${A.surface.clay}%`, b: `${B.surface.clay}%`, av: A.surface.clay, bv: B.surface.clay, higher: true, tint: true },
    { label: '2026 W–L', a: `${A.ytd.wins}–${A.ytd.losses}`, b: `${B.ytd.wins}–${B.ytd.losses}`, av: A.ytd.wins, bv: B.ytd.wins, higher: true, tint: true },
    { label: 'Win rate', a: `${winRate(A)}%`, b: `${winRate(B)}%`, av: winRate(A), bv: winRate(B), higher: true, tint: true },
    { label: 'Titles', a: A.ytd.titles, b: B.ytd.titles, av: A.ytd.titles, bv: B.ytd.titles, higher: true, tint: true },
    { label: 'Price', a: `$${A.price}M`, b: `$${B.price}M`, av: A.price, bv: B.price, higher: false, tint: false },
    { label: 'Age', a: A.age, b: B.age, av: A.age, bv: B.age, tint: false },
  ];

  const Picker = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="text-sm font-semibold rounded-lg px-2 py-1.5 outline-none"
      style={{ background: '#F5F7FA', border: '1px solid rgba(10,27,51,0.12)', color: '#0a1f44', maxWidth: 160 }}
    >
      {OPTIONS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  );

  const head = (p: typeof A) => {
    const tm = TIER_META[getTier(p.ranking)];
    return (
      <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
        <PlayerAvatar playerId={p.id} name={p.name} size="lg" />
        <div className="text-sm font-bold text-center leading-tight" style={{ color: '#0a1f44' }}>{p.name}</div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: tm.soft, color: tm.color, border: `1px solid ${tm.color}55` }}>{getTier(p.ranking)}</span>
      </div>
    );
  };

  return (
    <div className="rounded-2xl p-4 mb-5" style={{ background: '#FFFFFF', border: '1px solid rgba(10,27,51,0.08)', boxShadow: '0 1px 2px rgba(10,27,51,0.04)' }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[11px] font-bold uppercase tracking-widest" style={{ color: '#5B6B84' }}>Compare players</h3>
        <div className="flex items-center gap-2">
          <Picker value={aId} onChange={setAId} />
          <span className="text-xs font-bold" style={{ color: '#9AA7BC' }}>vs</span>
          <Picker value={bId} onChange={setBId} />
        </div>
      </div>

      <div className="flex items-start gap-2 mb-3">
        {head(A)}
        <div className="w-px self-stretch" style={{ background: 'rgba(10,27,51,0.08)' }} />
        {head(B)}
      </div>

      <div>
        {rows.map((r, i) => {
          const better: Better = r.tint === false ? null : cmp(r.av, r.bv, r.higher);
          const aColor = better === 'a' ? '#12A150' : '#0a1f44';
          const bColor = better === 'b' ? '#12A150' : '#0a1f44';
          return (
            <div key={i} className="flex items-center py-2 text-sm" style={{ borderTop: i > 0 ? '1px solid rgba(10,27,51,0.05)' : 'none' }}>
              <div className="flex-1 text-left font-num font-bold" style={{ color: aColor }}>
                {better === 'a' && <span className="mr-1">▸</span>}{r.a}
              </div>
              <div className="w-28 text-center text-[11px] uppercase tracking-wide" style={{ color: '#5B6B84' }}>{r.label}</div>
              <div className="flex-1 text-right font-num font-bold" style={{ color: bColor }}>
                {r.b}{better === 'b' && <span className="ml-1">◂</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
