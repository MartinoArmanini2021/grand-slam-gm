import { useGameStore } from '../store/gameStore';
import { useProfile } from '../store/profileStore';
import { ROUNDS, isPlayerOut } from '../data/tournament';
import { isSquadValid, SQUAD_SIZE } from '../data/squadRules';
import { onActivate } from '../hooks';
import { useLeagueBoard } from '../data/leagueBoard';
import SquadCourt from '../components/SquadCourt';
import type { GamePhase, RoundId } from '../types';

const TEAM_TARGET = SQUAD_SIZE;

export default function HomePage() {
  const {
    phase, myTeam, budget, myScore, currentRoundIndex,
    roundScores, setActiveTab, openTeam,
  } = useGameStore();
  const { teamName, teamEmblem } = useProfile();

  const squadReady = isSquadValid(myTeam);
  const currentRound = currentRoundIndex < ROUNDS.length ? ROUNDS[currentRoundIndex] : null;
  const revealedRounds = ROUNDS.slice(0, currentRoundIndex).map(r => r.id) as RoundId[];
  const activePlayers = myTeam.filter(id => !isPlayerOut(id, revealedRounds));
  const winRate = roundScores.length > 0
    ? Math.round(roundScores.reduce((a, b) => a + (b.points > 0 ? 1 : 0), 0) / roundScores.length * 100)
    : null;

  const board = useLeagueBoard();
  const medal = (i: number) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`);

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-3 pt-3 pb-6 fade-in">

      {/* ── Header: title + meta (left) · your stats (top-right) ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-x-3 gap-y-1 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-none" style={{ color: 'var(--ink)' }}>Wimbledon 2026</h1>
            <span className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--green)' }}>Grand Slam · Grass</span>
          </div>
          <div className="text-xs font-bold uppercase tracking-[0.2em] mt-1.5" style={{ color: 'var(--ember)' }}>
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
          ? 'Tap a + to add players · tap a player to manage your squad'
          : <>Tap a player to manage or view their profile · <span style={{ color: 'var(--gold)' }}>⭐ = captain (2× points)</span></>}
      </div>

      {/* ── Action callout ── */}
      {phase === 'draft' && (
        <ActionBanner color="var(--blue)" title={squadReady ? 'Squad ready — lock it in' : 'Build your squad'}
          body={`$${budget.toFixed(1)}M budget · ${myTeam.length}/${TEAM_TARGET} picked · ≥4 Silver, ≥2 Gold`} cta="Go to Market" onClick={() => setActiveTab('draft')} />
      )}
      {phase === 'pre_round' && currentRound && (
        <ActionBanner color="var(--gold)" title={`Set captain for ${currentRound.label}`}
          body={`double points if your captain wins · ${activePlayers.length} still in`} cta="Pick Captain" onClick={() => setActiveTab('tournament')} />
      )}
      {phase === 'round_complete' && currentRound && (
        <ActionBanner color="var(--green)" title={`${ROUNDS[currentRoundIndex - 1]?.label} results are in`}
          body={`${currentRound.label} is up next`} cta="See Bracket" onClick={() => setActiveTab('tournament')} />
      )}
      {phase === 'finished' && (
        <ActionBanner color="var(--gold)" title="Tournament complete!"
          body={`Final score ${myScore} pts${winRate !== null ? ` · ${winRate}% round win rate` : ''}`} cta="View Bracket" onClick={() => setActiveTab('tournament')} />
      )}

        {/* ── League leaderboard (below the court) ── */}
        <div className="mt-6">
        <div className="flex items-center justify-between mb-2.5 px-1">
          <h2 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>League leaderboard</h2>
          <button onClick={() => setActiveTab('league')} className="text-xs font-semibold" style={{ color: 'var(--blue)' }}>
            Full standings →
          </button>
        </div>

        {board.length === 0 ? (
          <div className="text-center py-8 text-sm rounded-2xl" style={{ color: 'var(--ink-3)', background: '#FFFFFF', border: '1px solid rgba(10,27,51,0.07)' }}>
            Draft your squad to join the league.
          </div>
        ) : (
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
                {board.map((row, i) => (
                  <tr
                    key={row.id}
                    onClick={() => openTeam(row.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={onActivate(() => openTeam(row.id))}
                    className="cursor-pointer transition-colors"
                    style={{ borderBottom: '1px solid rgba(10,27,51,0.05)', background: row.you ? 'rgba(14,111,196,0.05)' : 'transparent' }}
                    onMouseEnter={e => { if (!row.you) (e.currentTarget as HTMLElement).style.background = 'rgba(10,27,51,0.02)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = row.you ? 'rgba(14,111,196,0.05)' : 'transparent'; }}
                  >
                    <td className="px-2 py-2 text-center font-num font-bold" style={{ color: i < 3 ? 'var(--ink)' : 'var(--ink-3)' }}>{medal(i)}</td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-7 h-7 rounded-lg flex items-center justify-center text-base shrink-0" style={{ background: `${row.color}1a`, border: `1px solid ${row.color}44` }}>{row.emblem}</span>
                        <span className="font-bold truncate" style={{ color: 'var(--ink)' }}>{row.name}</span>
                        {row.you && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: 'var(--blue)', color: '#fff' }}>YOU</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-num text-base font-extrabold" style={{ color: 'var(--blue)' }}>{row.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </div>{/* /leaderboard */}
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
