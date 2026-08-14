import { useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import { useLiveStore } from '../store/liveStore';
import { ROUNDS, liveRoundStatus, liveScoreBreakdown } from '../data/tournament';
import { useMyScore } from '../data/useMyScore';
import { fmtScore } from '../data/format';
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
  // The headline total is the server-authoritative score (matches the leaderboard); the
  // per-round breakdown below is the live client projection. At the finished state — the only
  // place this total shows — the recompute has converged, so they agree.
  const { score: myScore } = useMyScore();

  // The round in focus for the status box: the earliest UNFINISHED round — Underway if it already
  // has results, Up Next if its predecessor is done and it hasn't started. (draw/results are
  // subscribed above, so this re-derives live.) Null once the whole draw is played out.
  const status = liveRoundStatus();
  const focusRound = status ? ROUNDS.find(r => r.id === status.round) : null;
  // "Underway" is claimed only on EVIDENCE (a recorded result). A round whose estimated start has
  // passed with nothing finished yet reads "About to Begin" — locked, but not asserted as playing.
  const underway = status?.live ?? false;
  const lockedNotLive = !!status && status.underway && !status.live;
  const showStatus = phase !== 'draft' && phase !== 'finished' && !!focusRound;

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-3 py-6 fade-in">
      <div className="mb-4">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight" style={{ color: 'var(--ink)' }}>{TOURNAMENT.edition} — the draw</h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--ink-2)' }}>
          The live men's singles bracket. Once the draw is out you can highlight any team's players and trace their route to the final.
        </p>
      </div>

      {/* ── Round status + how scoring works ── */}
      {showStatus && focusRound && (
        <div className="mb-6 rounded-2xl overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid rgba(10,27,51,0.09)' }}>
          <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(10,27,51,0.07)' }}>
            <div className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: underway ? 'var(--green)' : 'var(--ink-2)' }}>
              {underway ? 'Underway' : lockedNotLive ? 'About to Begin' : 'Up Next'}
            </div>
            <div className="text-lg font-bold" style={{ color: 'var(--ink)' }}>{focusRound.label}</div>
          </div>

          <div className="px-5 py-4">
            <div className="text-[11px] font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--ink-2)' }}>How points are scored</div>
            <p className="text-xs mb-3" style={{ color: 'var(--ink-2)' }}>
              Every one of your players banks points each time they <b style={{ color: 'var(--ink)' }}>win a match</b>. A win is worth:
            </p>
            <div className="flex flex-col gap-2.5">
              <ScoreRule label="Round">
                <span>Deeper rounds pay more — </span>
                <span className="font-num inline-flex flex-wrap gap-x-2">
                  {ROUNDS.map(r => <span key={r.id}>{r.short} <b style={{ color: 'var(--ink)' }}>{r.points}</b></span>)}
                </span>
              </ScoreRule>
              <ScoreRule label="Upset">
                Beating a higher-ranked player <b style={{ color: 'var(--ink)' }}>multiplies</b> the win — the bigger the ranking gap, the bigger the multiplier (up to <b style={{ color: 'var(--ink)' }}>×2</b>). Favourites win at the <b style={{ color: 'var(--ink)' }}>full</b> base.
              </ScoreRule>
              <ScoreRule label="Leaders">
                <b style={{ color: 'var(--gold)' }}>Captain ×2</b> and <b style={{ color: '#3f6ea5' }}>Vice ×1.5</b> on that player's round points
              </ScoreRule>
            </div>
          </div>
        </div>
      )}

      {/* ── Game controls ── */}
      {phase === 'finished' && (
        <div className="mb-6 px-6 py-5 rounded-2xl text-center" style={{ background: 'rgba(217,154,0,0.06)', border: '1px solid rgba(217,154,0,0.2)' }}>
          <div className="text-3xl mb-2">🏆</div>
          <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--gold)' }}>Tournament Complete</h2>
          <div className="font-num text-2xl font-bold mb-3" style={{ color: 'var(--ink)' }}>{fmtScore(myScore)} pts</div>
          <div className="flex justify-center gap-4 flex-wrap">
            {roundScores.map(rs => (
              <div key={rs.round} className="text-center">
                <div className="text-xs mb-1" style={{ color: 'var(--ink-2)' }}>{rs.round}</div>
                <div className="font-num text-sm font-bold" style={{ color: rs.points > 0 ? 'var(--green)' : 'var(--ink-3)' }}>+{fmtScore(rs.points)}</div>
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

// One scoring rule: a fixed-width accent label + a plain-language description.
function ScoreRule({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="shrink-0 text-[10px] font-extrabold uppercase tracking-wide rounded px-1.5 py-0.5" style={{ background: 'rgba(14,111,196,0.1)', color: 'var(--blue)', minWidth: 62, textAlign: 'center' }}>{label}</span>
      <span className="text-xs" style={{ color: 'var(--ink-2)' }}>{children}</span>
    </div>
  );
}
