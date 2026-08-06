import { useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import { useLiveStore } from '../store/liveStore';
import { ROUNDS, isPlayerOut, roundHasResult, liveScoreBreakdown } from '../data/tournament';
import { getPlayer } from '../data/players';
import { lastName } from '../data/format';
import type { RoundId } from '../types';
import PlayerAvatar from '../components/PlayerAvatar';
import BracketTree from '../components/BracketTree';
import { TOURNAMENT } from '../data/tournamentConfig';

export default function TournamentPage() {
  const {
    phase, myTeam, captain, viceCaptain, currentRoundIndex,
    initialSquad, transfers, captainHistory, viceCaptainHistory,
    setActiveTab,
  } = useGameStore();

  // Live, per-match score + per-round breakdown — identical to the server/leaderboard, updating
  // as each result lands. liveScoreBreakdown reads BOTH the live draw and results, so both are
  // deps (else the memo goes stale at 0 when the draw fills in after the results rehydrate).
  const draw = useLiveStore(s => s.draw);
  const results = useLiveStore(s => s.results);
  const roundScores = useMemo(
    () => liveScoreBreakdown(initialSquad, transfers, captainHistory, viceCaptainHistory),
    [draw, results, initialSquad, transfers, captainHistory, viceCaptainHistory],
  );
  const myScore = roundScores.reduce((a, b) => a + b.points, 0);

  const currentRound = phase !== 'draft' && phase !== 'finished' ? ROUNDS[currentRoundIndex] : null;
  const roundStarted = !!currentRound && roundHasResult(currentRound.id); // its first match has a result → underway
  const revealed = ROUNDS.slice(0, currentRoundIndex).map(r => r.id) as RoundId[];
  const aliveSquad = myTeam.filter(id => !isPlayerOut(id, revealed));

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-3 py-6 fade-in">
      <div className="mb-4">
        <h1 className="text-lg font-extrabold" style={{ color: 'var(--ink)' }}>{TOURNAMENT.edition} — the draw</h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--ink-2)' }}>
          The live men's singles bracket. Once the draw is out you can highlight any team's players and trace their route to the final.
        </p>
      </div>

      {/* ── Game controls ── */}
      {phase === 'finished' && (
        <div className="mb-6 px-6 py-5 rounded-2xl text-center" style={{ background: 'rgba(217,154,0,0.06)', border: '1px solid rgba(217,154,0,0.2)' }}>
          <div className="text-3xl mb-2">🏆</div>
          <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--gold)' }}>Tournament Complete</h2>
          <div className="font-num text-2xl font-bold mb-3" style={{ color: 'var(--ink)' }}>{myScore} pts</div>
          <div className="flex justify-center gap-4 flex-wrap">
            {roundScores.map(rs => (
              <div key={rs.round} className="text-center">
                <div className="text-xs mb-1" style={{ color: 'var(--ink-2)' }}>{rs.round}</div>
                <div className="font-num text-sm font-bold" style={{ color: rs.points > 0 ? 'var(--green)' : 'var(--ink-3)' }}>+{rs.points}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {phase === 'pre_round' && currentRound && (
        <div className="mb-6 rounded-2xl overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid rgba(10,27,51,0.09)' }}>
          <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(10,27,51,0.07)' }}>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--ink-2)' }}>
                  {roundStarted ? 'Underway' : 'Up Next'}
                </div>
                <div className="text-lg font-bold" style={{ color: 'var(--ink)' }}>{currentRound.label}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--ink-2)' }}>
                  Base +{currentRound.points} pts · ×ranking &amp; upset bonus · captain doubles
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs mb-0.5" style={{ color: 'var(--ink-2)' }}>Score</div>
                <div className="font-num text-2xl font-bold" style={{ color: 'var(--blue)' }}>{myScore}</div>
              </div>
            </div>
          </div>

          <div className="px-5 py-4">
            {aliveSquad.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--ink-2)' }}>All your players are out — your squad's scores are final.</p>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs" style={{ color: 'var(--ink-2)' }}>Your leaders:</span>
                <LeaderChip role="C" id={captain} />
                <LeaderChip role="V" id={viceCaptain} />
                <button onClick={() => setActiveTab('home')} className="text-xs font-semibold" style={{ color: 'var(--blue)' }}>
                  Change on the pitch →
                </button>
              </div>
            )}
            <p className="text-[11px] mt-3" style={{ color: 'var(--ink-3)' }}>
              Scores post automatically as results land — nothing to click. Make transfers in the Market before the next round starts.
            </p>
          </div>
        </div>
      )}

      {/* ── The live tournament draw (empty until pairings publish) ── */}
      {/* Transfers live on the Market page now, not here. */}
      <BracketTree />
    </div>
  );
}

// A read-only chip for the round's captain / vice — the picks are made on the pitch (Home).
function LeaderChip({ role, id }: { role: 'C' | 'V'; id: string | null }) {
  if (!id) return null;
  const p = getPlayer(id);
  const isC = role === 'C';
  const color = isC ? 'var(--gold)' : '#3f6ea5';
  return (
    <span className="inline-flex items-center gap-1.5 pl-0.5 pr-1.5 py-0.5 rounded-full" style={{ background: isC ? 'rgba(217,154,0,0.1)' : 'rgba(14,111,196,0.08)', border: `1px solid ${isC ? 'rgba(217,154,0,0.3)' : 'rgba(14,111,196,0.25)'}` }}>
      <PlayerAvatar playerId={id} name={p.name} size="sm" />
      <span className="text-[12px] font-bold" style={{ color: 'var(--ink)' }}>{lastName(p.name)}</span>
      <span className="text-[9px] font-extrabold px-1 py-0.5 rounded" style={{ background: color, color: '#fff' }}>{isC ? 'C ×2' : 'V ×1.5'}</span>
    </span>
  );
}
