import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { useProfile } from '../store/profileStore';
import { useLeagueBoard } from '../data/leagueBoard';
import { getPlayer } from '../data/players';
import { ROUNDS } from '../data/tournament';
import { lastName } from '../data/format';
import SquadCourt from '../components/SquadCourt';
import PlayerAvatar from '../components/PlayerAvatar';
import { toast } from '../store/toastStore';
import type { Transfer } from '../types';

const roundShort = (id: string) => ROUNDS.find(r => r.id === id)?.short ?? id;

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
  const { myTeam, initialSquad, transfers, captain, budget, myScore, viewTeam, setActiveTab } = useGameStore();
  const { teamName, teamEmblem, username } = useProfile();
  // Real league members come from the public board (everyone is a member of it).
  const board = useLeagueBoard(null);

  if (viewTeam === 'you') {
    return (
      <TeamView
        key="you"
        emblem={teamEmblem} name={teamName} manager={username ? `@${username}` : '@you'} color="var(--blue)"
        score={myScore} budget={budget} squad={myTeam} captainId={captain ?? myTeam[0] ?? ''} editable
        initialSquad={initialSquad} transfers={transfers}
      />
    );
  }

  // Another manager: resolve their squad from the league board (fixes the blank page).
  const entry = board.find(e => e.id === viewTeam);
  if (entry) {
    return (
      <TeamView
        key={entry.id}
        emblem={entry.emblem} name={entry.name} manager={entry.manager} color={entry.color}
        score={entry.score} budget={entry.budget} squad={entry.squad}
        captainId={entry.captain ?? ''} viceCaptainId={entry.viceCaptain ?? ''}
      />
    );
  }

  // Not in the board yet (still loading, or a stale link) — a friendly fallback.
  return (
    <div className="max-w-3xl mx-auto px-3 py-10 text-center fade-in">
      <div className="text-4xl mb-3">🎾</div>
      <p className="text-sm mb-4" style={{ color: 'var(--ink-2)' }}>This team isn't in your league yet, or is still loading.</p>
      <button onClick={() => setActiveTab('league')} className="text-sm font-semibold" style={{ color: 'var(--blue)' }}>‹ Back to League</button>
    </div>
  );
}

function TeamView({ emblem, name, manager, color, score, budget, squad, captainId, viceCaptainId, editable, initialSquad = [], transfers = [] }: {
  emblem: string; name: string; manager: string; color: string;
  score: number; budget: number; squad: string[]; captainId: string; viceCaptainId?: string; editable?: boolean;
  initialSquad?: string[]; transfers?: Transfer[];
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
      {editable ? <SquadCourt /> : <SquadCourt squad={squad} captainId={captainId} viceCaptainId={viceCaptainId} readOnly />}
      <div className="text-[11px] mt-2 text-center" style={{ color: 'var(--ink-3)' }}>
        {editable
          ? <>Tap a <b>+</b> to buy players · tap a player for their profile · <span style={{ color: 'var(--gold)' }}>⭐ = captain</span></>
          : <>Tap a player to see their profile · <span style={{ color: 'var(--gold)' }}>⭐ = captain</span></>}
      </div>

      <TransferHistory initialSquad={initialSquad.length ? initialSquad : squad} transfers={transfers} />
    </div>
  );
}

// Who they signed at the draft, and every mid-tournament swap since — visible on
// any team so the whole league can see who bought whom, and when. Chips open the
// player's profile.
function TransferHistory({ initialSquad, transfers }: { initialSquad: string[]; transfers: Transfer[] }) {
  const openPlayer = useGameStore(s => s.openPlayer);
  const draftSpend = initialSquad.reduce((s, id) => s + getPlayer(id).price, 0);

  const chip = (id: string, tone: 'in' | 'out' | 'neutral') => {
    const p = getPlayer(id);
    const color = tone === 'out' ? 'var(--ember)' : tone === 'in' ? 'var(--green)' : 'var(--ink)';
    const bg = tone === 'out' ? 'rgba(229,71,43,0.08)' : tone === 'in' ? 'rgba(18,161,80,0.08)' : 'var(--raised)';
    const border = tone === 'out' ? 'rgba(229,71,43,0.22)' : tone === 'in' ? 'rgba(18,161,80,0.22)' : 'rgba(10,27,51,0.1)';
    return (
      <button
        onClick={() => openPlayer(id)}
        className="inline-flex items-center gap-1.5 pl-0.5 pr-2 py-0.5 rounded-full whitespace-nowrap transition-transform hover:-translate-y-px"
        style={{ background: bg, border: `1px solid ${border}` }}
        title={`View ${p.name}`}
      >
        <PlayerAvatar playerId={id} name={p.name} size="sm" ring={false} />
        <span className="text-[11px] font-semibold" style={{ color, textDecoration: tone === 'out' ? 'line-through' : 'none' }}>{lastName(p.name)}</span>
        <span className="font-num text-[10px]" style={{ color: 'var(--ink-3)' }}>${p.price}M</span>
      </button>
    );
  };

  return (
    <div className="rounded-2xl mt-5 overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid rgba(10,27,51,0.08)' }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(10,27,51,0.06)' }}>
        <h2 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Transfer history</h2>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(14,111,196,0.1)', color: 'var(--blue)' }}>{transfers.length} transfer{transfers.length === 1 ? '' : 's'}</span>
      </div>

      <div className="p-4">
        {/* Draft signings */}
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>Signed at the draft</div>
          <div className="font-num text-[11px]" style={{ color: 'var(--ink-3)' }}>${draftSpend}M spent</div>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {initialSquad.map(id => <span key={id}>{chip(id, 'neutral')}</span>)}
        </div>

        {/* In-tournament moves — a timeline */}
        <div className="text-[10px] font-bold uppercase tracking-wide mb-2.5" style={{ color: 'var(--ink-3)' }}>In-tournament moves</div>
        {transfers.length === 0 ? (
          <div className="rounded-xl px-3 py-4 text-center text-[12px]" style={{ background: 'var(--raised)', color: 'var(--ink-3)' }}>
            No transfers yet — this squad is exactly as drafted.
          </div>
        ) : (
          <div className="space-y-2">
            {transfers.map((t, i) => (
              <div key={i} className="flex items-center gap-2.5 flex-wrap rounded-xl px-3 py-2" style={{ background: 'var(--raised)', border: '1px solid rgba(10,27,51,0.06)' }}>
                <span className="text-[10px] font-extrabold px-2 py-1 rounded-md shrink-0 font-num" style={{ background: 'var(--blue)', color: '#fff' }}>{roundShort(t.round)}</span>
                {chip(t.out, 'out')}
                <span className="text-xs" style={{ color: 'var(--ink-3)' }}>→</span>
                {chip(t.in, 'in')}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
