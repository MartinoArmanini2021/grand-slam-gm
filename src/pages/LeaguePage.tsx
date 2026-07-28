import { useState, useEffect, useCallback } from 'react';
import { useGameStore } from '../store/gameStore';
import { getPlayer } from '../data/players';
import { useLeagueBoard, type BoardEntry } from '../data/leagueBoard';
import { lastName } from '../data/format';
import { ROUNDS, isPlayerOut, getPlayerExit } from '../data/tournament';
import PlayerAvatar from '../components/PlayerAvatar';
import { toast } from '../store/toastStore';
import { onActivate } from '../hooks';
import { useAuth } from '../auth/AuthProvider';
import { fetchMyLeagues, createLeague, joinLeague, type MyLeague } from '../data/cloud';
import type { RoundId } from '../types';

const MEDAL = ['#E8B923', '#AEB6C2', '#C77B3B']; // gold, silver, bronze

function RankBadge({ i }: { i: number }) {
  const top = i < 3;
  return (
    <div
      className="shrink-0 flex items-center justify-center font-num font-extrabold"
      style={{
        width: 34, height: 34, borderRadius: 10,
        background: top ? MEDAL[i] : 'var(--bg)',
        color: top ? '#fff' : 'var(--ink-3)',
        fontSize: top ? 15 : 13,
        boxShadow: top ? `0 2px 8px ${MEDAL[i]}66, inset 0 0 0 2px rgba(255,255,255,0.35)` : 'none',
      }}
    >
      {i + 1}
    </div>
  );
}

// The standings table — one row per manager. Reused by the public and private boards.
function Standings({ rows, revealed }: { rows: BoardEntry[]; revealed: RoundId[] }) {
  const { openTeam, openPlayer } = useGameStore();
  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(10,27,51,0.08)' }}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse bg-white">
          <thead>
            <tr style={{ background: 'var(--raised)', borderBottom: '1px solid rgba(10,27,51,0.1)' }}>
              <th className="text-center px-2 py-2.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-3)', width: 52 }}>#</th>
              <th className="text-left px-2 py-2.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-2)' }}>Team</th>
              <th className="text-left px-2 py-2.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-2)' }}>Squad</th>
              <th className="text-right px-2 py-2.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--green)' }}>Budget</th>
              <th className="text-right px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--blue)' }}>Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.id}
                onClick={() => openTeam(row.id)}
                role="button"
                tabIndex={0}
                onKeyDown={onActivate(() => openTeam(row.id))}
                className="cursor-pointer transition-colors align-middle"
                style={{ borderBottom: '1px solid rgba(10,27,51,0.05)', background: row.you ? 'rgba(14,111,196,0.05)' : 'transparent' }}
                onMouseEnter={e => { if (!row.you) (e.currentTarget as HTMLElement).style.background = 'rgba(10,27,51,0.02)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = row.you ? 'rgba(14,111,196,0.05)' : 'transparent'; }}
              >
                <td className="px-2 py-2.5"><div className="flex justify-center"><RankBadge i={i} /></div></td>
                <td className="px-2 py-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0" style={{ background: `${row.color}1a`, border: `1px solid ${row.color}55` }}>
                      {row.emblem}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-sm truncate" style={{ color: 'var(--ink)' }}>{row.name}</span>
                        {row.you && <span className="text-[9px] font-bold px-1 py-0.5 rounded shrink-0" style={{ background: 'var(--blue)', color: '#fff' }}>YOU</span>}
                      </div>
                      <div className="text-[11px] truncate" style={{ color: 'var(--ink-3)' }}>{row.motto}</div>
                    </div>
                  </div>
                </td>
                <td className="px-2 py-2.5">
                  <div className="flex flex-wrap gap-1.5" style={{ minWidth: 200 }}>
                    {row.squad.map(id => {
                      const out = isPlayerOut(id, revealed);
                      return (
                        <span
                          key={id}
                          role="button"
                          tabIndex={0}
                          onClick={e => { e.stopPropagation(); openPlayer(id); }}
                          onKeyDown={onActivate(() => openPlayer(id))}
                          className="inline-flex items-center gap-1.5 pl-0.5 pr-2 py-0.5 rounded-full cursor-pointer transition-transform hover:-translate-y-px"
                          style={{
                            background: out ? 'rgba(229,71,43,0.08)' : 'rgba(18,161,80,0.08)',
                            border: `1px solid ${out ? 'rgba(229,71,43,0.22)' : 'rgba(18,161,80,0.22)'}`,
                            opacity: out ? 0.7 : 1,
                          }}
                          title={out ? `Out — ${getPlayerExit(id)}` : 'Still in'}
                        >
                          <PlayerAvatar playerId={id} name={getPlayer(id).name} size="sm" />
                          <span className="text-[11px] font-semibold" style={{ color: out ? 'var(--ink-3)' : 'var(--ink)', textDecoration: out ? 'line-through' : 'none' }}>
                            {lastName(getPlayer(id).name)}
                          </span>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: out ? 'var(--ember)' : 'var(--green)', display: 'inline-block' }} />
                        </span>
                      );
                    })}
                    {row.squad.length === 0 && <span className="text-[11px] italic" style={{ color: 'var(--ink-3)' }}>No squad yet</span>}
                  </div>
                </td>
                <td className="px-2 py-2.5 text-right font-num text-[11px] font-semibold whitespace-nowrap" style={{ color: 'var(--green)' }}>${row.budget.toFixed(1)}M</td>
                <td className="px-3 py-2.5 text-right font-num text-xl font-extrabold whitespace-nowrap" style={{ color: 'var(--blue)' }}>{row.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Private leagues: create one (get a shareable code), join one by code, and see the
// standings among just its members. Requires an account.
function PrivateLeagues({ revealed }: { revealed: RoundId[] }) {
  const { user, enabled } = useAuth();
  const [leagues, setLeagues] = useState<MyLeague[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastCode, setLastCode] = useState<string | null>(null);

  const board = useLeagueBoard(selected); // null while none selected → public board (not rendered)

  const refresh = useCallback(async () => {
    const all = await fetchMyLeagues();
    const priv = all.filter(l => !l.isPublic);
    setLeagues(priv);
    setSelected(prev => prev ?? priv[0]?.id ?? null);
  }, []);

  useEffect(() => { if (user) void refresh(); }, [user, refresh]);

  if (!user) {
    return (
      <div className="rounded-2xl p-8 text-center" style={{ background: '#FFFFFF', border: '1px solid rgba(10,27,51,0.09)' }}>
        <div className="text-4xl mb-3">🔒</div>
        <h3 className="text-lg font-extrabold mb-1" style={{ color: 'var(--ink)' }}>Private Leagues</h3>
        <p className="text-sm max-w-sm mx-auto" style={{ color: 'var(--ink-2)' }}>
          {enabled ? 'Sign in to create a private league and invite friends by code.' : 'Private leagues need an account (coming with the live launch).'}
        </p>
      </div>
    );
  }

  const doCreate = async () => {
    setBusy(true);
    try {
      const { code: newCode } = await createLeague(name);
      setLastCode(newCode);
      setName('');
      toast(`League created — invite code ${newCode}`, 'good');
      await refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not create the league', 'warn');
    } finally { setBusy(false); }
  };

  const doJoin = async () => {
    setBusy(true);
    try {
      const { name: joined } = await joinLeague(code);
      setCode('');
      toast(`Joined ${joined}!`, 'good');
      await refresh();
    } catch {
      toast('No league found with that code', 'warn');
    } finally { setBusy(false); }
  };

  const current = leagues.find(l => l.id === selected) ?? null;

  return (
    <div className="space-y-4">
      {/* Create + Join */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="rounded-2xl p-4" style={{ background: '#fff', border: '1px solid rgba(10,27,51,0.09)' }}>
          <div className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--ink-2)' }}>Create a league</div>
          <div className="flex gap-2">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="League name" className="flex-1 min-w-0 text-sm outline-none px-3 py-2 rounded-xl" style={{ background: 'var(--raised)', border: '1px solid rgba(10,27,51,0.12)', color: 'var(--ink)' }} />
            <button onClick={doCreate} disabled={busy} className="px-3.5 py-2 rounded-xl text-sm font-bold text-white shrink-0 disabled:opacity-60" style={{ background: 'var(--blue)' }}>Create</button>
          </div>
          {lastCode && (
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span style={{ color: 'var(--ink-2)' }}>Invite code:</span>
              <button
                onClick={() => { navigator.clipboard?.writeText(lastCode).then(() => toast('Code copied', 'good')); }}
                className="font-num font-bold px-2 py-0.5 rounded-lg tracking-widest"
                style={{ background: 'rgba(14,111,196,0.1)', color: 'var(--blue)' }}
                title="Copy code"
              >{lastCode} ⧉</button>
            </div>
          )}
        </div>
        <div className="rounded-2xl p-4" style={{ background: '#fff', border: '1px solid rgba(10,27,51,0.09)' }}>
          <div className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--ink-2)' }}>Join with a code</div>
          <div className="flex gap-2">
            <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="6-char code" maxLength={6} className="flex-1 min-w-0 text-sm outline-none px-3 py-2 rounded-xl font-num tracking-widest uppercase" style={{ background: 'var(--raised)', border: '1px solid rgba(10,27,51,0.12)', color: 'var(--ink)' }} />
            <button onClick={doJoin} disabled={busy || code.length < 4} className="px-3.5 py-2 rounded-xl text-sm font-bold shrink-0 disabled:opacity-60" style={{ background: 'rgba(14,111,196,0.1)', color: 'var(--blue)' }}>Join</button>
          </div>
        </div>
      </div>

      {leagues.length === 0 ? (
        <p className="text-center text-sm py-6" style={{ color: 'var(--ink-3)' }}>You're not in any private leagues yet. Create one and share the code with a friend.</p>
      ) : (
        <>
          {/* League switcher */}
          <div className="flex gap-2 flex-wrap">
            {leagues.map(l => (
              <button key={l.id} onClick={() => setSelected(l.id)} className="px-3 py-1.5 rounded-xl text-sm font-bold transition-colors"
                style={selected === l.id
                  ? { background: 'var(--ink)', color: '#fff' }
                  : { background: '#fff', color: 'var(--ink-2)', border: '1px solid rgba(10,27,51,0.12)' }}>
                {l.name}
              </button>
            ))}
          </div>

          {current && (
            <>
              <div className="flex items-center justify-between px-1 flex-wrap gap-2">
                <h2 className="text-sm font-bold" style={{ color: 'var(--ink-2)' }}>{current.name} · {board.length} manager{board.length === 1 ? '' : 's'}</h2>
                {current.code && (
                  <button
                    onClick={() => { navigator.clipboard?.writeText(current.code!).then(() => toast('Invite code copied', 'good')); }}
                    className="text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5"
                    style={{ background: 'rgba(14,111,196,0.1)', color: 'var(--blue)' }}
                    title="Copy invite code to share"
                  >Invite code: <span className="font-num tracking-widest">{current.code}</span> ⧉</button>
                )}
              </div>
              <Standings rows={board} revealed={revealed} />
            </>
          )}
        </>
      )}
    </div>
  );
}

export default function LeaguePage() {
  const { myTeam, currentRoundIndex } = useGameStore();
  const [view, setView] = useState<'public' | 'private'>('public');

  const revealed = ROUNDS.slice(0, currentRoundIndex).map(r => r.id) as RoundId[];
  const publicBoard = useLeagueBoard(null);

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-3 py-6 fade-in">
      {/* Public / Private league selector — joined, no gap */}
      <div className="grid grid-cols-2 mb-5 rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(10,27,51,0.1)' }}>
        {([['public', '🌍', 'Public Leagues', 'Play against everyone'], ['private', '🔒', 'Private Leagues', 'Invite-only friends']] as const).map(([v, icon, label, sub], i) => {
          const active = view === v;
          return (
            <button
              key={v}
              onClick={() => setView(v)}
              className="px-4 py-3 text-left transition-all"
              style={{
                background: active ? 'linear-gradient(120deg,var(--ink),var(--navy-2))' : '#FFFFFF',
                borderLeft: i === 1 ? '1px solid rgba(10,27,51,0.1)' : 'none',
              }}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{icon}</span>
                <span className="font-extrabold text-sm" style={{ color: active ? '#fff' : 'var(--ink)' }}>{label}</span>
              </div>
              <div className="text-[11px] mt-0.5" style={{ color: active ? 'var(--on-navy)' : 'var(--ink-3)' }}>{sub}</div>
            </button>
          );
        })}
      </div>

      {view === 'private' ? (
        <PrivateLeagues revealed={revealed} />
      ) : (
        <>
          <div className="flex items-center justify-between mb-2.5 px-1">
            <h2 className="text-sm font-bold" style={{ color: 'var(--ink-2)' }}>Grand Slam Open League · {publicBoard.length} managers</h2>
            {myTeam.length > 0 && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(55,214,122,0.14)', color: 'var(--green)' }}>✓ You're in</span>}
          </div>
          <Standings rows={publicBoard} revealed={revealed} />
          {myTeam.length === 0 && (
            <p className="text-center text-sm mt-6" style={{ color: 'var(--ink-3)' }}>Draft your squad to join the standings.</p>
          )}
        </>
      )}
    </div>
  );
}
