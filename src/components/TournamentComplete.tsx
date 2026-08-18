import { useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import { useLiveStore } from '../store/liveStore';
import { useLeagueBoard } from '../data/leagueBoard';
import { matchKey } from '../data/liveResults';
import { findPlayer } from '../data/players';
import { fmtScore, ordinal } from '../data/format';
import { TOURNAMENT, SELECTABLE_TOURNAMENTS, switchTournament } from '../data/tournamentConfig';

// ── The finished-tournament screen (Phase 2.4) ───────────────────────────────────────────────────
//
// Read-only mode (2.1) made a finished event safe. It did not make it UNDERSTANDABLE: the app just
// sat there with its controls quietly gone, which reads as broken rather than over. That is exactly
// the complaint behind this whole phase of work — people not knowing what the app is doing — so an
// inert screen is not good enough. This says the three things a returning manager wants: it's over,
// this is how you did, and here is the way back to the live one.
//
// Deliberately short. Every extra line here competes with the two facts that matter (where you
// finished, and the way out), and "too much text" is the other half of the feedback.
export default function TournamentComplete() {
  const { setActiveTab, openTeam } = useGameStore();
  const draw = useLiveStore(s => s.draw);
  const results = useLiveStore(s => s.results);
  const meta = useLiveStore(s => s.meta);
  const board = useLeagueBoard(null); // the public league — everyone who played

  // The champion: the winner of the final. Read from the draw + recorded results rather than any
  // stored standing, so it is the same source the rest of the app scores from.
  //
  // Falls back to the draw's own metadata for a winner outside the draftable field. Unlikely for a
  // final, but findPlayer returns undefined there and an unnamed champion would silently drop the
  // line — quietly showing less rather than saying so.
  const championName = useMemo(() => {
    const finalMatch = draw.find(m => m.round === 'F');
    if (!finalMatch) return null;
    const winnerId = results[matchKey('F', finalMatch.slot)];
    if (!winnerId) return null;
    return findPlayer(winnerId)?.name ?? meta[winnerId]?.name ?? null;
  }, [draw, results, meta]);

  // Where you finished. The board is already sorted by score.
  const { position, total, you } = useMemo(() => {
    const ranked = [...board].sort((a, b) => b.score - a.score);
    const i = ranked.findIndex(r => r.you);
    return { position: i >= 0 ? i + 1 : null, total: ranked.length, you: i >= 0 ? ranked[i] : null };
  }, [board]);

  const liveEvent = SELECTABLE_TOURNAMENTS.find(t => t.status === 'live');

  return (
    <div
      className="rounded-2xl p-5 mb-4 text-center"
      style={{
        background: 'linear-gradient(160deg, rgba(10,31,68,0.96), rgba(10,31,68,0.88))',
        border: '1px solid rgba(255,255,255,0.14)',
      }}
    >
      <div className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: 'rgba(255,255,255,0.55)' }}>
        Tournament complete
      </div>
      <div className="text-lg font-extrabold mt-1 text-white">{TOURNAMENT.edition}</div>

      {championName && (
        <div className="text-sm mt-3" style={{ color: 'rgba(255,255,255,0.8)' }}>
          🏆 Won by <span className="font-bold text-white">{championName}</span>
        </div>
      )}

      {/* Your result. Shown only when you actually played — a manager browsing an event they were
          never in should not be told they finished last of six. */}
      {position !== null && you ? (
        <div
          className="mt-4 py-3 px-4 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.10)' }}
        >
          <div className="text-xs" style={{ color: 'rgba(255,255,255,0.65)' }}>You finished</div>
          <div className="text-2xl font-extrabold text-white mt-0.5">
            {ordinal(position)} <span className="text-base font-bold" style={{ color: 'rgba(255,255,255,0.6)' }}>of {total}</span>
          </div>
          <div className="text-sm font-bold mt-0.5" style={{ color: 'var(--green-bright)' }}>
            {fmtScore(you.score)} points
          </div>
        </div>
      ) : (
        <div className="text-sm mt-4" style={{ color: 'rgba(255,255,255,0.7)' }}>
          You didn't play this one.
        </div>
      )}

      {/* THE POINT OF THE SCREEN: say why nothing responds, before they try and wonder. */}
      <div className="text-xs mt-4 leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
        This tournament is over, so it's a record now — have a look around, but nothing here can change.
      </div>

      {liveEvent && (
        <button
          onClick={() => switchTournament(liveEvent.id)}
          className="mt-4 w-full py-3 rounded-xl text-sm font-extrabold text-white transition-all"
          style={{ background: 'var(--green-bright)', boxShadow: '0 4px 14px rgba(18,161,80,0.35)' }}
        >
          Go to {liveEvent.name} →
        </button>
      )}

      {/* The two things worth doing on a finished event. These came from the coach card's own
          "Tournament over" state, which is suppressed here — two cards both announcing the end,
          both offering the same links, is the duplication this phase of work exists to remove. */}
      <div className="flex gap-2 mt-2">
        <button
          onClick={() => setActiveTab('league')}
          className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-colors"
          style={{ background: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.9)' }}
        >
          Final standings
        </button>
        <button
          onClick={() => openTeam('you')}
          className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-colors"
          style={{ background: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.9)' }}
        >
          Review your run
        </button>
      </div>
    </div>
  );
}
