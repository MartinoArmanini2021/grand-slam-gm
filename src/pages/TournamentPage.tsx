import { useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import { useLiveStore } from '../store/liveStore';
import { liveScoreBreakdown } from '../data/tournament';
import BracketTree from '../components/BracketTree';
import { TOURNAMENT } from '../data/tournamentConfig';

export default function TournamentPage() {
  const {
    phase, initialSquad, transfers, captainHistory, viceCaptainHistory,
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

      {/* ── The live tournament draw (empty until pairings publish) ── */}
      {/* Transfers live on the Market page now, not here. */}
      <BracketTree />
    </div>
  );
}
