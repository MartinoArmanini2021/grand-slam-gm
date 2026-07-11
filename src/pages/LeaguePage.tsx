import { useGameStore } from '../store/gameStore';
import { getPlayer } from '../data/players';
import { ROUNDS } from '../data/tournament';
import { getRivalTeams } from '../data/rivals';
import PlayerAvatar from '../components/PlayerAvatar';

interface Row {
  id: string;
  name: string;
  tag: string;
  color: string;
  squad: string[];
  captainId: string;
  transfers: number;
  score: number;
  you: boolean;
}

export default function LeaguePage() {
  const { myTeam, captain, myScore, currentRoundIndex, phase, openTeam } = useGameStore();

  const rivalTeams = getRivalTeams(currentRoundIndex);

  const rows: Row[] = [
    ...rivalTeams.map(rt => ({
      id: rt.rival.id,
      name: rt.rival.name,
      tag: rt.rival.tag,
      color: rt.rival.color,
      squad: rt.squad,
      captainId: rt.captainId,
      transfers: rt.transfers.length,
      score: rt.score,
      you: false,
    })),
  ];

  if (myTeam.length > 0) {
    rows.push({
      id: 'you', name: 'You', tag: 'Your squad', color: '#0e6fc4',
      squad: myTeam, captainId: captain ?? myTeam[0], transfers: 0,
      score: myScore, you: true,
    });
  }

  rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const roundLabel = phase === 'draft' ? 'Draft in progress'
    : currentRoundIndex === 0 ? 'Before Round 1'
    : `After ${ROUNDS[currentRoundIndex - 1]?.label ?? ''}`;

  const medal = (i: number) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 fade-in">
      {/* Header */}
      <div className="flex items-end justify-between mb-5 flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight" style={{ color: '#0a1f44' }}>League Standings</h1>
          <div className="text-xs" style={{ color: '#5B6B84' }}>
            Everyone gets $100M · pick any player · {roundLabel}
          </div>
        </div>
        <div className="text-xs px-3 py-1.5 rounded-full font-semibold" style={{ background: 'rgba(14,111,196,0.1)', color: '#0e6fc4' }}>
          {rows.length} managers
        </div>
      </div>

      {/* Standings */}
      <div className="space-y-2">
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
            <div className="w-7 text-center font-num font-bold text-lg shrink-0" style={{ color: i < 3 ? '#0a1f44' : '#9AA7BC' }}>
              {medal(i)}
            </div>
            <div className="flex -space-x-3 shrink-0">
              {row.squad.slice(0, 5).map(id => (
                <PlayerAvatar key={id} playerId={id} name={getPlayer(id).name} size="sm" ring={false} />
              ))}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold truncate" style={{ color: '#0a1f44' }}>{row.name}</span>
                {row.you && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#0e6fc4', color: '#fff' }}>YOU</span>}
              </div>
              <div className="text-xs truncate" style={{ color: '#5B6B84' }}>
                {row.tag}{row.transfers > 0 && <> · <span className="font-num">{row.transfers} transfer{row.transfers > 1 ? 's' : ''}</span></>}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-num text-xl font-extrabold" style={{ color: '#0e6fc4' }}>{row.score}</div>
              <div className="text-[10px]" style={{ color: '#9AA7BC' }}>pts</div>
            </div>
            <div className="shrink-0 text-lg" style={{ color: '#9AA7BC' }}>›</div>
          </button>
        ))}
      </div>

      {myTeam.length === 0 && (
        <p className="text-center text-sm mt-6" style={{ color: '#9AA7BC' }}>
          Draft your squad to join the standings.
        </p>
      )}
    </div>
  );
}
