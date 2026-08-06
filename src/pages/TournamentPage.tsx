import { useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import { useLiveStore } from '../store/liveStore';
import { ROUNDS, isPlayerOut, roundHasResult, liveScoreBreakdown } from '../data/tournament';
import type { RoundId } from '../types';
import BracketTree from '../components/BracketTree';
import { TOURNAMENT } from '../data/tournamentConfig';

export default function TournamentPage() {
  const {
    phase, myTeam, currentRoundIndex,
    initialSquad, transfers, captainHistory, viceCaptainHistory,
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
              <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
                Scores post automatically as results land — nothing to click. Make transfers in the Market before the next round starts. Your captain{' '}
                <b style={{ color: 'var(--gold)' }}>C</b> and vice <b style={{ color: '#3f6ea5' }}>V</b> are marked in the draw below.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── The live tournament draw (empty until pairings publish) ── */}
      {/* Transfers live on the Market page now, not here. */}
      <BracketTree />
    </div>
  );
}
