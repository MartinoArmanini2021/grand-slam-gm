import { useState, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { track } from '../data/analytics';
import { useLeagueBoard, useMyLeagues, type BoardEntry } from '../data/leagueBoard';
import { tournamentStarted, isEliminated, playerRoundPoints } from '../data/tournament';
import { fmtScore } from '../data/format';
import ScoringPendingNote from '../components/ScoringPendingNote';
import { toast } from '../store/toastStore';
import { onActivate, useVisiblePoll } from '../hooks';
import { useAuth } from '../auth/AuthProvider';
import {
  createLeague, joinLeague, deleteLeague, leaveLeague, removeMember,
  fetchLeagueMembers, type LeagueMember,
} from '../data/cloud';
import { shareInvite } from '../data/invite';
import type { RoundId } from '../types';

const MEDAL = ['#E8B923', '#AEB6C2', '#C77B3B']; // gold, silver, bronze

function RankBadge({ i }: { i: number }) {
  const top = i < 3;
  return (
    <div className="shrink-0 flex items-center justify-center font-num font-extrabold"
      style={{ width: 26, height: 26, borderRadius: 8, background: top ? MEDAL[i] : 'var(--bg)', color: top ? '#fff' : 'var(--ink-3)', fontSize: top ? 13 : 12, boxShadow: top ? `0 2px 8px ${MEDAL[i]}66, inset 0 0 0 2px rgba(255,255,255,0.35)` : 'none' }}>
      {i + 1}
    </div>
  );
}

// Private-league standings — a compact STATS table (no player faces). One row per manager,
// with the columns the league cares about: players eliminated, players purchased, correct
// captain/vice picks, total points. Your own row is highlighted so you spot it instantly.
function StatsTable({ rows }: { rows: BoardEntry[] }) {
  const { openTeam } = useGameStore();
  if (rows.length === 0) {
    return <div className="rounded-2xl px-5 py-8 text-center text-sm" style={{ background: '#fff', border: '1px solid rgba(10,27,51,0.08)', color: 'var(--ink-3)' }}>
      No squads here yet — invite friends with the code above.
    </div>;
  }
  const pending = !tournamentStarted();
  const pts = (score: number) => (pending ? '–' : fmtScore(score));
  // How many of a manager's players have been knocked out at ANY stage — every player they've ever
  // owned (drafted OR bought) who is out, counted once. This survives roster churn: a knocked-out
  // player still counts whether they're on the bench, already cashed in, or transferred away.
  const eliminated = (r: BoardEntry) => {
    const owned = new Set<string>([...(r.initialSquad?.length ? r.initialSquad : r.squad), ...r.transfers.map(t => t.in)]);
    return [...owned].filter(id => isEliminated(id)).length;
  };
  // Correct leader picks = rounds where the captain-of-record / vice actually WON that round.
  const correctLeaders = (r: BoardEntry) => {
    const won = (h: { round: string; playerId: string }) => playerRoundPoints(h.playerId, h.round as RoundId) > 0;
    return r.captainHistory.filter(won).length + r.viceCaptainHistory.filter(won).length;
  };
  const numTh = 'px-1 py-2 text-center text-[10px] sm:text-[11px] font-bold uppercase tracking-wide';
  const numTd = 'px-1 py-1.5 text-center font-num text-[13px] sm:text-sm font-bold';

  return (
    <>
      {pending && <ScoringPendingNote />}
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(10,27,51,0.08)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse bg-white">
            <thead>
              <tr style={{ background: 'var(--raised)', borderBottom: '1px solid rgba(10,27,51,0.1)' }}>
                <th className="px-1 py-2 text-center text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-3)', width: 30 }}>#</th>
                <th className="px-1 py-2 text-left text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-2)' }}>Team</th>
                <th className={numTh} style={{ color: 'var(--ember)' }} title="Players eliminated">Out</th>
                <th className={numTh} style={{ color: 'var(--ink-2)' }} title="Players purchased">Buys</th>
                <th className={numTh} style={{ color: 'var(--gold)' }} title="Correct captain + vice-captain picks">C+V</th>
                <th className="px-1 py-2 text-right text-[10px] sm:text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--green)' }}><span className="sm:hidden">$</span><span className="hidden sm:inline">Budget</span></th>
                <th className="px-1 sm:px-3 py-2 text-right text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--blue)' }}>Pts</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={row.id}
                  onClick={() => openTeam(row.id)}
                  role="button" tabIndex={0} onKeyDown={onActivate(() => openTeam(row.id))}
                  className="cursor-pointer transition-colors"
                  style={{
                    borderBottom: '1px solid rgba(10,27,51,0.05)',
                    background: row.you ? 'rgba(14,111,196,0.10)' : 'transparent',
                    boxShadow: row.you ? 'inset 3px 0 0 var(--blue)' : 'none',
                  }}
                  onMouseEnter={e => { if (!row.you) (e.currentTarget as HTMLElement).style.background = 'rgba(10,27,51,0.02)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = row.you ? 'rgba(14,111,196,0.10)' : 'transparent'; }}
                >
                  <td className="px-1 py-1.5"><div className="flex justify-center"><RankBadge i={i} /></div></td>
                  <td className="px-1 py-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-6 h-6 rounded-lg flex items-center justify-center text-xs shrink-0" style={{ background: `${row.color}1a`, border: `1px solid ${row.color}55` }}>{row.emblem}</span>
                      <div className="min-w-0 leading-tight">
                        <div className="flex items-center gap-1">
                          <span className="font-bold text-[13px] sm:text-sm truncate" style={{ color: 'var(--ink)' }}>{row.name}</span>
                          {row.you && <span className="text-[8px] font-bold px-1 py-0.5 rounded shrink-0" style={{ background: 'var(--blue)', color: '#fff' }}>YOU</span>}
                        </div>
                        <div className="text-[10px] truncate" style={{ color: 'var(--ink-3)' }}>{row.manager}</div>
                      </div>
                    </div>
                  </td>
                  <td className={numTd} style={{ color: eliminated(row) > 0 ? 'var(--ember)' : 'var(--ink-3)' }}>{eliminated(row)}</td>
                  <td className={numTd} style={{ color: row.transfers.length > 0 ? 'var(--ink)' : 'var(--ink-3)' }}>{row.transfers.length}</td>
                  <td className={numTd} style={{ color: correctLeaders(row) > 0 ? 'var(--gold)' : 'var(--ink-3)' }}>{pending ? '–' : correctLeaders(row)}</td>
                  <td className="px-1 py-1.5 text-right font-num text-[12px] sm:text-[13px] font-semibold whitespace-nowrap" style={{ color: 'var(--green)' }}><span className="sm:hidden">${Math.round(row.budget)}</span><span className="hidden sm:inline">${row.budget.toFixed(1)}M</span></td>
                  <td className="px-1 sm:px-3 py-1.5 text-right font-num text-base sm:text-lg font-extrabold whitespace-nowrap" style={{ color: 'var(--blue)' }}>{pts(row.score)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="text-[10px] mt-2 px-1" style={{ color: 'var(--ink-3)' }}>
        <b>Out</b> = players eliminated · <b>Buys</b> = players purchased · <b>C+V ✓</b> = correct captain &amp; vice picks
      </div>
    </>
  );
}

// The public global board, isolated in its own component so its 20s poll only runs while
// the Public tab is actually on screen (not in the background during Private view).
function PublicBoard() {
  const publicBoard = useLeagueBoard(null);
  return (
    <>
      <h2 className="text-sm font-bold mb-2.5 px-1" style={{ color: 'var(--ink-2)' }}>🌍 Grand Slam Open League · {publicBoard.length} manager{publicBoard.length === 1 ? '' : 's'}</h2>
      <StatsTable rows={publicBoard} />
    </>
  );
}

export default function LeaguePage() {
  // Land on the Private Leagues view first — the friends board is the emotional core here.
  const [view, setView] = useState<'public' | 'private'>('private');

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-3 py-6 fade-in">
      {/* Public / Private selector — compact single-line toggle */}
      <div className="grid grid-cols-2 mb-4 rounded-xl overflow-hidden" style={{ border: '1px solid rgba(10,27,51,0.1)' }}>
        {([['public', '🌍', 'Public Leagues'], ['private', '🔒', 'Private Leagues']] as const).map(([v, icon, label], i) => {
          const active = view === v;
          return (
            <button key={v} onClick={() => setView(v)} className="px-3 py-2.5 flex items-center justify-center gap-2 transition-all"
              style={{ background: active ? 'linear-gradient(120deg,var(--ink),var(--navy-2))' : '#FFFFFF', borderLeft: i === 1 ? '1px solid rgba(10,27,51,0.1)' : 'none' }}>
              <span className="text-base">{icon}</span>
              <span className="font-extrabold text-sm" style={{ color: active ? '#fff' : 'var(--ink)' }}>{label}</span>
            </button>
          );
        })}
      </div>

      {view === 'public' ? (
        <PublicBoard />
      ) : (
        <PrivateLeagues />
      )}
    </div>
  );
}

function PrivateLeagues() {
  const { user, enabled } = useAuth();

  const [nonce, setNonce] = useState(0);
  const leagues = useMyLeagues(nonce);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [members, setMembers] = useState<LeagueMember[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const board = useLeagueBoard(selected);

  useEffect(() => {
    if (leagues.length && (!selected || !leagues.some(l => l.id === selected))) setSelected(leagues[0].id);
    if (!leagues.length) setSelected(null);
  }, [leagues, selected]);

  useEffect(() => {
    setConfirmDelete(false);
    if (!selected) { setMembers([]); return; }
    let cancelled = false;
    void fetchLeagueMembers(selected).then(m => { if (!cancelled) setMembers(m); });
    return () => { cancelled = true; };
  }, [selected, nonce]);
  // Poll so a friend who just joined shows up within ~20s — jittered + paused while the tab
  // is hidden (see useVisiblePoll), matching the leaderboard's refresh cadence.
  useVisiblePoll(() => { if (selected) void fetchLeagueMembers(selected).then(setMembers); }, 20000, !!selected);

  const refresh = () => setNonce(n => n + 1);
  const current = leagues.find(l => l.id === selected) ?? null;
  const isOwner = !!current && current.ownerId === user?.id;
  // Private leagues can only be created/joined BEFORE the competition starts. Once it's underway
  // the create + join boxes come out — the field is set.
  const started = tournamentStarted();

  const header = (
    <p className="text-xs mb-4 px-1" style={{ color: 'var(--ink-3)' }}>Invite-only — each private league is seen only by its members.</p>
  );

  if (!user) {
    return (
      <>
        {header}
        <div className="rounded-2xl p-8 text-center" style={{ background: '#fff', border: '1px solid rgba(10,27,51,0.09)' }}>
          <div className="text-4xl mb-3">🔒</div>
          <p className="text-sm max-w-sm mx-auto" style={{ color: 'var(--ink-2)' }}>
            {enabled ? 'Sign in to create a private league and invite friends by code.' : 'Private leagues need an account.'}
          </p>
        </div>
      </>
    );
  }

  const doCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) { toast('Give your league a name first', 'warn'); return; } // no blank/whitespace leagues
    setBusy(true);
    try { const { code: c } = await createLeague(trimmed); setName(''); track('league_created'); toast(`Created — invite code ${c}`, 'good'); refresh(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not create the league', 'warn'); }
    finally { setBusy(false); }
  };
  const doJoin = async () => {
    setBusy(true);
    try { const { name: n } = await joinLeague(code); setCode(''); track('league_joined'); toast(`Joined ${n}!`, 'good'); refresh(); }
    catch { toast('No league found with that code', 'warn'); }
    finally { setBusy(false); }
  };
  const doDelete = async () => {
    if (!selected) return;
    setBusy(true);
    try { await deleteLeague(selected); toast('League deleted', 'info'); setSelected(null); refresh(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not delete', 'warn'); }
    finally { setBusy(false); }
  };
  const doLeave = async () => {
    if (!selected) return;
    setBusy(true);
    try { await leaveLeague(selected); toast('Left the league', 'info'); setSelected(null); refresh(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not leave', 'warn'); }
    finally { setBusy(false); }
  };
  const doKick = async (uid: string) => {
    if (!selected) return;
    try { await removeMember(selected, uid); toast('Member removed', 'info'); refresh(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not remove', 'warn'); }
  };

  const copy = (text: string) => { track('invite_copied'); navigator.clipboard?.writeText(text).then(() => toast('Copied', 'good')); };

  return (
    <>
      {header}

      {/* Create + Join — only BEFORE the competition starts. Removed once it's underway. */}
      {!started && (
        <div className="grid sm:grid-cols-2 gap-2.5 sm:gap-3 mb-4">
          <div className="rounded-2xl p-2.5 sm:p-4" style={{ background: '#fff', border: '1px solid rgba(10,27,51,0.09)' }}>
            <div className="text-[10px] sm:text-xs font-bold uppercase tracking-wide mb-1.5 sm:mb-2" style={{ color: 'var(--ink-2)' }}>Create a league</div>
            <div className="flex gap-2">
              <input value={name} onChange={e => setName(e.target.value)} placeholder="League name" className="flex-1 min-w-0 text-sm px-3 py-1.5 sm:py-2 rounded-xl" style={{ background: 'var(--raised)', border: '1px solid rgba(10,27,51,0.12)', color: 'var(--ink)' }} />
              <button onClick={doCreate} disabled={busy} className="px-3 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-bold text-white shrink-0 disabled:opacity-60" style={{ background: 'var(--blue)' }}>Create</button>
            </div>
          </div>
          <div className="rounded-2xl p-2.5 sm:p-4" style={{ background: '#fff', border: '1px solid rgba(10,27,51,0.09)' }}>
            <div className="text-[10px] sm:text-xs font-bold uppercase tracking-wide mb-1.5 sm:mb-2" style={{ color: 'var(--ink-2)' }}>Join with a code</div>
            <div className="flex gap-2">
              <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="6-char code" maxLength={6} className="flex-1 min-w-0 text-sm px-3 py-1.5 sm:py-2 rounded-xl font-num tracking-widest uppercase" style={{ background: 'var(--raised)', border: '1px solid rgba(10,27,51,0.12)', color: 'var(--ink)' }} />
              <button onClick={doJoin} disabled={busy || code.length !== 6} className="px-3 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-bold shrink-0 disabled:opacity-60" style={{ background: 'rgba(14,111,196,0.1)', color: 'var(--blue)' }}>Join</button>
            </div>
          </div>
        </div>
      )}

      {leagues.length === 0 ? (
        <p className="text-center text-sm py-8" style={{ color: 'var(--ink-3)' }}>
          {started
            ? 'Private leagues are closed — the tournament has started. You can still follow the public leaderboard.'
            : "You're not in any leagues yet. Create one and share the code with a friend."}
        </p>
      ) : (
        <>
          {/* Switcher */}
          <div className="flex gap-2 flex-wrap mb-3">
            {leagues.map(l => (
              <button key={l.id} onClick={() => setSelected(l.id)} className="px-3 py-1.5 rounded-xl text-sm font-bold transition-colors"
                style={selected === l.id ? { background: 'var(--ink)', color: '#fff' } : { background: '#fff', color: 'var(--ink-2)', border: '1px solid rgba(10,27,51,0.12)' }}>
                {l.name}
              </button>
            ))}
          </div>

          {current && (
            <>
              <div className="flex items-center justify-between px-1 flex-wrap gap-2 mb-2">
                <h2 className="text-sm font-bold" style={{ color: 'var(--ink-2)' }}>{current.name} · {members.length} member{members.length === 1 ? '' : 's'}</h2>
              </div>

              {/* Invite CTA — only BEFORE the tournament starts. Once it's underway a private
                  league can't be joined, so the banner comes out. */}
              {!started && current.code && (
                <div className="rounded-2xl p-3 mb-3 flex items-center gap-3" style={{ background: 'linear-gradient(120deg,rgba(14,111,196,0.10),rgba(18,161,80,0.08))', border: '1px solid rgba(14,111,196,0.22)' }}>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-extrabold" style={{ color: 'var(--ink)' }}>Invite your friends 🎾</div>
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--ink-2)' }}>
                      Share the link, or give them the code <button onClick={() => copy(current.code!)} className="font-num font-bold tracking-widest" style={{ color: 'var(--blue)' }} title="Copy code">{current.code} ⧉</button>
                    </div>
                  </div>
                  <button onClick={() => shareInvite(current.name, current.code!)} className="shrink-0 px-4 min-h-[40px] rounded-xl text-sm font-bold text-white transition-transform active:scale-[0.98]" style={{ background: 'var(--blue)', boxShadow: '0 6px 16px rgba(14,111,196,0.35)' }}>
                    Invite friends
                  </button>
                </div>
              )}

              <StatsTable rows={board} />

              {/* Manage */}
              <div className="mt-4 rounded-2xl p-4" style={{ background: '#fff', border: '1px solid rgba(10,27,51,0.09)' }}>
                <div className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--ink-2)' }}>
                  {isOwner ? 'Manage league' : 'Membership'}
                </div>
                {isOwner ? (
                  <>
                    <div className="space-y-1.5 mb-3">
                      {members.map(m => (
                        <div key={m.userId} className="flex items-center gap-2 px-2 py-1.5 rounded-lg" style={{ background: 'var(--raised)' }}>
                          <span className="w-7 h-7 rounded-lg flex items-center justify-center text-base shrink-0" style={{ background: 'rgba(14,111,196,0.08)' }}>{m.teamEmblem}</span>
                          <span className="flex-1 min-w-0 text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>
                            {m.teamName} {m.userId === user.id && <span className="text-[10px] font-bold" style={{ color: 'var(--blue)' }}>(you · owner)</span>}
                          </span>
                          {m.userId !== user.id && (
                            <button onClick={() => doKick(m.userId)} className="text-[11px] font-bold px-2 py-1 rounded-lg shrink-0" style={{ background: 'rgba(229,71,43,0.1)', color: 'var(--ember)' }}>Remove</button>
                          )}
                        </div>
                      ))}
                    </div>
                    {!confirmDelete ? (
                      <button onClick={() => setConfirmDelete(true)} className="text-sm font-semibold" style={{ color: 'var(--ember)' }}>Delete this league</button>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm" style={{ color: 'var(--ink-2)' }}>Delete “{current.name}” for everyone?</span>
                        <button onClick={() => setConfirmDelete(false)} className="text-sm font-semibold px-3 py-1.5 rounded-lg" style={{ background: 'rgba(10,27,51,0.05)', color: 'var(--ink-2)' }}>Cancel</button>
                        <button onClick={doDelete} disabled={busy} className="text-sm font-bold px-3 py-1.5 rounded-lg text-white" style={{ background: 'var(--ember)' }}>Delete</button>
                      </div>
                    )}
                  </>
                ) : (
                  <button onClick={doLeave} disabled={busy} className="text-sm font-bold px-3 py-1.5 rounded-lg" style={{ background: 'rgba(229,71,43,0.1)', color: 'var(--ember)' }}>Leave this league</button>
                )}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
