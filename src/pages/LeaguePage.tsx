import { useGameStore } from '../store/gameStore';
import { getPlayer } from '../data/players';
import { ROUNDS } from '../data/tournament';
import { getRivalTeams } from '../data/rivals';
import PlayerAvatar from '../components/PlayerAvatar';

interface Row {
  id: string;
  name: string;
  motto: string;
  manager: string;
  emblem: string;
  color: string;
  squad: string[];
  budget: number;
  score: number;
  you: boolean;
}

export default function LeaguePage() {
  const { myTeam, myScore, budget, currentRoundIndex, phase, openTeam } = useGameStore();

  const rivalTeams = getRivalTeams(currentRoundIndex);

  const rows: Row[] = [
    ...rivalTeams.map(rt => ({
      id: rt.rival.id, name: rt.rival.name, motto: rt.rival.tag, manager: rt.rival.manager,
      emblem: rt.rival.emblem, color: rt.rival.color, squad: rt.squad, budget: rt.budget, score: rt.score, you: false,
    })),
    ...(myTeam.length > 0 ? [{
      id: 'you', name: 'You', motto: 'Your squad', manager: '@you', emblem: '🎾', color: '#0e6fc4',
      squad: myTeam, budget, score: myScore, you: true,
    }] : []),
  ];

  rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const roundLabel = phase === 'draft' ? 'Draft in progress'
    : currentRoundIndex === 0 ? 'Before Round 1'
    : `After ${ROUNDS[currentRoundIndex - 1]?.label ?? ''}`;

  const medal = (i: number) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 fade-in">
      {/* Header */}
      <div className="flex items-end justify-between mb-5 flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight" style={{ color: '#0a1f44' }}>League Standings</h1>
          <div className="text-xs" style={{ color: '#5B6B84' }}>Everyone gets $100M · pick any player · {roundLabel}</div>
        </div>
        <div className="text-xs px-3 py-1.5 rounded-full font-semibold" style={{ background: 'rgba(14,111,196,0.1)', color: '#0e6fc4' }}>
          {rows.length} managers
        </div>
      </div>

      {/* Standings */}
      <div className="space-y-2.5">
        {rows.map((row, i) => (
          <button
            key={row.id}
            onClick={() => openTeam(row.id)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-all hover:brightness-[0.98]"
            style={{
              background: row.you ? 'rgba(14,111,196,0.05)' : '#FFFFFF',
              border: `1px solid ${row.you ? 'rgba(14,111,196,0.3)' : 'rgba(10,27,51,0.08)'}`,
              boxShadow: '0 1px 2px rgba(10,27,51,0.04)',
            }}
          >
            {/* Far left: logo + name + motto */}
            <div className="flex items-center gap-3 shrink-0" style={{ width: 172 }}>
              <div className="relative w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ background: `${row.color}1a`, border: `1px solid ${row.color}55` }}>
                {row.emblem}
                <span className="absolute -top-1.5 -left-1.5 text-[10px] font-num font-bold w-5 h-5 rounded-full flex items-center justify-center" style={{ background: i < 3 ? '#0a1f44' : '#EEF1F5', color: i < 3 ? '#fff' : '#9AA7BC' }}>
                  {medal(i)}
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-sm truncate" style={{ color: '#0a1f44' }}>{row.name}</span>
                  {row.you && <span className="text-[9px] font-bold px-1 py-0.5 rounded" style={{ background: '#0e6fc4', color: '#fff' }}>YOU</span>}
                </div>
                <div className="text-[11px] truncate" style={{ color: '#9AA7BC' }}>{row.motto}</div>
              </div>
            </div>

            {/* Players — immediately visible, with names */}
            <div className="flex-1 min-w-0 hidden sm:flex flex-wrap gap-1 content-center">
              {row.squad.slice(0, 6).map(id => {
                const p = getPlayer(id);
                return (
                  <span key={id} className="inline-flex items-center gap-1 pl-0.5 pr-1.5 py-0.5 rounded-full" style={{ background: 'rgba(10,27,51,0.04)' }}>
                    <PlayerAvatar playerId={id} name={p.name} size="sm" />
                    <span className="text-[11px] font-semibold" style={{ color: '#5B6B84' }}>{p.name.split(' ').slice(-1)[0]}</span>
                  </span>
                );
              })}
            </div>

            {/* Right: total score + available budget */}
            <div className="text-right shrink-0 w-20">
              <div className="font-num text-xl font-extrabold" style={{ color: '#0e6fc4' }}>{row.score}</div>
              <div className="text-[10px]" style={{ color: '#9AA7BC' }}>pts</div>
              <div className="font-num text-[11px] font-semibold mt-0.5" style={{ color: '#12A150' }}>${row.budget.toFixed(1)}M</div>
            </div>
            <div className="shrink-0 text-lg" style={{ color: '#9AA7BC' }}>›</div>
          </button>
        ))}
      </div>

      {myTeam.length === 0 && (
        <p className="text-center text-sm mt-6" style={{ color: '#9AA7BC' }}>Draft your squad to join the standings.</p>
      )}
    </div>
  );
}
