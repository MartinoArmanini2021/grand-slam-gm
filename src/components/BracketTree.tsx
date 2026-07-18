import { useState } from 'react';
import { WIMBLEDON_2026, WIMBLEDON_2026_CHAMPION } from '../data/wimbledon2026';
import type { WMatch, WRound } from '../data/wimbledon2026';
import { useGameStore } from '../store/gameStore';
import { getPlayer } from '../data/players';

const COLS: WRound[] = ['R32', 'R16', 'QF', 'SF'];
const ROUND_LABEL: Record<WRound, string> = { R32: 'Round of 32', R16: 'Round of 16', QF: 'Quarter-finals', SF: 'Semi-finals', F: 'Final' };

export default function BracketTree() {
  const [half, setHalf] = useState<'top' | 'bottom'>('top');
  const [focus, setFocus] = useState<string | null>(null);
  const myTeam = useGameStore(s => s.myTeam);
  const mine = new Set(myTeam.map(id => getPlayer(id).name));

  const final = WIMBLEDON_2026.find(m => m.round === 'F')!;
  const onRoute = (m: WMatch) => focus !== null && (m.p1.name === focus || m.p2.name === focus);

  const PlayerRow = ({ name, seed, isWinner, dim }: { name: string; seed: number | null; isWinner: boolean; dim: boolean }) => {
    const focused = focus === name;
    const isMine = mine.has(name);
    return (
      <button
        onClick={() => setFocus(focused ? null : name)}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left transition-colors"
        style={{
          background: focused ? 'rgba(14,111,196,0.12)' : isMine ? 'rgba(217,154,0,0.14)' : 'transparent',
          borderLeft: isMine ? '3px solid #D99A00' : '3px solid transparent',
        }}
      >
        <span className="font-num text-[9px] w-4 shrink-0" style={{ color: '#9AA7BC' }}>{seed ?? ''}</span>
        <span className="text-[11px] truncate flex-1" style={{ color: dim ? '#9AA7BC' : '#0a1f44', fontWeight: isWinner || isMine ? 800 : 500 }}>
          {name}
        </span>
        {isMine && <span className="text-[9px] shrink-0" style={{ color: '#D99A00' }}>★</span>}
        {isWinner && <span className="text-[10px] shrink-0" style={{ color: '#12A150' }}>✓</span>}
      </button>
    );
  };

  const MatchCard = ({ m }: { m: WMatch }) => {
    const route = onRoute(m);
    return (
      <div className="rounded-lg overflow-hidden shrink-0" style={{
        width: 158,
        background: '#FFFFFF',
        border: `1.5px solid ${route ? '#0e6fc4' : 'rgba(10,27,51,0.1)'}`,
        boxShadow: route ? '0 0 0 3px rgba(14,111,196,0.12)' : '0 1px 2px rgba(10,27,51,0.04)',
      }}>
        <PlayerRow name={m.p1.name} seed={m.p1.seed} isWinner={m.winner === m.p1.name} dim={m.winner !== m.p1.name} />
        <div style={{ height: 1, background: 'rgba(10,27,51,0.06)' }} />
        <PlayerRow name={m.p2.name} seed={m.p2.seed} isWinner={m.winner === m.p2.name} dim={m.winner !== m.p2.name} />
      </div>
    );
  };

  return (
    <div>
      {/* Controls */}
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid rgba(10,27,51,0.1)' }}>
          {(['top', 'bottom'] as const).map(h => (
            <button
              key={h}
              onClick={() => setHalf(h)}
              className="px-4 py-2 text-xs font-bold transition-colors"
              style={{ background: half === h ? 'rgba(14,111,196,0.1)' : '#FFFFFF', color: half === h ? '#0e6fc4' : '#5B6B84' }}
            >
              {h === 'top' ? 'Left Half' : 'Right Half'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-[11px]" style={{ color: '#9AA7BC' }}>
          {mine.size > 0 && (
            <span className="flex items-center gap-1 font-semibold" style={{ color: '#D99A00' }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: '#D99A00', display: 'inline-block' }} /> Your players
            </span>
          )}
          <span>
            {focus ? <>Tracing <span className="font-bold" style={{ color: '#0e6fc4' }}>{focus}</span> · <button onClick={() => setFocus(null)} className="underline">clear</button></> : 'Tap a player to trace their route to the final'}
          </span>
        </div>
      </div>

      {/* Tree */}
      <div className="overflow-x-auto no-scrollbar rounded-2xl p-3" style={{ background: '#F5F7FA', border: '1px solid rgba(10,27,51,0.07)' }}>
        <div className="flex gap-3 items-stretch" style={{ minWidth: 'min-content' }}>
          {COLS.map(round => {
            const matches = WIMBLEDON_2026.filter(m => m.round === round && m.half === half);
            return (
              <div key={round} className="flex flex-col" style={{ minWidth: 158 }}>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-2 text-center" style={{ color: '#5B6B84' }}>{ROUND_LABEL[round]}</div>
                <div className="flex-1 flex flex-col justify-around gap-2">
                  {matches.map(m => <MatchCard key={m.slot} m={m} />)}
                </div>
              </div>
            );
          })}
          {/* Final */}
          <div className="flex flex-col" style={{ minWidth: 158 }}>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-2 text-center" style={{ color: '#D99A00' }}>Final 🏆</div>
            <div className="flex-1 flex flex-col justify-center gap-2">
              <MatchCard m={final} />
              <div className="text-[10px] text-center font-semibold" style={{ color: '#5B6B84' }}>
                Champion: <span style={{ color: '#0a1f44' }}>{WIMBLEDON_2026_CHAMPION}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
