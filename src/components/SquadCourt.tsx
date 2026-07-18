import { useGameStore } from '../store/gameStore';
import { getPlayer } from '../data/players';
import { getPlayerExit } from '../data/tournament';
import { ROUNDS } from '../data/tournament';
import PlayerAvatar from './PlayerAvatar';

// Six on-court positions (as % of the court box): far half (top) and near half.
const SPOTS = [
  { x: 26, y: 24 }, { x: 50, y: 20 }, { x: 74, y: 24 }, // far half
  { x: 26, y: 76 }, { x: 50, y: 80 }, { x: 74, y: 76 }, // near half
];

export default function SquadCourt() {
  const { myTeam, captain, currentRoundIndex, phase, openPlayer } = useGameStore();
  const revealed = ROUNDS.slice(0, currentRoundIndex).map(r => r.id);

  return (
    <div className="relative w-full rounded-2xl overflow-hidden" style={{ aspectRatio: '16 / 11', boxShadow: '0 8px 30px rgba(10,27,51,0.18)' }}>
      {/* Grass court */}
      <svg viewBox="0 0 360 248" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
        {/* mow stripes */}
        {Array.from({ length: 8 }).map((_, i) => (
          <rect key={i} x={i * 45} y="0" width="45" height="248" fill={i % 2 ? '#3f9455' : '#3a8a4e'} />
        ))}
        {/* court lines */}
        <g stroke="#ffffff" strokeOpacity="0.92" strokeWidth="1.6" fill="none">
          <rect x="24" y="20" width="312" height="208" /> {/* doubles */}
          <line x1="52" y1="20" x2="52" y2="228" />        {/* left singles */}
          <line x1="308" y1="20" x2="308" y2="228" />      {/* right singles */}
          <line x1="52" y1="76" x2="308" y2="76" />        {/* far service line */}
          <line x1="52" y1="172" x2="308" y2="172" />      {/* near service line */}
          <line x1="180" y1="76" x2="180" y2="172" />      {/* centre service line */}
        </g>
        {/* net */}
        <line x1="16" y1="124" x2="344" y2="124" stroke="#ffffff" strokeWidth="3.2" strokeOpacity="0.95" />
        <line x1="16" y1="124" x2="344" y2="124" stroke="#0a1f44" strokeWidth="1" strokeOpacity="0.25" strokeDasharray="2 2" />
      </svg>

      {/* Players */}
      {SPOTS.map((spot, i) => {
        const id = myTeam[i];
        if (!id) {
          return (
            <div key={i} className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center" style={{ left: `${spot.x}%`, top: `${spot.y}%` }}>
              <div className="rounded-full flex items-center justify-center" style={{ width: 42, height: 42, border: '2px dashed rgba(255,255,255,0.6)' }}>
                <span className="text-white/70 text-lg leading-none">+</span>
              </div>
            </div>
          );
        }
        const p = getPlayer(id);
        const exit = getPlayerExit(id);
        const out = exit !== null && revealed.includes(exit);
        const isCap = captain === id;
        return (
          <button
            key={i}
            onClick={() => openPlayer(id)}
            className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
            style={{ left: `${spot.x}%`, top: `${spot.y}%`, opacity: out ? 0.5 : 1 }}
          >
            <div className="relative" style={isCap ? { filter: 'drop-shadow(0 0 0 2px #D99A00)' } : undefined}>
              <PlayerAvatar playerId={id} name={p.name} size="md" />
              {isCap && (
                <span className="absolute -top-1 -right-1 rounded-full flex items-center justify-center text-[9px] font-extrabold" style={{ width: 16, height: 16, background: '#D99A00', color: '#fff', border: '1.5px solid #fff' }}>C</span>
              )}
            </div>
            <div className="mt-1 px-1.5 py-0.5 rounded-md flex items-center gap-1 whitespace-nowrap" style={{ background: 'rgba(10,31,68,0.82)' }}>
              <span className="text-[10px] font-bold text-white leading-none">{p.name.split(' ').slice(-1)[0]}</span>
              <span className="font-num text-[9px] leading-none" style={{ color: '#7DE2FC' }}>${p.price}M</span>
            </div>
            {out && <div className="text-[8px] font-bold mt-0.5" style={{ color: '#ffd0c6' }}>OUT {exit}</div>}
          </button>
        );
      })}

      {/* Empty-state hint */}
      {myTeam.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: 'rgba(10,31,68,0.75)', color: '#fff' }}>
            {phase === 'draft' ? 'Your court is empty — go to the Market' : 'No squad'}
          </div>
        </div>
      )}
    </div>
  );
}
