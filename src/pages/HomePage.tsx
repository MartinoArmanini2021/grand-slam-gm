import { useGameStore } from '../store/gameStore';
import { ROUNDS, getPlayerExit } from '../data/tournament';
import { getPlayer } from '../data/players';
import PlayerAvatar from '../components/PlayerAvatar';
import type { RoundId } from '../types';

const ROUND_PTS: Record<RoundId, number> = { R32: 2, R16: 5, QF: 10, SF: 20, F: 40 };

export default function HomePage() {
  const {
    phase, myTeam, captain, budget, myScore, currentRoundIndex,
    roundScores, captainHistory, setActiveTab, openTeam,
  } = useGameStore();

  const currentRound = currentRoundIndex < ROUNDS.length ? ROUNDS[currentRoundIndex] : null;
  const revealedRounds = ROUNDS.slice(0, currentRoundIndex).map(r => r.id) as RoundId[];

  const activePlayers = myTeam.filter(id => {
    const exit = getPlayerExit(id);
    return exit === null || !revealedRounds.includes(exit);
  });

  const eliminatedPlayers = myTeam.filter(id => {
    const exit = getPlayerExit(id);
    return exit !== null && revealedRounds.includes(exit);
  });

  const totalPossible = activePlayers.length > 0 && currentRound
    ? activePlayers.length * ROUND_PTS[currentRound.id as RoundId]
    : 0;

  const winRate = roundScores.length > 0
    ? Math.round(roundScores.reduce((a, b) => a + (b.points > 0 ? 1 : 0), 0) / roundScores.length * 100)
    : null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 fade-in">

      {/* ── Tournament hero ── */}
      <div className="relative rounded-2xl overflow-hidden mb-6 p-6" style={{ background: 'linear-gradient(120deg,#0a1f44 0%,#123163 100%)', boxShadow: '0 8px 30px rgba(10,27,51,0.18)' }}>
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 55% 90% at 85% 40%, rgba(55,214,122,0.16) 0%, transparent 70%)' }} />
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: '#37D67A' }}>Grand Slam · Grass</div>
            <h1 className="text-3xl font-extrabold mb-1 tracking-tight text-white">Wimbledon 2026</h1>
            <div className="text-sm" style={{ color: '#AFBFDA' }}>
              {phase === 'draft' && 'Draft opens — pick your 6 players from the draw'}
              {phase === 'pre_round' && currentRound && `Round ${currentRound.label} · Set your captain to play`}
              {phase === 'round_complete' && currentRound && `${ROUNDS[currentRoundIndex - 1]?.label} complete · Advance to ${currentRound.label}`}
              {phase === 'finished' && 'Tournament complete — final standings'}
            </div>
          </div>
          <div className="flex gap-3">
            <div className="text-center">
              <div className="font-num text-2xl font-bold text-white">{ROUNDS.length}</div>
              <div className="text-xs" style={{ color: '#8FA1BE' }}>rounds</div>
            </div>
            <div className="w-px" style={{ background: 'rgba(255,255,255,0.14)' }} />
            <div className="text-center">
              <div className="font-num text-2xl font-bold text-white">32</div>
              <div className="text-xs" style={{ color: '#8FA1BE' }}>players</div>
            </div>
            <div className="w-px" style={{ background: 'rgba(255,255,255,0.14)' }} />
            <div className="text-center">
              <div className="font-num text-2xl font-bold" style={{ color: '#F0C24B' }}>$100M</div>
              <div className="text-xs" style={{ color: '#8FA1BE' }}>budget</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Backtest teaser ── */}
      <button
        onClick={() => setActiveTab('backtest')}
        className="w-full flex items-center gap-3 px-5 py-3.5 rounded-2xl mb-6 text-left transition-all hover:brightness-[0.99]"
        style={{ background: '#FFFFFF', border: '1px solid rgba(10,27,51,0.08)', boxShadow: '0 1px 2px rgba(10,27,51,0.04)' }}
      >
        <div className="text-2xl">📊</div>
        <div className="flex-1">
          <div className="font-bold text-sm" style={{ color: '#0a1f44' }}>Backtest — the last 4 Grand Slams</div>
          <div className="text-xs" style={{ color: '#5B6B84' }}>See how this format would've scored on real results</div>
        </div>
        <div className="text-lg" style={{ color: '#0e6fc4' }}>›</div>
      </button>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Score" value={`${myScore}`} unit="pts" color="#0e6fc4" />
        <StatCard label="Budget" value={`$${budget.toFixed(1)}M`} unit="remaining" color="#0a1f44" />
        <StatCard label="Squad" value={`${myTeam.length}/6`} unit="players" color={myTeam.length === 6 ? '#12A150' : '#D99A00'} />
        <StatCard
          label={phase === 'finished' ? 'Final Round' : 'Current Round'}
          value={phase === 'draft' ? '—' : phase === 'finished' ? 'F' : (currentRound?.short ?? '—')}
          unit={phase === 'finished' ? 'done' : phase === 'draft' ? 'drafting' : 'in play'}
          color="#0a1f44"
        />
      </div>

      {/* ── Action callout ── */}
      {phase === 'draft' && (
        <ActionBanner
          color="#0e6fc4"
          title="Build your squad"
          body={`$${budget.toFixed(1)}M budget · pick up to 6 players`}
          cta="Go to Market"
          onClick={() => setActiveTab('draft')}
        />
      )}
      {phase === 'pre_round' && currentRound && (
        <ActionBanner
          color="#D99A00"
          title={`Set captain for ${currentRound.label}`}
          body={`+${currentRound.points * 2} pts if captain wins · ${activePlayers.length} active players`}
          cta="Pick Captain"
          onClick={() => setActiveTab('tournament')}
        />
      )}
      {phase === 'round_complete' && currentRound && (
        <ActionBanner
          color="#12A150"
          title={`${ROUNDS[currentRoundIndex - 1]?.label} results are in`}
          body={`${currentRound.label} is up next`}
          cta="See Results"
          onClick={() => setActiveTab('tournament')}
        />
      )}
      {phase === 'finished' && (
        <ActionBanner
          color="#D99A00"
          title="Tournament complete!"
          body={`Final score: ${myScore} pts · ${winRate !== null ? `${winRate}% round win rate` : ''}`}
          cta="View Bracket"
          onClick={() => setActiveTab('tournament')}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mt-4">
        {/* ── Squad ── */}
        <div className="lg:col-span-3 rounded-2xl p-5" style={{ background: '#FFFFFF', border: '1px solid rgba(10,27,51,0.07)' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-sm" style={{ color: '#0a1f44' }}>My Squad</h2>
            <button
              onClick={() => openTeam('you')}
              className="text-xs font-medium"
              style={{ color: '#0e6fc4' }}
            >
              Full view →
            </button>
          </div>
          {myTeam.length === 0 ? (
            <div className="text-center py-8" style={{ color: '#9AA7BC' }}>
              <div className="text-3xl mb-2">⬜</div>
              <div className="text-sm">No players yet</div>
            </div>
          ) : (
            <div className="space-y-2">
              {myTeam.map(id => {
                const p = getPlayer(id);
                const exit = getPlayerExit(id);
                const isOut = exit !== null && revealedRounds.includes(exit);
                const isCap = captain === id;
                const isWinner = exit === null && phase === 'finished';
                return (
                  <div
                    key={id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                    style={{
                      background: isCap ? 'rgba(217,154,0,0.05)' : 'rgba(10,27,51,0.03)',
                      border: `1px solid ${isCap ? 'rgba(217,154,0,0.2)' : 'rgba(10,27,51,0.06)'}`,
                      opacity: isOut ? 0.45 : 1,
                    }}
                  >
                    <PlayerAvatar playerId={id} name={p.name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: '#0a1f44' }}>{p.name}</div>
                      <div className="text-xs" style={{ color: '#5B6B84' }}>#{p.ranking} · 🌱 {p.surface.grass}%</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {isCap && <span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{ background: 'rgba(217,154,0,0.15)', color: '#D99A00', border: '1px solid rgba(217,154,0,0.25)' }}>C</span>}
                      {isWinner && <span className="text-xs">🏆</span>}
                      {isOut && <span className="text-xs" style={{ color: '#E5472B' }}>OUT {exit}</span>}
                    </div>
                    <div className="font-num text-xs font-semibold shrink-0" style={{ color: '#0e6fc4' }}>${p.price}M</div>
                  </div>
                );
              })}
              {Array.from({ length: 6 - myTeam.length }).map((_, i) => (
                <div key={i} className="px-3 py-2.5 rounded-xl text-xs text-center" style={{ border: '1px dashed rgba(10,27,51,0.07)', color: '#9AA7BC' }}>
                  Empty slot
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Round history ── */}
        <div className="lg:col-span-2 rounded-2xl p-5" style={{ background: '#FFFFFF', border: '1px solid rgba(10,27,51,0.07)' }}>
          <h2 className="font-semibold text-sm mb-4" style={{ color: '#0a1f44' }}>Round History</h2>
          {roundScores.length === 0 ? (
            <div className="text-center py-8 text-sm" style={{ color: '#9AA7BC' }}>Rounds not started</div>
          ) : (
            <div className="space-y-2">
              {ROUNDS.map((round, idx) => {
                const rs = roundScores.find(s => s.round === round.id);
                const done = idx < currentRoundIndex;
                const cap = captainHistory.find(c => c.round === round.id);
                if (!done) return (
                  <div key={round.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(10,27,51,0.02)', border: '1px solid rgba(10,27,51,0.04)' }}>
                    <div className="w-9 text-xs font-semibold" style={{ color: '#9AA7BC' }}>{round.short}</div>
                    <div className="flex-1 h-px" style={{ background: 'rgba(10,27,51,0.06)' }} />
                    <div className="text-xs" style={{ color: '#9AA7BC' }}>—</div>
                  </div>
                );
                return (
                  <div key={round.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(14,111,196,0.05)', border: '1px solid rgba(14,111,196,0.1)' }}>
                    <div className="w-9 text-xs font-semibold" style={{ color: '#5B6B84' }}>{round.short}</div>
                    <div className="flex-1 text-xs" style={{ color: '#5B6B84' }}>
                      {cap && <span style={{ color: '#D99A00' }}>⭐ {getPlayer(cap.playerId).name.split(' ').slice(-1)[0]}</span>}
                    </div>
                    <div className="font-num text-sm font-bold" style={{ color: rs && rs.points > 0 ? '#12A150' : '#5B6B84' }}>
                      {rs ? `+${rs.points}` : '+0'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {roundScores.length > 0 && (
            <div className="mt-3 pt-3 flex justify-between items-center" style={{ borderTop: '1px solid rgba(10,27,51,0.07)' }}>
              <span className="text-xs" style={{ color: '#5B6B84' }}>Total</span>
              <span className="font-num text-lg font-bold" style={{ color: '#0e6fc4' }}>{myScore} pts</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, unit, color }: { label: string; value: string; unit: string; color: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: '#FFFFFF', border: '1px solid rgba(10,27,51,0.07)' }}>
      <div className="text-xs mb-1" style={{ color: '#5B6B84' }}>{label}</div>
      <div className="font-num text-2xl font-bold leading-none" style={{ color }}>{value}</div>
      <div className="text-xs mt-1" style={{ color: '#9AA7BC' }}>{unit}</div>
    </div>
  );
}

function ActionBanner({ color, title, body, cta, onClick }: {
  color: string; title: string; body: string; cta: string; onClick: () => void;
}) {
  const bg = color === '#0e6fc4' ? 'rgba(14,111,196,0.07)'
    : color === '#D99A00' ? 'rgba(217,154,0,0.07)'
    : 'rgba(18,161,80,0.07)';
  const border = color === '#0e6fc4' ? 'rgba(14,111,196,0.2)'
    : color === '#D99A00' ? 'rgba(217,154,0,0.2)'
    : 'rgba(18,161,80,0.2)';
  return (
    <div className="flex items-center gap-4 px-5 py-4 rounded-2xl" style={{ background: bg, border: `1px solid ${border}` }}>
      <div className="flex-1">
        <div className="font-semibold text-sm" style={{ color: '#0a1f44' }}>{title}</div>
        <div className="text-xs mt-0.5" style={{ color: '#5B6B84' }}>{body}</div>
      </div>
      <button
        onClick={onClick}
        className="shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
        style={{ background: color, color: color === '#0a1f44' ? '#EEF1F5' : '#fff' }}
      >
        {cta}
      </button>
    </div>
  );
}
