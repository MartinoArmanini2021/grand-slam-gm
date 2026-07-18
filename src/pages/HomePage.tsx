import { useGameStore } from '../store/gameStore';
import { useProfile } from '../store/profileStore';
import { ROUNDS, isPlayerOut } from '../data/tournament';
import { useLeagueBoard } from '../data/leagueBoard';
import SquadCourt from '../components/SquadCourt';
import type { GamePhase, RoundId } from '../types';

const TEAM_TARGET = 6;

export default function HomePage() {
  const {
    phase, myTeam, budget, myScore, currentRoundIndex,
    roundScores, setActiveTab, openTeam,
  } = useGameStore();
  const { teamName, teamEmblem } = useProfile();

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

      {/* ── Title + subtitle + status ── */}
      <div className="text-center mb-2">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-none" style={{ color: '#0a1f44' }}>Wimbledon 2026</h1>
        <div className="text-xs font-bold uppercase tracking-[0.2em] mt-1" style={{ color: '#12A150' }}>
          Grand Slam · Grass
        </div>
        <div className="text-xs font-bold uppercase tracking-[0.2em] mt-1" style={{ color: '#E5472B' }}>
          {courtStatus(phase, currentRound, ROUNDS[currentRoundIndex - 1]?.short)}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-5 items-start">
        {/* ── Left: court · stats · next action ── */}
        <div className="w-full lg:flex-1 min-w-0">
      <SquadCourt teamName={teamName} emblem={teamEmblem} onTeamClick={() => openTeam('you')} />
      <div className="text-[11px] mt-1.5 mb-2 text-center" style={{ color: '#9AA7BC' }}>
        {phase === 'draft'
          ? 'Tap a + to add players · your squad lines up on court'
          : <>Tap a player for their profile · <span style={{ color: '#D99A00' }}>⭐ = captain (2× points)</span></>}
      </div>

      {/* ── Your stats ── */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <StatCard label="Score" value={`${myScore}`} unit="points" color="#0e6fc4" />
        <StatCard label="Budget" value={`$${budget.toFixed(1)}M`} unit="to spend" color="#0a1f44" />
        <StatCard
          label="Squad"
          value={`${myTeam.length}/${TEAM_TARGET}`}
          unit={myTeam.length >= TEAM_TARGET ? 'Squad complete' : `${TEAM_TARGET - myTeam.length} left to pick`}
          color={myTeam.length === TEAM_TARGET ? '#12A150' : '#D99A00'}
        />
      </div>

      {/* ── Action callout ── */}
      {phase === 'draft' && (
        <ActionBanner color="#0e6fc4" title={myTeam.length < TEAM_TARGET ? 'Build your squad' : 'Squad ready — lock it in'}
          body={`$${budget.toFixed(1)}M budget · ${myTeam.length}/${TEAM_TARGET} picked`} cta="Go to Market" onClick={() => setActiveTab('draft')} />
      )}
      {phase === 'pre_round' && currentRound && (
        <ActionBanner color="#D99A00" title={`Set captain for ${currentRound.label}`}
          body={`double points if your captain wins · ${activePlayers.length} still in`} cta="Pick Captain" onClick={() => setActiveTab('tournament')} />
      )}
      {phase === 'round_complete' && currentRound && (
        <ActionBanner color="#12A150" title={`${ROUNDS[currentRoundIndex - 1]?.label} results are in`}
          body={`${currentRound.label} is up next`} cta="See Bracket" onClick={() => setActiveTab('tournament')} />
      )}
      {phase === 'finished' && (
        <ActionBanner color="#D99A00" title="Tournament complete!"
          body={`Final score ${myScore} pts${winRate !== null ? ` · ${winRate}% round win rate` : ''}`} cta="View Bracket" onClick={() => setActiveTab('tournament')} />
      )}

        </div>

        {/* ── Right: league leaderboard ── */}
        <div className="w-full lg:w-[380px] shrink-0 mt-6 lg:mt-0">
        <div className="flex items-center justify-between mb-2.5 px-1">
          <h2 className="text-sm font-bold" style={{ color: '#0a1f44' }}>League leaderboard</h2>
          <button onClick={() => setActiveTab('league')} className="text-xs font-semibold" style={{ color: '#0e6fc4' }}>
            Full standings →
          </button>
        </div>

        {board.length === 0 ? (
          <div className="text-center py-8 text-sm rounded-2xl" style={{ color: '#9AA7BC', background: '#FFFFFF', border: '1px solid rgba(10,27,51,0.07)' }}>
            Draft your squad to join the league.
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(10,27,51,0.08)' }}>
            <table className="w-full text-sm border-collapse bg-white">
              <thead>
                <tr style={{ background: '#F5F7FA', borderBottom: '1px solid rgba(10,27,51,0.1)' }}>
                  <th className="text-center px-2 py-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: '#9AA7BC', width: 44 }}>#</th>
                  <th className="text-left px-2 py-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: '#5B6B84' }}>Team</th>
                  <th className="text-right px-3 py-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: '#0e6fc4' }}>Pts</th>
                </tr>
              </thead>
              <tbody>
                {board.map((row, i) => (
                  <tr
                    key={row.id}
                    onClick={() => openTeam(row.id)}
                    className="cursor-pointer transition-colors"
                    style={{ borderBottom: '1px solid rgba(10,27,51,0.05)', background: row.you ? 'rgba(14,111,196,0.05)' : 'transparent' }}
                    onMouseEnter={e => { if (!row.you) (e.currentTarget as HTMLElement).style.background = 'rgba(10,27,51,0.02)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = row.you ? 'rgba(14,111,196,0.05)' : 'transparent'; }}
                  >
                    <td className="px-2 py-2 text-center font-num font-bold" style={{ color: i < 3 ? '#0a1f44' : '#9AA7BC' }}>{medal(i)}</td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-7 h-7 rounded-lg flex items-center justify-center text-base shrink-0" style={{ background: `${row.color}1a`, border: `1px solid ${row.color}44` }}>{row.emblem}</span>
                        <span className="font-bold truncate" style={{ color: '#0a1f44' }}>{row.name}</span>
                        {row.you && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: '#0e6fc4', color: '#fff' }}>YOU</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-num text-base font-extrabold" style={{ color: '#0e6fc4' }}>{row.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </div>{/* /right */}
      </div>{/* /flex row */}
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
    <div className="rounded-2xl p-4 text-center sm:text-left" style={{ background: '#FFFFFF', border: '1px solid rgba(10,27,51,0.07)' }}>
      <div className="text-xs mb-1" style={{ color: '#5B6B84' }}>{label}</div>
      <div className="font-num text-2xl font-bold leading-none" style={{ color }}>{value}</div>
      <div className="text-xs mt-1" style={{ color: '#9AA7BC' }}>{unit}</div>
    </div>
  );
}

function ActionBanner({ color, title, body, cta, onClick }: {
  color: string; title: string; body: string; cta: string; onClick: () => void;
}) {
  const bg = color === '#0e6fc4' ? 'rgba(14,111,196,0.07)' : color === '#D99A00' ? 'rgba(217,154,0,0.07)' : 'rgba(18,161,80,0.07)';
  const border = color === '#0e6fc4' ? 'rgba(14,111,196,0.2)' : color === '#D99A00' ? 'rgba(217,154,0,0.2)' : 'rgba(18,161,80,0.2)';
  return (
    <div className="flex items-center gap-4 px-5 py-4 rounded-2xl" style={{ background: bg, border: `1px solid ${border}` }}>
      <div className="flex-1">
        <div className="font-semibold text-sm" style={{ color: '#0a1f44' }}>{title}</div>
        <div className="text-xs mt-0.5" style={{ color: '#5B6B84' }}>{body}</div>
      </div>
      <button onClick={onClick} className="shrink-0 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-80" style={{ background: color }}>
        {cta}
      </button>
    </div>
  );
}
