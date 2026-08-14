import { useState, useEffect, useRef, useMemo, Fragment } from 'react';
import { useGameStore } from '../store/gameStore';
import { useProfile } from '../store/profileStore';
import { useLiveStore } from '../store/liveStore';
import { ROUNDS, tournamentStarted, liveScore, liveBudget, liveRoundStatus } from '../data/tournament';
import { isSquadValid, SQUAD_SIZE } from '../data/squadRules';
import { fmtScore } from '../data/format';
import { TOURNAMENT, SURFACE } from '../data/tournamentConfig';
import { onActivate } from '../hooks';
import { useLeagueBoard, useMyLeagues } from '../data/leagueBoard';
import SquadCourt from '../components/SquadCourt';
import NextMove from '../components/NextMove';
import TournamentWelcome from '../components/TournamentWelcome';
import ScoringPendingNote from '../components/ScoringPendingNote';
import type { GamePhase } from '../types';

const TEAM_TARGET = SQUAD_SIZE;

export default function HomePage({ welcome = false, onWelcomeClose }: { welcome?: boolean; onWelcomeClose?: () => void } = {}) {
  const {
    phase, myTeam,
    initialSquad, transfers, cashedIn, captainHistory, viceCaptainHistory,
    setActiveTab, openTeam,
  } = useGameStore();
  const { teamName, teamEmblem } = useProfile();

  // Your live score + budget = derived from the live results (both read the draw AND results, so
  // both are deps or the memo goes stale). Money is live like the score: refunds for eliminated
  // players (incl. opening-round exits) are already in the budget, no "play the round" step.
  const draw = useLiveStore(s => s.draw);
  const results = useLiveStore(s => s.results);
  const myScore = useMemo(
    () => liveScore(initialSquad, transfers, captainHistory, viceCaptainHistory),
    [draw, results, initialSquad, transfers, captainHistory, viceCaptainHistory],
  );
  const budget = useMemo(
    () => liveBudget(initialSquad, transfers, myTeam, cashedIn),
    [draw, results, initialSquad, transfers, myTeam, cashedIn],
  );
  const squadReady = isSquadValid(myTeam);
  // The live round in focus (from RESULTS, not the frozen currentRoundIndex): the round whose
  // captain is currently being played for. null once the whole draw is done.
  const leaderStatus = liveRoundStatus();
  const currentRound = leaderStatus ? ROUNDS.find(r => r.id === leaderStatus.round) ?? null : null;

  const myLeagues = useMyLeagues();
  const courtRef = useRef<HTMLDivElement>(null); // "Pick your captain" scrolls the coach card to the court
  // Which board to show on Home: null = the Public League; else a private league id.
  // Default to your first private league once they load, then remember your choice.
  const [boardLeague, setBoardLeague] = useState<string | null>(null);
  const defaultedLeague = useRef(false);
  useEffect(() => {
    if (!defaultedLeague.current && myLeagues.length > 0) { setBoardLeague(myLeagues[0].id); defaultedLeague.current = true; }
  }, [myLeagues]);
  const board = useLeagueBoard(boardLeague);
  const boardName = boardLeague ? (myLeagues.find(l => l.id === boardLeague)?.name ?? 'League') : 'Public League';
  const medal = (i: number) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`);

  // Show only the top slice on Home (scales to 200+ managers); if you're below it,
  // pin your own row underneath so you always see your standing.
  const LEADERBOARD_TOP = 12;
  const youIdx = board.findIndex(r => r.you);
  const topRows = board.slice(0, LEADERBOARD_TOP).map((row, i) => ({ row, rank: i, gap: false }));
  const rows = youIdx >= LEADERBOARD_TOP
    ? [...topRows, { row: board[youIdx], rank: youIdx, gap: true }]
    : topRows;

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-3 pt-3 pb-6 fade-in">

      {/* ── Header: title + meta (left) · your stats (top-right) ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-x-3 gap-y-1 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-none" style={{ color: 'var(--ink)' }}>{TOURNAMENT.edition}</h1>
            <span className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: SURFACE.accent }}>{TOURNAMENT.location.split(',')[0]} · {SURFACE.label}</span>
          </div>
          <div className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.08em] sm:tracking-[0.2em] mt-1.5" style={{ color: 'var(--ember)' }}>
            {courtStatus(phase, currentRound, leaderStatus)}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 shrink-0">
          <StatCard label="Score" value={fmtScore(myScore)} unit="points" color="var(--blue)" />
          <StatCard label="Budget" value={`$${budget.toFixed(1)}M`} unit="to spend" color="var(--ink)" />
          <StatCard
            label="Squad"
            value={`${myTeam.length}/${TEAM_TARGET}`}
            unit={phase === 'draft'
              ? (squadReady ? 'Ready ✓' : myTeam.length < TEAM_TARGET ? `${TEAM_TARGET - myTeam.length} to pick` : 'Check tiers')
              : 'in play'}
            color={phase === 'draft' ? (squadReady ? 'var(--green)' : 'var(--gold)') : 'var(--ink)'}
          />
        </div>
      </div>

      {/* ── Your next move — the always-present, phase-aware coach ── */}
      <div className="mb-4">
        <NextMove hasPrivateLeague={myLeagues.length > 0} onPickLeaders={() => courtRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })} />
      </div>

      {/* ── Court (full width, matching the other page elements) ── */}
      <div ref={courtRef}>
        <SquadCourt fluid teamName={teamName} emblem={teamEmblem} onTeamClick={() => openTeam('you')} />
      </div>
      <div className="text-[11px] mt-1.5 mb-3 text-center" style={{ color: 'var(--ink-3)' }}>
        {phase === 'draft'
          ? 'Your two captains lead on court · the other 8 sit on the bench · draft in the Market'
          : <>Tap a player to manage · <span style={{ color: 'var(--gold)' }}>C = captain ×2</span> · <span style={{ color: 'var(--blue)' }}>V = vice ×1.5</span></>}
      </div>

        {/* ── League leaderboard (below the court) ── */}
        <div className="mt-6">
        <div className="flex items-center justify-between mb-2.5 px-1 gap-2">
          {myLeagues.length > 0 ? (
            <select
              value={boardLeague ?? ''}
              onChange={e => setBoardLeague(e.target.value || null)}
              aria-label="Choose which league to show"
              className="text-sm font-bold rounded-lg px-2 py-1 max-w-[60%]"
              style={{ background: 'var(--raised)', border: '1px solid rgba(10,27,51,0.12)', color: 'var(--ink)' }}
            >
              <option value="">🌍 Public League</option>
              {myLeagues.map(l => <option key={l.id} value={l.id}>🔒 {l.name}</option>)}
            </select>
          ) : (
            <h2 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>🌍 Public League</h2>
          )}
          <button onClick={() => setActiveTab('league')} className="text-xs font-semibold shrink-0" style={{ color: 'var(--blue)' }}>
            Full standings →
          </button>
        </div>

        {board.length === 0 ? (
          <div className="text-center py-8 text-sm rounded-2xl" style={{ color: 'var(--ink-3)', background: '#FFFFFF', border: '1px solid rgba(10,27,51,0.07)' }}>
            {boardLeague ? `Draft your squad to join ${boardName}.` : 'Draft your squad to join the Public League.'}
          </div>
        ) : (
          <>
          {!tournamentStarted() && <ScoringPendingNote />}
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(10,27,51,0.08)' }}>
            <table className="w-full text-sm border-collapse bg-white">
              <thead>
                <tr style={{ background: 'var(--raised)', borderBottom: '1px solid rgba(10,27,51,0.1)' }}>
                  <th className="text-center px-2 py-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-3)', width: 44 }}>#</th>
                  <th className="text-left px-2 py-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-2)' }}>Team</th>
                  <th className="text-right px-3 py-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--blue)' }}>Pts</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ row, rank, gap }) => (
                  <Fragment key={row.id}>
                    {gap && (
                      <tr><td colSpan={3} className="text-center py-1 text-xs font-bold" style={{ color: 'var(--ink-3)' }}>⋯</td></tr>
                    )}
                    <tr
                      onClick={() => openTeam(row.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={onActivate(() => openTeam(row.id))}
                      className="cursor-pointer transition-colors"
                      style={{ borderBottom: '1px solid rgba(10,27,51,0.05)', background: row.you ? 'rgba(14,111,196,0.05)' : 'transparent' }}
                      onMouseEnter={e => { if (!row.you) (e.currentTarget as HTMLElement).style.background = 'rgba(10,27,51,0.02)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = row.you ? 'rgba(14,111,196,0.05)' : 'transparent'; }}
                    >
                      <td className="px-2 py-2 text-center font-num font-bold" style={{ color: rank < 3 ? 'var(--ink)' : 'var(--ink-3)' }}>{medal(rank)}</td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-7 h-7 rounded-lg flex items-center justify-center text-base shrink-0" style={{ background: `${row.color}1a`, border: `1px solid ${row.color}44` }}>{row.emblem}</span>
                          <span className="font-bold truncate" style={{ color: 'var(--ink)' }}>{row.name}</span>
                          {row.you && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: 'var(--blue)', color: '#fff' }}>YOU</span>}
                        </div>
                        {/* Rivalry hook: how far you are from the manager just above you. */}
                        {row.you && rank > 0 && board[rank - 1] && board[rank - 1].score > row.score && (
                          <div className="text-[10px] font-semibold mt-0.5 pl-9 truncate" style={{ color: 'var(--blue)' }}>
                            +{fmtScore(board[rank - 1].score - row.score)} to catch {board[rank - 1].name}
                          </div>
                        )}
                        {row.you && rank === 0 && row.score > 0 && (
                          <div className="text-[10px] font-semibold mt-0.5 pl-9" style={{ color: 'var(--gold)' }}>🥇 Top of the league</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-num text-base font-extrabold" style={{ color: 'var(--blue)' }}>{tournamentStarted() ? fmtScore(row.score) : '–'}</td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
            {board.length > LEADERBOARD_TOP && (
              <button onClick={() => setActiveTab('league')} className="w-full py-2 text-xs font-semibold" style={{ background: 'var(--raised)', color: 'var(--blue)', borderTop: '1px solid rgba(10,27,51,0.06)' }}>
                Top {LEADERBOARD_TOP} of {board.length} · Full standings →
              </button>
            )}
          </div>
          </>
        )}
        </div>{/* /leaderboard */}

      {/* The celebratory "you're in" moment, shown once right after joining. */}
      {welcome && (
        <TournamentWelcome
          onDone={() => onWelcomeClose?.()}
          onBuild={() => { setActiveTab('draft'); onWelcomeClose?.(); }}
        />
      )}
    </div>
  );
}

// Contextual status shown at the top of the court. Driven by the LIVE round status, not `phase`
// (frozen at 'pre_round' in production, so its round_complete/finished branches were dead code)
// and not the frozen currentRoundIndex. Three honest states, so the line can never claim a round
// is being played on the strength of an ESTIMATED start time:
//   • live     — a result exists → play is genuinely happening
//   • underway — the scheduled time has passed → picks are locked, but claim only that
//   • neither  — still open, so invite the captain pick
function courtStatus(
  phase: GamePhase,
  currentRound: { short: string } | null,
  st: { underway: boolean; live: boolean } | null,
): string {
  // Pre-tournament drafting. A mid-event sign-up is ALSO phase 'draft' but the tournament has
  // started, so fall through to the real round status rather than "about to begin".
  if (phase === 'draft' && !tournamentStarted()) return 'Tournament about to begin — choose your players';
  // No round left in focus = the whole draw is played out. (This previously fell through to '',
  // so the header went blank the moment the Final was decided.)
  if (!st || !currentRound) return 'Tournament complete — final standings';
  if (st.live) return `${currentRound.short} underway — captains locked, points are live`;
  if (st.underway) return `${currentRound.short} about to begin — captains locked`;
  return `${currentRound.short} incoming — choose your captain`;
}

function StatCard({ label, value, unit, color }: { label: string; value: string; unit: string; color: string }) {
  return (
    <div className="rounded-xl px-3 py-2 text-center sm:min-w-[96px]" style={{ background: '#FFFFFF', border: '1px solid rgba(10,27,51,0.07)' }}>
      <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-2)' }}>{label}</div>
      <div className="font-num text-xl font-bold leading-tight" style={{ color }}>{value}</div>
      <div className="text-[10px] leading-tight" style={{ color: 'var(--ink-3)' }}>{unit}</div>
    </div>
  );
}

