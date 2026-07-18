import { useGameStore } from '../store/gameStore';
import { ROUNDS, isPlayerOut } from '../data/tournament';
import { getPlayer } from '../data/players';
import { getRivalTeams } from '../data/rivals';
import SquadCourt from '../components/SquadCourt';
import PlayerAvatar from '../components/PlayerAvatar';
import type { RoundId } from '../types';

const TEAM_TARGET = 6;

export default function HomePage() {
  const {
    phase, myTeam, budget, myScore, currentRoundIndex,
    roundScores, setActiveTab, openTeam,
  } = useGameStore();

  const currentRound = currentRoundIndex < ROUNDS.length ? ROUNDS[currentRoundIndex] : null;
  const revealedRounds = ROUNDS.slice(0, currentRoundIndex).map(r => r.id) as RoundId[];
  const activePlayers = myTeam.filter(id => !isPlayerOut(id, revealedRounds));
  const winRate = roundScores.length > 0
    ? Math.round(roundScores.reduce((a, b) => a + (b.points > 0 ? 1 : 0), 0) / roundScores.length * 100)
    : null;

  // ── League leaderboard ──
  const rivalTeams = getRivalTeams(currentRoundIndex);
  const board = [
    ...rivalTeams.map(rt => ({
      id: rt.rival.id, name: rt.rival.name, emblem: rt.rival.emblem,
      manager: rt.rival.manager, color: rt.rival.color, squad: rt.squad, score: rt.score, you: false,
    })),
    ...(myTeam.length > 0 ? [{
      id: 'you', name: 'You', emblem: '🎾', manager: '@you', color: '#0e6fc4',
      squad: myTeam, score: myScore, you: true,
    }] : []),
  ].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const medal = (i: number) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`);

  return (
    <div className="max-w-4xl mx-auto px-4 pt-3 pb-6 fade-in">

      {/* ── Title + subtitle + status ── */}
      <div className="text-center mb-2">
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-none" style={{ color: '#0a1f44' }}>Wimbledon 2026</h1>
        <div className="text-xs font-bold uppercase tracking-[0.2em] mt-1" style={{ color: '#12A150' }}>
          Grand Slam · Grass
        </div>
        <div className="text-xs font-bold uppercase tracking-[0.2em] mt-1" style={{ color: '#E5472B' }}>
          {courtStatus(phase, currentRound, ROUNDS[currentRoundIndex - 1]?.short)}
        </div>
      </div>

      {/* ── The court ── */}
      <SquadCourt teamName="You" emblem="🎾" />
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
          unit="Pick up to 6"
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

      {/* ── League leaderboard ── */}
      <div className="mt-6">
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
          <div className="space-y-2">
            {board.map((row, i) => (
              <button
                key={row.id}
                onClick={() => openTeam(row.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left transition-all hover:brightness-[0.98]"
                style={{
                  background: row.you ? 'rgba(14,111,196,0.06)' : '#FFFFFF',
                  border: `1px solid ${row.you ? 'rgba(14,111,196,0.3)' : 'rgba(10,27,51,0.08)'}`,
                }}
              >
                <div className="w-6 text-center font-num font-bold shrink-0" style={{ color: i < 3 ? '#0a1f44' : '#9AA7BC' }}>{medal(i)}</div>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ background: `${row.color}1a`, border: `1px solid ${row.color}44` }}>
                  {row.emblem}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm truncate" style={{ color: '#0a1f44' }}>{row.name}</span>
                    {row.you && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#0e6fc4', color: '#fff' }}>YOU</span>}
                  </div>
                  <div className="text-[11px] truncate font-num" style={{ color: '#9AA7BC' }}>{row.manager}</div>
                </div>
                <div className="hidden sm:flex -space-x-2 shrink-0">
                  {row.squad.slice(0, 5).map(id => (
                    <PlayerAvatar key={id} playerId={id} name={getPlayer(id).name} size="sm" />
                  ))}
                </div>
                <div className="text-right shrink-0 w-12">
                  <div className="font-num text-lg font-extrabold" style={{ color: '#0e6fc4' }}>{row.score}</div>
                  <div className="text-[9px]" style={{ color: '#9AA7BC' }}>pts</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Contextual status shown at the top of the court, driven by phase + round.
function courtStatus(phase: string, currentRound: { short: string } | null, prevShort?: string): string {
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
