import { useState } from 'react';
import { BACKTEST_SLAMS } from '../data/backtestData';
import { analyzeSlam } from '../data/backtestEngine';
import { useGameStore } from '../store/gameStore';

const SURFACE_COLOR: Record<string, string> = { hard: '#1466D6', clay: '#E5472B', grass: '#12A150' };

export default function BacktestPage() {
  const setActiveTab = useGameStore(s => s.setActiveTab);
  const analyses = BACKTEST_SLAMS.map(s => ({ slam: s, a: analyzeSlam(s) }));
  const [active, setActive] = useState(0);

  if (analyses.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center fade-in">
        <div className="text-5xl mb-4">📊</div>
        <h2 className="text-xl font-bold mb-2" style={{ color: '#0A1B33' }}>Backtest loading</h2>
        <p className="text-sm" style={{ color: '#5B6B84' }}>Grand Slam results are being compiled.</p>
      </div>
    );
  }

  const cur = analyses[active];
  const surf = SURFACE_COLOR[cur.slam.surface];
  const maxSquad = Math.max(...cur.a.squads.map(s => s.score));

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 fade-in">
      <button onClick={() => setActiveTab('home')} className="text-sm font-semibold mb-4" style={{ color: '#1466D6' }}>‹ Home</button>

      <h1 className="text-xl font-extrabold tracking-tight" style={{ color: '#0A1B33' }}>Backtest — real Grand Slams</h1>
      <p className="text-xs mb-4" style={{ color: '#5B6B84' }}>
        The last {analyses.length} completed Slams, scored with this exact economy — steep prices, budget returns, captain 2×, and upset bonuses.
      </p>

      {/* Slam switcher */}
      <div className="flex gap-1 mb-5 p-1 rounded-2xl overflow-x-auto" style={{ background: '#FFFFFF', border: '1px solid rgba(10,27,51,0.08)' }}>
        {analyses.map((x, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            className="px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all"
            style={{
              background: i === active ? 'rgba(20,102,214,0.1)' : 'transparent',
              color: i === active ? '#1466D6' : '#5B6B84',
            }}
          >
            {x.slam.slam} {String(x.slam.year).slice(2)}
          </button>
        ))}
      </div>

      {/* Slam header */}
      <div className="rounded-2xl p-5 mb-4" style={{ background: 'linear-gradient(120deg,#0A1B33,#123163)' }}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest" style={{ color: surf }}>
              <span className="w-2 h-2 rounded-full" style={{ background: surf }} />
              {cur.slam.surface}
            </div>
            <h2 className="text-2xl font-extrabold text-white tracking-tight">{cur.slam.slam} {cur.slam.year}</h2>
            {cur.a.champion && <div className="text-sm mt-0.5" style={{ color: '#AFBFDA' }}>🏆 {cur.a.champion.name} — {cur.a.champion.total} pts</div>}
          </div>
          <div className="text-right">
            <div className="text-xs" style={{ color: '#8FA1BE' }}>Best possible squad</div>
            <div className="font-num text-3xl font-extrabold" style={{ color: '#F0C24B' }}>{cur.a.squads[0].score}</div>
            <div className="text-[10px]" style={{ color: '#8FA1BE' }}>pts · ${cur.a.squads[0].spent}M</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top scorers */}
        <Panel title="Top fantasy scorers">
          {cur.a.byPoints.slice(0, 6).map((p, i) => (
            <div key={p.name} className="flex items-center gap-3 px-1 py-2" style={{ borderBottom: i < 5 ? '1px solid rgba(10,27,51,0.05)' : 'none' }}>
              <div className="w-5 font-num text-xs font-bold" style={{ color: '#9AA7BC' }}>{i + 1}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate" style={{ color: '#0A1B33' }}>{p.name}</div>
                <div className="text-[10px]" style={{ color: '#5B6B84' }}>Seed {p.seed} · <span className="font-num">${p.price}M</span> · {p.exit === 'W' ? 'Champion' : `out ${p.exit}`}</div>
              </div>
              {p.upset > 0 && <span className="text-[10px]" title="upset bonus">🔥+{p.upset}</span>}
              <div className="font-num text-lg font-bold shrink-0" style={{ color: '#1466D6' }}>{p.total}</div>
            </div>
          ))}
        </Panel>

        {/* Best value */}
        <Panel title="Best value (points per $M)">
          {cur.a.byValue.slice(0, 6).map((p, i) => (
            <div key={p.name} className="flex items-center gap-3 px-1 py-2" style={{ borderBottom: i < 5 ? '1px solid rgba(10,27,51,0.05)' : 'none' }}>
              <div className="w-5 font-num text-xs font-bold" style={{ color: '#9AA7BC' }}>{i + 1}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate" style={{ color: '#0A1B33' }}>{p.name}</div>
                <div className="text-[10px]" style={{ color: '#5B6B84' }}>Seed {p.seed} · <span className="font-num">${p.price}M</span> · {p.total} pts</div>
              </div>
              <div className="font-num text-base font-bold shrink-0" style={{ color: '#12A150' }}>{p.valuePerM.toFixed(1)}<span className="text-[10px]" style={{ color: '#9AA7BC' }}>/$M</span></div>
            </div>
          ))}
        </Panel>
      </div>

      {/* Strategy comparison */}
      <Panel title="How each budget strategy would have scored" className="mt-4">
        <div className="space-y-3 pt-1">
          {cur.a.squads.map(sq => (
            <div key={sq.label}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-semibold" style={{ color: '#0A1B33' }}>{sq.label}</span>
                <span style={{ color: '#5B6B84' }}>
                  <span className="font-num">${sq.spent}M</span> · <span className="font-num font-bold" style={{ color: '#1466D6' }}>{sq.score} pts</span>
                </span>
              </div>
              <div className="h-2.5 rounded-full" style={{ background: 'rgba(10,27,51,0.06)' }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${(sq.score / maxSquad) * 100}%`, background: sq.label === 'Optimal XI' ? '#F0C24B' : '#1466D6' }} />
              </div>
              <div className="text-[10px] mt-1 truncate" style={{ color: '#9AA7BC' }}>
                {sq.players.map(p => p.name.split(' ').slice(-1)[0]).join(' · ')}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs mt-4 pt-3" style={{ color: '#5B6B84', borderTop: '1px solid rgba(10,27,51,0.06)' }}>
          {takeaway(cur.a)}
        </p>
      </Panel>
    </div>
  );
}

function Panel({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl p-4 ${className}`} style={{ background: '#FFFFFF', border: '1px solid rgba(10,27,51,0.08)', boxShadow: '0 1px 2px rgba(10,27,51,0.04)' }}>
      <h3 className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: '#5B6B84' }}>{title}</h3>
      {children}
    </div>
  );
}

function takeaway(a: ReturnType<typeof analyzeSlam>): string {
  const nonOptimal = a.squads.filter(s => s.label !== 'Optimal XI');
  const winner = [...nonOptimal].sort((x, y) => y.score - x.score)[0];
  const loser = [...nonOptimal].sort((x, y) => x.score - y.score)[0];
  const bestValue = a.byValue[0];
  return `“${winner.label}” was the best real-world strategy (${winner.score} pts) — beating “${loser.label}” (${loser.score}). Sharpest value pick: ${bestValue?.name} at $${bestValue?.price}M returning ${bestValue?.total} pts.`;
}
