import { useGameStore } from '../store/gameStore';
import { getRivalTeams } from '../data/rivals';
import SquadCourt from '../components/SquadCourt';

function BackToLeague() {
  const setActiveTab = useGameStore(s => s.setActiveTab);
  return (
    <button onClick={() => setActiveTab('league')} className="inline-flex items-center gap-1 text-sm font-semibold mb-4" style={{ color: '#0e6fc4' }}>
      ‹ League
    </button>
  );
}

export default function TeamPage() {
  const { myTeam, captain, budget, myScore, currentRoundIndex, viewTeam } = useGameStore();

  if (viewTeam === 'you') {
    if (myTeam.length === 0) {
      return (
        <div className="max-w-4xl mx-auto px-4 py-20 text-center fade-in">
          <div className="text-5xl mb-4">🎾</div>
          <h2 className="text-xl font-bold mb-2" style={{ color: '#0a1f44' }}>No squad yet</h2>
          <p className="text-sm" style={{ color: '#5B6B84' }}>Head to the Market tab to pick your 6 players.</p>
        </div>
      );
    }
    return (
      <TeamView
        emblem="🎾" name="You" manager="@you" color="#0e6fc4"
        score={myScore} budget={budget} squad={myTeam} captainId={captain ?? myTeam[0]}
      />
    );
  }

  const team = getRivalTeams(currentRoundIndex).find(t => t.rival.id === viewTeam);
  if (!team) return null;
  return (
    <TeamView
      emblem={team.rival.emblem} name={team.rival.name} manager={team.rival.manager} color={team.rival.color}
      score={team.score} budget={team.budget} squad={team.squad} captainId={team.captainId}
    />
  );
}

function TeamView({ emblem, name, manager, color, score, budget, squad, captainId }: {
  emblem: string; name: string; manager: string; color: string;
  score: number; budget: number; squad: string[]; captainId: string;
}) {
  return (
    <div className="max-w-4xl mx-auto px-4 py-6 fade-in">
      <BackToLeague />

      {/* Club header: emblem + name + username, total score at the same level */}
      <div className="rounded-2xl p-5 mb-3" style={{ background: 'linear-gradient(120deg,#0a1f44,#123163)' }}>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shrink-0" style={{ background: color, boxShadow: '0 4px 14px rgba(0,0,0,0.25)' }}>
            {emblem}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-extrabold tracking-tight text-white leading-tight truncate">{name}</h1>
            <div className="text-sm font-num" style={{ color: '#AFBFDA' }}>{manager}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-num text-4xl font-extrabold leading-none" style={{ color: '#F0C24B' }}>{score}</div>
            <div className="text-[10px] uppercase tracking-widest mt-1" style={{ color: '#8FA1BE' }}>Total score</div>
          </div>
        </div>
      </div>

      {/* Only Total Score (above) + Available Budget */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="rounded-2xl p-4 text-center" style={{ background: '#FFFFFF', border: '1px solid rgba(10,27,51,0.07)' }}>
          <div className="font-num text-2xl font-bold" style={{ color: '#0e6fc4' }}>{score}</div>
          <div className="text-[11px] mt-0.5" style={{ color: '#5B6B84' }}>Total score</div>
        </div>
        <div className="rounded-2xl p-4 text-center" style={{ background: '#FFFFFF', border: '1px solid rgba(10,27,51,0.07)' }}>
          <div className="font-num text-2xl font-bold" style={{ color: '#12A150' }}>${budget.toFixed(1)}M</div>
          <div className="text-[11px] mt-0.5" style={{ color: '#5B6B84' }}>Available budget</div>
        </div>
      </div>

      {/* The squad, laid out on court — names + values on each pill */}
      <SquadCourt squad={squad} captainId={captainId} readOnly />
      <div className="text-[11px] mt-2 text-center" style={{ color: '#9AA7BC' }}>
        Tap a player to see their profile · <span style={{ color: '#D99A00' }}>⭐ = captain</span>
      </div>
    </div>
  );
}
