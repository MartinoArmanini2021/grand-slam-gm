import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { useProfile } from '../store/profileStore';
import { getRivalTeams } from '../data/rivals';
import SquadCourt from '../components/SquadCourt';
import { toast } from '../store/toastStore';

const EMBLEMS = ['🎾', '🏆', '🔥', '⚡', '⭐', '🦅', '🦁', '🐉', '🐺', '🦈', '🌌', '🌱', '⚔️', '🛡️', '👑', '🚀', '💎', '🎯', '🏹', '⚜️', '🌊', '☄️', '🐯', '🍀'];

function BackToLeague() {
  const setActiveTab = useGameStore(s => s.setActiveTab);
  return (
    <button onClick={() => setActiveTab('league')} className="inline-flex items-center gap-1 text-sm font-semibold mb-4" style={{ color: 'var(--blue)' }}>
      ‹ League
    </button>
  );
}

export default function TeamPage() {
  const { myTeam, captain, budget, myScore, currentRoundIndex, viewTeam } = useGameStore();
  const { teamName, teamEmblem, username } = useProfile();

  if (viewTeam === 'you') {
    return (
      <TeamView
        emblem={teamEmblem} name={teamName} manager={username ? `@${username}` : '@you'} color="var(--blue)"
        score={myScore} budget={budget} squad={myTeam} captainId={captain ?? myTeam[0] ?? ''} editable
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

function TeamView({ emblem, name, manager, color, score, budget, squad, captainId, editable }: {
  emblem: string; name: string; manager: string; color: string;
  score: number; budget: number; squad: string[]; captainId: string; editable?: boolean;
}) {
  const setProfile = useProfile(s => s.set);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [draftEmblem, setDraftEmblem] = useState(emblem);

  const openEditor = () => { setDraftName(name); setDraftEmblem(emblem); setEditing(true); };
  const save = () => {
    setProfile({ teamName: draftName.trim() || 'My Team', teamEmblem: draftEmblem });
    setEditing(false);
    toast('Team updated', 'good');
  };

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-3 py-6 fade-in">
      <BackToLeague />

      {/* Club header: emblem + name + username, total score at the same level */}
      <div className="rounded-2xl p-5 mb-3" style={{ background: 'linear-gradient(120deg,var(--ink),var(--navy-2))' }}>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shrink-0" style={{ background: color, boxShadow: '0 4px 14px rgba(0,0,0,0.25)' }}>
            {emblem}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-extrabold tracking-tight text-white leading-tight truncate">{name}</h1>
            <div className="text-sm font-num" style={{ color: 'var(--on-navy)' }}>{manager}</div>
          </div>
          <div className="text-right shrink-0">
            {editable && (
              <button onClick={openEditor} className="text-[11px] font-bold px-2.5 py-1 rounded-lg mb-1.5" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>
                ✎ Edit team
              </button>
            )}
            <div className="font-num text-4xl font-extrabold leading-none" style={{ color: 'var(--gold-bright)' }}>{score}</div>
            <div className="text-[10px] uppercase tracking-widest mt-1" style={{ color: 'var(--on-navy-2)' }}>Total score</div>
          </div>
        </div>
      </div>

      {/* Inline editor */}
      {editable && editing && (
        <div className="rounded-2xl p-4 mb-3 fade-in" style={{ background: '#FFFFFF', border: '1px solid rgba(14,111,196,0.3)' }}>
          <div className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--ink-2)' }}>Team name</div>
          <input
            value={draftName}
            onChange={e => setDraftName(e.target.value)}
            maxLength={24}
            placeholder="Your team name"
            className="w-full text-sm outline-none px-3 py-2.5 rounded-xl mb-4"
            style={{ background: 'var(--raised)', border: '1px solid rgba(10,27,51,0.12)', color: 'var(--ink)' }}
          />
          <div className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--ink-2)' }}>Team logo</div>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {EMBLEMS.map(em => (
              <button
                key={em}
                onClick={() => setDraftEmblem(em)}
                className="w-10 h-10 rounded-xl flex items-center justify-center text-xl transition-all"
                style={{
                  background: draftEmblem === em ? 'rgba(14,111,196,0.14)' : 'var(--raised)',
                  border: `1.5px solid ${draftEmblem === em ? 'var(--blue)' : 'rgba(10,27,51,0.08)'}`,
                }}
              >
                {em}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold" style={{ background: '#F0F3F7', color: 'var(--ink)', border: '1px solid rgba(10,27,51,0.1)' }}>Cancel</button>
            <button onClick={save} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: 'var(--blue)' }}>Save team</button>
          </div>
        </div>
      )}

      {/* Only Total Score (above) + Available Budget */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="rounded-2xl p-4 text-center" style={{ background: '#FFFFFF', border: '1px solid rgba(10,27,51,0.07)' }}>
          <div className="font-num text-2xl font-bold" style={{ color: 'var(--blue)' }}>{score}</div>
          <div className="text-[11px] mt-0.5" style={{ color: 'var(--ink-2)' }}>Total score</div>
        </div>
        <div className="rounded-2xl p-4 text-center" style={{ background: '#FFFFFF', border: '1px solid rgba(10,27,51,0.07)' }}>
          <div className="font-num text-2xl font-bold" style={{ color: 'var(--green)' }}>${budget.toFixed(1)}M</div>
          <div className="text-[11px] mt-0.5" style={{ color: 'var(--ink-2)' }}>Available budget</div>
        </div>
      </div>

      {/* The squad on court. Your own team is interactive (tap + to buy players
          during the draft); rival teams are read-only. */}
      {editable ? <SquadCourt /> : <SquadCourt squad={squad} captainId={captainId} readOnly />}
      <div className="text-[11px] mt-2 text-center" style={{ color: 'var(--ink-3)' }}>
        {editable
          ? <>Tap a <b>+</b> to buy players · tap a player for their profile · <span style={{ color: 'var(--gold)' }}>⭐ = captain</span></>
          : <>Tap a player to see their profile · <span style={{ color: 'var(--gold)' }}>⭐ = captain</span></>}
      </div>
    </div>
  );
}
