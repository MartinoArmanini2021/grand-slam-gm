import { useState, useEffect, useRef, useMemo, Fragment } from 'react';
import { useGameStore } from '../store/gameStore';
import { useProfile } from '../store/profileStore';
import { useLiveStore } from '../store/liveStore';
import { ROUNDS, isPlayerOut, roundPlayable, tournamentStarted, liveScore } from '../data/tournament';
import { isSquadValid, SQUAD_SIZE } from '../data/squadRules';
import { TOURNAMENT, SURFACE } from '../data/tournamentConfig';
import { onActivate } from '../hooks';
import { toast } from '../store/toastStore';
import { useLeagueBoard, useMyLeagues } from '../data/leagueBoard';
import SquadCourt from '../components/SquadCourt';
import TournamentWelcome from '../components/TournamentWelcome';
import Countdown from '../components/Countdown';
import ScoringPendingNote from '../components/ScoringPendingNote';
import { shareInvite } from '../data/invite';
import type { GamePhase, RoundId } from '../types';

const TEAM_TARGET = SQUAD_SIZE;

export default function HomePage({ welcome = false, onWelcomeClose }: { welcome?: boolean; onWelcomeClose?: () => void } = {}) {
  const {
    phase, myTeam, budget, currentRoundIndex,
    initialSquad, transfers, captainHistory, viceCaptainHistory,
    roundScores, setActiveTab, openTeam, playNextRound, continueToNextRound,
  } = useGameStore();
  const { teamName, teamEmblem } = useProfile();

  // Your live score = the SAME per-match total the server scores + the leaderboard shows —
  // recomputed as each result lands (subscribe to the live results so it stays current).
  const results = useLiveStore(s => s.results);
  const myScore = useMemo(
    () => liveScore(initialSquad, transfers, captainHistory, viceCaptainHistory),
    [results, initialSquad, transfers, captainHistory, viceCaptainHistory],
  );

  const squadReady = isSquadValid(myTeam);
  const currentRound = currentRoundIndex < ROUNDS.length ? ROUNDS[currentRoundIndex] : null;
  // A round can only be played once its real-world results are in the live feed. Until
  // then the banner shows "awaiting results" instead of an enabled (no-op) Play button.
  const playable = currentRound ? roundPlayable(currentRoundIndex) : false;
  const revealedRounds = ROUNDS.slice(0, currentRoundIndex).map(r => r.id) as RoundId[];
  const activePlayers = myTeam.filter(id => !isPlayerOut(id, revealedRounds));
  const winRate = roundScores.length > 0
    ? Math.round(roundScores.reduce((a, b) => a + (b.points > 0 ? 1 : 0), 0) / roundScores.length * 100)
    : null;

  const myLeagues = useMyLeagues();
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

  // Play the upcoming round right from Home (captains are set on the court above).
  const playRound = () => {
    if (!currentRound || !roundPlayable(currentRoundIndex)) return; // not live yet → no-op, no false toast
    const label = currentRound.label;
    const before = useGameStore.getState().roundScores.length;
    playNextRound();
    const rs = useGameStore.getState().roundScores;
    if (rs.length <= before) return; // nothing was actually scored → don't toast a stale round
    const last = rs[rs.length - 1];
    toast(last.points > 0 ? `+${last.points} in the ${label}! 🎾` : `No points in the ${label}`, last.points > 0 ? 'good' : 'info');
  };
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
            {courtStatus(phase, currentRound, ROUNDS[currentRoundIndex - 1]?.short)}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 shrink-0">
          <StatCard label="Score" value={`${myScore}`} unit="points" color="var(--blue)" />
          <StatCard label="Budget" value={`$${budget.toFixed(1)}M`} unit="to spend" color="var(--ink)" />
          <StatCard
            label="Squad"
            value={`${myTeam.length}/${TEAM_TARGET}`}
            unit={squadReady ? 'Ready ✓' : myTeam.length < TEAM_TARGET ? `${TEAM_TARGET - myTeam.length} to pick` : 'Check tiers'}
            color={squadReady ? 'var(--green)' : 'var(--gold)'}
          />
        </div>
      </div>

      {/* ── Court (full width, matching the other page elements) ── */}
      <SquadCourt fluid teamName={teamName} emblem={teamEmblem} onTeamClick={() => openTeam('you')} />
      <div className="text-[11px] mt-1.5 mb-3 text-center" style={{ color: 'var(--ink-3)' }}>
        {phase === 'draft'
          ? 'Your two captains lead on court · the other 8 sit on the bench · draft in the Market'
          : <>Tap a player to manage · <span style={{ color: 'var(--gold)' }}>C = captain ×2</span> · <span style={{ color: 'var(--blue)' }}>V = vice ×1.5</span></>}
      </div>

      {/* ── Action callout ── */}
      {phase === 'draft' && (
        <ActionBanner color="var(--blue)" title={squadReady ? 'Squad ready — lock it in' : 'Build your squad'}
          body={`$${budget.toFixed(1)}M budget · ${myTeam.length}/${TEAM_TARGET} picked · 2 Platinum · 3 Gold · 5 Silver`} cta="Go to Market" onClick={() => setActiveTab('draft')} />
      )}
      {phase === 'pre_round' && currentRound && playable && (
        <ActionBanner color="var(--gold)" title={`Captains set — play the ${currentRound.label}`}
          body={`Captain ×2 · Vice ×1.5 · tap a player on court to change · ${activePlayers.length} still in`}
          cta={`▶ Play ${currentRound.short}`} onClick={playRound} />
      )}
      {phase === 'pre_round' && currentRound && !playable && (
        <ActionBanner color="var(--blue)" title={`Squad locked — waiting on the ${currentRound.label}`}
          body={`Results go live as ${TOURNAMENT.edition} is played. Your captains are set; scores post automatically.`}
          cta="⏳ Awaiting live results" onClick={() => {}} />
      )}
      {phase === 'round_complete' && currentRound && (
        <ActionBanner color="var(--green)" title={`${ROUNDS[currentRoundIndex - 1]?.label} results are in`}
          body={`${currentRound.label} is up next — set your captains`} cta={`Continue to ${currentRound.short} →`} onClick={continueToNextRound} />
      )}
      {phase === 'finished' && (
        <ActionBanner color="var(--gold)" title="Tournament complete!"
          body={`Final score ${myScore} pts${winRate !== null ? ` · ${winRate}% round win rate` : ''}`} cta="View Bracket" onClick={() => setActiveTab('tournament')} />
      )}

      {/* Deadline countdowns: lock your squad before the draft closes, and set your
          captain/vice before each round begins. */}
      {phase === 'draft' && (
        <Countdown target={TOURNAMENT.schedule?.[TOURNAMENT.rounds[0]]}
          title={squadReady ? 'Draft closes soon — lock in your squad' : 'Draft closes soon — pick your 10 & lock in'}
          note="Once it closes your squad is set for the first round." />
      )}
      {phase === 'pre_round' && currentRound && (
        <Countdown target={TOURNAMENT.schedule?.[currentRound.id]}
          title={`Set your Captain & Vice for the ${currentRound.label}`}
          note="Captain ×2 · Vice ×1.5 — they lock when the round begins." />
      )}

      {/* Virality: once you've got a squad, the fun is beating people you know. Surface the
          invite right here — share a private league link, or spin one up in one tap. */}
      {myTeam.length > 0 && (() => {
        const priv = myLeagues.find(l => !l.isPublic && l.code);
        return (
          <button
            onClick={() => (priv ? shareInvite(priv.name, priv.code!) : setActiveTab('league'))}
            className="w-full mt-3 flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-transform active:scale-[0.99]"
            style={{ background: 'linear-gradient(120deg,rgba(14,111,196,0.09),rgba(18,161,80,0.07))', border: '1px solid rgba(14,111,196,0.2)' }}
          >
            <span className="text-xl shrink-0">🤝</span>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm" style={{ color: 'var(--ink)' }}>{priv ? `Invite friends to ${priv.name}` : 'Play with friends'}</div>
              <div className="text-xs" style={{ color: 'var(--ink-2)' }}>{priv ? 'Share the link — everyone drafts, one leaderboard.' : 'Create a private league and challenge your friends.'}</div>
            </div>
            <span className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold text-white" style={{ background: 'var(--blue)' }}>{priv ? 'Invite' : 'Create'}</span>
          </button>
        );
      })()}

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
                            +{board[rank - 1].score - row.score} to catch {board[rank - 1].name}
                          </div>
                        )}
                        {row.you && rank === 0 && row.score > 0 && (
                          <div className="text-[10px] font-semibold mt-0.5 pl-9" style={{ color: 'var(--gold)' }}>🥇 Top of the league</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-num text-base font-extrabold" style={{ color: 'var(--blue)' }}>{tournamentStarted() ? row.score : '–'}</td>
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

// Contextual status shown at the top of the court, driven by phase + round.
function courtStatus(phase: GamePhase, currentRound: { short: string } | null, prevShort?: string): string {
  if (phase === 'draft') return 'Tournament about to begin — choose your players';
  if (phase === 'pre_round' && currentRound) return `${currentRound.short} incoming — choose your captain`;
  if (phase === 'round_complete' && currentRound) return `${prevShort ?? ''} done — set your captain for ${currentRound.short}`;
  if (phase === 'finished') return 'Tournament complete — final standings';
  return '';
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

function ActionBanner({ color, title, body, cta, onClick }: {
  color: string; title: string; body: string; cta: string; onClick: () => void;
}) {
  const bg = color === 'var(--blue)' ? 'rgba(14,111,196,0.07)' : color === 'var(--gold)' ? 'rgba(217,154,0,0.07)' : 'rgba(18,161,80,0.07)';
  const border = color === 'var(--blue)' ? 'rgba(14,111,196,0.2)' : color === 'var(--gold)' ? 'rgba(217,154,0,0.2)' : 'rgba(18,161,80,0.2)';
  return (
    <div className="flex items-center gap-4 px-5 py-4 rounded-2xl" style={{ background: bg, border: `1px solid ${border}` }}>
      <div className="flex-1">
        <div className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{title}</div>
        <div className="text-xs mt-0.5" style={{ color: 'var(--ink-2)' }}>{body}</div>
      </div>
      <button onClick={onClick} className="shrink-0 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-80" style={{ background: color }}>
        {cta}
      </button>
    </div>
  );
}
