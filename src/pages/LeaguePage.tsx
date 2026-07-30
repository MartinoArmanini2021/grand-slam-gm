import { useState, useEffect, useRef } from 'react';
import { useGameStore } from '../store/gameStore';
import { getPlayer } from '../data/players';
import { getTier, TIER_META, TIER_ORDER, type Tier } from '../data/tiers';
import { track } from '../data/analytics';
import { useLeagueBoard, useMyLeagues, type BoardEntry } from '../data/leagueBoard';
import { lastName } from '../data/format';
import { ROUNDS, isPlayerOut, getPlayerExit } from '../data/tournament';
import PlayerAvatar from '../components/PlayerAvatar';
import { toast } from '../store/toastStore';
import { onActivate } from '../hooks';
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
      style={{ width: 34, height: 34, borderRadius: 10, background: top ? MEDAL[i] : 'var(--bg)', color: top ? '#fff' : 'var(--ink-3)', fontSize: top ? 15 : 13, boxShadow: top ? `0 2px 8px ${MEDAL[i]}66, inset 0 0 0 2px rgba(255,255,255,0.35)` : 'none' }}>
      {i + 1}
    </div>
  );
}

// The standings table — one row per manager.
function Standings({ rows, revealed, compact }: { rows: BoardEntry[]; revealed: RoundId[]; compact?: boolean }) {
  const { openTeam, openPlayer } = useGameStore();
  if (rows.length === 0) {
    return <div className="rounded-2xl px-5 py-8 text-center text-sm" style={{ background: '#fff', border: '1px solid rgba(10,27,51,0.08)', color: 'var(--ink-3)' }}>
      {compact ? 'No squads yet — draft yours to join the public leaderboard.' : 'No squads here yet — draft yours, and invite friends with the code above.'}
    </div>;
  }
  // Public league: a plain, tidy table — rank · team + @handle · score.
  if (compact) {
    return (
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(10,27,51,0.08)' }}>
        <table className="w-full text-sm border-collapse bg-white">
          <thead>
            <tr style={{ background: 'var(--raised)', borderBottom: '1px solid rgba(10,27,51,0.1)' }}>
              <th className="text-center px-2 py-2.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-3)', width: 48 }}>#</th>
              <th className="text-left px-2 py-2.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-2)' }}>Team</th>
              <th className="text-right px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--blue)' }}>Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.id} onClick={() => openTeam(row.id)} role="button" tabIndex={0} onKeyDown={onActivate(() => openTeam(row.id))}
                className="cursor-pointer transition-colors"
                style={{ borderBottom: '1px solid rgba(10,27,51,0.05)', background: row.you ? 'rgba(14,111,196,0.05)' : 'transparent' }}>
                <td className="px-2 py-2.5"><div className="flex justify-center"><RankBadge i={i} /></div></td>
                <td className="px-2 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ background: `${row.color}1a`, border: `1px solid ${row.color}44` }}>{row.emblem}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold truncate" style={{ color: 'var(--ink)' }}>{row.name}</span>
                        {row.you && <span className="text-[9px] font-bold px-1 py-0.5 rounded shrink-0" style={{ background: 'var(--blue)', color: '#fff' }}>YOU</span>}
                      </div>
                      <div className="text-[11px] truncate" style={{ color: 'var(--ink-3)' }}>{row.manager}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right font-num text-xl font-extrabold" style={{ color: 'var(--blue)' }}>{row.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <>
    {/* Mobile: a card per manager, squad grouped by tier (Platinum → Gold → Silver) */}
    <div className="lg:hidden space-y-3">
      {rows.map((row, i) => (
        <div
          key={row.id}
          onClick={() => openTeam(row.id)}
          role="button" tabIndex={0} onKeyDown={onActivate(() => openTeam(row.id))}
          className="rounded-2xl p-3 cursor-pointer"
          style={{ background: '#fff', border: `1px solid ${row.you ? 'rgba(14,111,196,0.35)' : 'rgba(10,27,51,0.08)'}` }}
        >
          <div className="flex items-center gap-2.5">
            <RankBadge i={i} />
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0" style={{ background: `${row.color}1a`, border: `1px solid ${row.color}55` }}>{row.emblem}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm truncate" style={{ color: 'var(--ink)' }}>{row.name}</span>
                {row.you && <span className="text-[9px] font-bold px-1 py-0.5 rounded shrink-0" style={{ background: 'var(--blue)', color: '#fff' }}>YOU</span>}
              </div>
              <div className="text-[11px] truncate" style={{ color: 'var(--ink-3)' }}>{row.motto || row.manager}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-num text-xl font-extrabold leading-none" style={{ color: 'var(--blue)' }}>{row.score}</div>
              <div className="font-num text-[10px]" style={{ color: 'var(--green)' }}>${row.budget.toFixed(1)}M</div>
            </div>
          </div>
          {row.squad.length === 0 ? (
            <div className="text-[11px] italic mt-2" style={{ color: 'var(--ink-3)' }}>No squad yet</div>
          ) : (
            /* One tidy row per tier — faces only */
            <div className="mt-2.5 space-y-1.5">
              {TIER_ORDER.map(tier => {
                const players = row.squad
                  .filter(id => getTier(getPlayer(id).ranking) === tier)
                  .sort((a, b) => getPlayer(a).ranking - getPlayer(b).ranking);
                if (players.length === 0) return null;
                return (
                  <div key={tier} className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded shrink-0 flex items-center justify-center text-[9px] font-extrabold text-white" style={{ background: TIER_META[tier as Tier].color }} title={tier}>{tier[0]}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {players.map(id => {
                        const p = getPlayer(id);
                        const out = isPlayerOut(id, revealed);
                        return (
                          <span key={id} role="button" tabIndex={0}
                            onClick={e => { e.stopPropagation(); openPlayer(id); }} onKeyDown={onActivate(() => openPlayer(id))}
                            className="cursor-pointer" style={{ opacity: out ? 0.45 : 1, filter: out ? 'grayscale(1)' : 'none' }}
                            title={out ? `${p.name} — out ${getPlayerExit(id)}` : p.name}>
                            <PlayerAvatar playerId={id} name={p.name} size="sm" />
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>

    {/* Desktop: the full standings table */}
    <div className="rounded-2xl overflow-hidden hidden lg:block" style={{ border: '1px solid rgba(10,27,51,0.08)' }}>
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
                role="button" tabIndex={0} onKeyDown={onActivate(() => openTeam(row.id))}
                className="cursor-pointer transition-colors align-middle"
                style={{ borderBottom: '1px solid rgba(10,27,51,0.05)', background: row.you ? 'rgba(14,111,196,0.05)' : 'transparent' }}
                onMouseEnter={e => { if (!row.you) (e.currentTarget as HTMLElement).style.background = 'rgba(10,27,51,0.02)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = row.you ? 'rgba(14,111,196,0.05)' : 'transparent'; }}
              >
                <td className="px-2 py-2.5"><div className="flex justify-center"><RankBadge i={i} /></div></td>
                <td className="px-2 py-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0" style={{ background: `${row.color}1a`, border: `1px solid ${row.color}55` }}>{row.emblem}</div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-sm truncate" style={{ color: 'var(--ink)' }}>{row.name}</span>
                        {row.you && <span className="text-[9px] font-bold px-1 py-0.5 rounded shrink-0" style={{ background: 'var(--blue)', color: '#fff' }}>YOU</span>}
                      </div>
                      <div className="text-[11px] truncate" style={{ color: 'var(--ink-3)' }}>{row.motto || row.manager}</div>
                    </div>
                  </div>
                </td>
                <td className="px-2 py-2.5">
                  {/* Uniform grid so the 10 players line up evenly (5 × 2), tier-ordered */}
                  <div className="grid grid-cols-5 gap-1.5" style={{ minWidth: 380 }}>
                    {[...row.squad].sort((a, b) => getPlayer(a).ranking - getPlayer(b).ranking).map(id => {
                      const out = isPlayerOut(id, revealed);
                      return (
                        <span key={id} role="button" tabIndex={0}
                          onClick={e => { e.stopPropagation(); openPlayer(id); }} onKeyDown={onActivate(() => openPlayer(id))}
                          className="flex items-center gap-1.5 w-full min-w-0 pl-0.5 pr-2 py-0.5 rounded-full cursor-pointer transition-transform hover:-translate-y-px"
                          style={{ background: out ? 'rgba(229,71,43,0.08)' : 'rgba(18,161,80,0.08)', border: `1px solid ${out ? 'rgba(229,71,43,0.22)' : 'rgba(18,161,80,0.22)'}`, opacity: out ? 0.7 : 1 }}
                          title={out ? `${getPlayer(id).name} — out ${getPlayerExit(id)}` : getPlayer(id).name}>
                          <PlayerAvatar playerId={id} name={getPlayer(id).name} size="sm" />
                          <span className="text-[11px] font-semibold truncate" style={{ color: out ? 'var(--ink-3)' : 'var(--ink)', textDecoration: out ? 'line-through' : 'none' }}>{lastName(getPlayer(id).name)}</span>
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
    </>
  );
}

// The public global board, isolated in its own component so its 20s poll only runs while
// the Public tab is actually on screen (not in the background during Private view).
function PublicBoard({ revealed }: { revealed: RoundId[] }) {
  const publicBoard = useLeagueBoard(null);
  return (
    <>
      <h2 className="text-sm font-bold mb-2.5 px-1" style={{ color: 'var(--ink-2)' }}>🌍 Grand Slam Open League · {publicBoard.length} manager{publicBoard.length === 1 ? '' : 's'}</h2>
      <Standings rows={publicBoard} revealed={revealed} compact />
    </>
  );
}

export default function LeaguePage() {
  const { currentRoundIndex } = useGameStore();
  const revealed = ROUNDS.slice(0, currentRoundIndex).map(r => r.id) as RoundId[];
  const [view, setView] = useState<'public' | 'private'>('public');
  // The private friends board is the emotional core for this audience — open on it
  // once we know the player belongs to a private league (until they toggle).
  const myLeagues = useMyLeagues();
  const defaultedView = useRef(false);
  useEffect(() => {
    if (!defaultedView.current && myLeagues.length > 0) { setView('private'); defaultedView.current = true; }
  }, [myLeagues]);

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-3 py-6 fade-in">
      {/* Public / Private selector */}
      <div className="grid grid-cols-2 mb-5 rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(10,27,51,0.1)' }}>
        {([['public', '🌍', 'Public Leagues', 'Play against everyone'], ['private', '🔒', 'Private Leagues', 'Invite-only friends']] as const).map(([v, icon, label, sub], i) => {
          const active = view === v;
          return (
            <button key={v} onClick={() => setView(v)} className="px-4 py-3 text-left transition-all"
              style={{ background: active ? 'linear-gradient(120deg,var(--ink),var(--navy-2))' : '#FFFFFF', borderLeft: i === 1 ? '1px solid rgba(10,27,51,0.1)' : 'none' }}>
              <div className="flex items-center gap-2">
                <span className="text-lg">{icon}</span>
                <span className="font-extrabold text-sm" style={{ color: active ? '#fff' : 'var(--ink)' }}>{label}</span>
              </div>
              <div className="text-[11px] mt-0.5" style={{ color: active ? 'var(--on-navy)' : 'var(--ink-3)' }}>{sub}</div>
            </button>
          );
        })}
      </div>

      {view === 'public' ? (
        <PublicBoard revealed={revealed} />
      ) : (
        <PrivateLeagues revealed={revealed} />
      )}
    </div>
  );
}

function PrivateLeagues({ revealed }: { revealed: RoundId[] }) {
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
    const load = () => { void fetchLeagueMembers(selected).then(m => { if (!cancelled) setMembers(m); }); };
    load();
    // Poll so a friend who just joined shows up in the member list + count within ~20s,
    // matching the leaderboard's own refresh cadence (no manual reload needed).
    const t = setInterval(load, 20000);
    return () => { cancelled = true; clearInterval(t); };
  }, [selected, nonce]);

  const refresh = () => setNonce(n => n + 1);
  const current = leagues.find(l => l.id === selected) ?? null;
  const isOwner = !!current && current.ownerId === user?.id;

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
    setBusy(true);
    try { const { code: c } = await createLeague(name); setName(''); track('league_created'); toast(`Created — invite code ${c}`, 'good'); refresh(); }
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

      {/* Create + Join */}
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

      {leagues.length === 0 ? (
        <p className="text-center text-sm py-8" style={{ color: 'var(--ink-3)' }}>You're not in any leagues yet. Create one and share the code with a friend.</p>
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

              {/* Invite CTA — a real shareable link (native share sheet on mobile), with the
                  code shown for manual entry. This is the app's viral loop, so it's prominent. */}
              {current.code && (
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

              <Standings rows={board} revealed={revealed} />

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
