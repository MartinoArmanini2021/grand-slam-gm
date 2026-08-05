import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { useProfile } from '../store/profileStore';
import { useLeagueBoard } from '../data/leagueBoard';
import { getPlayer } from '../data/players';
import { ROUNDS, playerRoundPoints, playedScoredRounds, liveScore, getPlayerExit, isInLiveDraw, tournamentStarted } from '../data/tournament';
import { lastName } from '../data/format';
import SquadCourt from '../components/SquadCourt';
import PlayerAvatar from '../components/PlayerAvatar';
import PlayerTag from '../components/PlayerTag';
import { toast } from '../store/toastStore';
import type { Transfer, RoundId } from '../types';

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
  const { myTeam, initialSquad, transfers, captain, viceCaptain, captainHistory, viceCaptainHistory, viewTeam, setActiveTab } = useGameStore();
  const { teamName, teamEmblem, username } = useProfile();
  // Real league members come from the public board (everyone is a member of it).
  const board = useLeagueBoard(null);
  // Your own total, derived live from results — score per-match like the leaderboard.
  const myScore = liveScore(initialSquad, transfers, captainHistory, viceCaptainHistory);

  if (viewTeam === 'you') {
    return (
      <TeamView
        key="you"
        emblem={teamEmblem} name={teamName} manager={username ? `@${username}` : '@you'} color="var(--blue)"
        score={myScore} squad={myTeam} captainId={captain ?? myTeam[0] ?? ''} viceCaptainId={viceCaptain ?? ''} editable
        initialSquad={initialSquad} transfers={transfers}
        captainHistory={captainHistory} viceCaptainHistory={viceCaptainHistory}
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
        score={entry.score} squad={entry.squad}
        captainId={entry.captain ?? ''} viceCaptainId={entry.viceCaptain ?? ''}
        initialSquad={entry.initialSquad} transfers={entry.transfers as Transfer[]}
        captainHistory={entry.captainHistory} viceCaptainHistory={entry.viceCaptainHistory}
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

function TeamView({ emblem, name, manager, color, score, squad, captainId, viceCaptainId, editable, initialSquad = [], transfers = [], captainHistory = [], viceCaptainHistory = [] }: {
  emblem: string; name: string; manager: string; color: string;
  score: number; squad: string[]; captainId: string; viceCaptainId?: string; editable?: boolean;
  initialSquad?: string[]; transfers?: Transfer[];
  captainHistory?: { round: string; playerId: string }[]; viceCaptainHistory?: { round: string; playerId: string }[];
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
      <div className="rounded-2xl px-4 py-3 mb-3" style={{ background: 'linear-gradient(120deg,var(--ink),var(--navy-2))' }}>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl shrink-0" style={{ background: color, boxShadow: '0 4px 14px rgba(0,0,0,0.25)' }}>
            {emblem}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-extrabold tracking-tight text-white leading-tight truncate">{name}</h1>
            <div className="text-xs font-num" style={{ color: 'var(--on-navy)' }}>{manager}</div>
          </div>
          {editable && (
            <button onClick={openEditor} className="text-[11px] font-bold px-2.5 py-1 rounded-lg shrink-0" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>✎ Edit</button>
          )}
          <div className="text-right shrink-0">
            <div className="font-num text-3xl font-extrabold leading-none" style={{ color: 'var(--gold-bright)' }}>{score}</div>
            <div className="text-[9px] uppercase tracking-widest mt-0.5" style={{ color: 'var(--on-navy-2)' }}>Points</div>
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
            className="w-full text-sm px-3 py-2.5 rounded-xl mb-4"
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

      {/* The squad on court. Your own team is interactive (tap + to buy players
          during the draft); rival teams are read-only. */}
      {editable ? <SquadCourt /> : <SquadCourt squad={squad} captainId={captainId} viceCaptainId={viceCaptainId} readOnly />}
      <div className="text-[11px] mt-2 mb-4 text-center" style={{ color: 'var(--ink-3)' }}>
        {editable
          ? <>Tap a <b>+</b> to buy players · tap a player for their profile</>
          : <>Tap a player to see their profile</>}
      </div>

      {/* Points each player has earned, round by round — shown for EVERY team (a locked squad's
          captain/transfer history is public), so you can see how any rival's points were made. */}
      <PointsByRound
        initialSquad={initialSquad.length ? initialSquad : squad}
        transfers={transfers}
        captainHistory={captainHistory}
        viceCaptainHistory={viceCaptainHistory}
      />

      {/* Transfer history — full width below the points table */}
      <div className="mt-3">
        <TransferHistory initialSquad={initialSquad.length ? initialSquad : squad} transfers={transfers} />
      </div>
    </div>
  );
}

// Points each squad member has earned, round by round — mirrors exactly what the board
// scored (win points × captain/vice multiplier, respecting who was in the squad each round
// after transfers).
function PointsByRound({ initialSquad, transfers, captainHistory, viceCaptainHistory }: {
  initialSquad: string[]; transfers: Transfer[];
  captainHistory: { round: string; playerId: string }[]; viceCaptainHistory: { round: string; playerId: string }[];
}) {
  const openPlayer = useGameStore(s => s.openPlayer);
  const rounds = playedScoredRounds();

  // The squad as it stood in a given round (initial squad + transfers logged in earlier rounds).
  const squadAt = (round: RoundId): Set<string> => {
    const ri = ROUNDS.findIndex(r => r.id === round);
    let s = [...initialSquad];
    for (const t of transfers) if (ROUNDS.findIndex(r => r.id === t.round) < ri) s = s.map(id => (id === t.out ? t.in : id));
    return new Set(s);
  };
  const squads = new Map(rounds.map(r => [r, squadAt(r)]));

  // Every player who was ever on the squad, with their per-round points + total + live status.
  const everOnSquad = [...new Set([...initialSquad, ...transfers.map(t => t.in)])];
  const rows = everOnSquad
    .map(id => {
      const cells = rounds.map(r => (squads.get(r)!.has(id) ? playerRoundPoints(id, r, captainHistory, viceCaptainHistory) : null));
      const total = cells.reduce<number>((sum, c) => sum + (c ?? 0), 0);
      const exit = getPlayerExit(id); // the scored round they lost in (null = not out in R64+)
      // A drafted player who lost the OPENING round (before R64) never enters the scored draw.
      const openingOut = !exit && tournamentStarted() && !isInLiveDraw(id);
      const outLabel = exit ? roundShort(exit) : openingOut ? '1st rd' : null;
      const stillIn = !outLabel && isInLiveDraw(id);
      return { id, cells, total, outLabel, stillIn };
    })
    // Total points first, then still-in ahead of eliminated (both descending).
    .sort((a, b) => b.total - a.total || Number(b.stillIn) - Number(a.stillIn));

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid rgba(10,27,51,0.08)' }}>
      <div className="px-4 py-3 flex items-center justify-between gap-2 flex-wrap" style={{ borderBottom: '1px solid rgba(10,27,51,0.06)' }}>
        <h2 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Points by round</h2>
        <div className="flex items-center gap-2.5 text-[10px]" style={{ color: 'var(--ink-3)' }}>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--green)' }} />still in</span>
          <span className="flex items-center gap-1"><span className="text-[8px] font-extrabold uppercase px-1 rounded" style={{ background: 'rgba(229,71,43,0.12)', color: 'var(--ember)' }}>out</span>eliminated</span>
        </div>
      </div>
      {rounds.length === 0 ? (
        <div className="px-4 py-6 text-center text-[12px]" style={{ color: 'var(--ink-3)' }}>
          No rounds scored yet — points will appear here, round by round, as your players win.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr style={{ background: 'var(--raised)', borderBottom: '1px solid rgba(10,27,51,0.1)' }}>
                <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wide sticky left-0" style={{ color: 'var(--ink-2)', background: 'var(--raised)' }}>Player</th>
                {rounds.map(r => (
                  <th key={r} className="text-center px-2 py-2 text-[10px] font-bold uppercase tracking-wide font-num" style={{ color: 'var(--ink-3)', minWidth: 40 }}>
                    {ROUNDS.find(x => x.id === r)?.short ?? r}
                  </th>
                ))}
                <th className="text-right px-3 py-2 text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--blue)' }}>Pts</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ id, cells, total, outLabel, stillIn }) => {
                const p = getPlayer(id);
                return (
                  <tr key={id} onClick={() => openPlayer(id)} className="cursor-pointer transition-colors hover:bg-black/[0.02]" style={{ borderBottom: '1px solid rgba(10,27,51,0.05)' }}>
                    {/* Player cell — same format as the Squad list: tier-ringed avatar, flag + nickname, name, price */}
                    <td className="px-3 py-1.5 sticky left-0" style={{ background: '#fff' }}>
                      <div className="flex items-center gap-2 min-w-0">
                        <PlayerAvatar playerId={id} name={p.name} size="sm" />{/* ring = tier colour */}
                        <div className="min-w-0">
                          <PlayerTag playerId={id} flag={p.flag} className="text-[8px] font-bold uppercase tracking-wide leading-tight truncate" style={{ color: 'var(--blue)' }} />
                          <div className="text-xs font-semibold leading-tight truncate flex items-center gap-1.5" style={{ color: outLabel ? 'var(--ink-3)' : 'var(--ink)' }}>
                            {p.name}
                            {outLabel
                              ? <span className="shrink-0 text-[8px] font-extrabold uppercase tracking-wide px-1 py-0.5 rounded" style={{ background: 'rgba(229,71,43,0.12)', color: 'var(--ember)' }}>out · {outLabel}</span>
                              : stillIn ? <span className="shrink-0 w-1.5 h-1.5 rounded-full" style={{ background: 'var(--green)' }} title="Still in" /> : null}
                          </div>
                          <div className="font-num text-[10px] leading-none" style={{ color: 'var(--blue)' }}>${p.price}M</div>
                        </div>
                      </div>
                    </td>
                    {cells.map((c, i) => (
                      <td key={i} className="text-center px-2 py-1.5 font-num text-xs" style={{ color: c ? 'var(--ink)' : 'var(--ink-3)', fontWeight: c ? 700 : 400 }}>
                        {c == null ? '·' : c === 0 ? '–' : c}
                      </td>
                    ))}
                    <td className="text-right px-3 py-1.5 font-num text-sm font-extrabold" style={{ color: 'var(--blue)' }}>{total}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
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
    <div className="rounded-2xl overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid rgba(10,27,51,0.08)' }}>
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
