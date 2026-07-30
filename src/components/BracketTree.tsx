import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { useProfile } from '../store/profileStore';
import { useLiveStore } from '../store/liveStore';
import { findPlayer } from '../data/players';
import { useLeagueBoard } from '../data/leagueBoard';
import { ROUNDS } from '../data/tournament';
import { matchKey } from '../data/liveResults';
import { TOURNAMENT } from '../data/tournamentConfig';
import type { RoundId } from '../types';

// The live bracket. The draw's pairings and each result arrive over time (feed/admin)
// into the live store. Before the draw is published there is nothing to show — a real,
// first-class "not started yet" state, not an empty grid.
export default function BracketTree() {
  const { draw, results } = useLiveStore();
  const { myTeam } = useGameStore();
  const { teamName, username } = useProfile();

  // Teams you can highlight in the draw: the real managers in your league (no bots).
  const board = useLeagueBoard(null);
  const teams = board.length > 0
    ? board.map(e => ({ id: e.id, name: e.name, squad: e.squad }))
    : (myTeam.length > 0 ? [{ id: 'you', name: teamName || (username ? `@${username}` : 'You'), squad: myTeam }] : []);
  const [teamId, setTeamId] = useState('you');
  const selected = teams.find(t => t.id === teamId) ?? teams[0];
  const highlight = new Set(selected?.squad ?? []);

  // ── Pre-tournament: the draw hasn't been published yet ──────────────────────
  if (draw.length === 0) {
    return (
      <div className="rounded-2xl px-6 py-12 text-center" style={{ background: '#FFFFFF', border: '1px solid rgba(10,27,51,0.09)' }}>
        <div className="text-4xl mb-3">🎾</div>
        <h2 className="text-lg font-extrabold mb-1" style={{ color: 'var(--ink)' }}>The {TOURNAMENT.edition} draw isn’t out yet</h2>
        <p className="text-sm max-w-md mx-auto" style={{ color: 'var(--ink-2)' }}>
          The bracket is published just before play begins in {TOURNAMENT.location}. Lock in your squad now — the live
          draw and results appear here, round by round, as the tournament is played.
        </p>
      </div>
    );
  }

  // ── Live draw: render each round's matches, winners highlighted ─────────────
  const rounds = ROUNDS.map(r => r.id as RoundId).filter(rid => draw.some(m => m.round === rid));

  return (
    <div>
      {teams.length > 0 && (
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-2)' }}>Highlight team</span>
          <select
            value={selected?.id ?? ''}
            onChange={e => setTeamId(e.target.value)}
            className="text-sm font-semibold rounded-lg px-2 py-1.5"
            style={{ background: 'var(--raised)', border: '1px solid rgba(10,27,51,0.12)', color: 'var(--ink)' }}
          >
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      )}

      <div className="overflow-x-auto">
        <div className="flex gap-3" style={{ minWidth: 'min-content' }}>
          {rounds.map(rid => {
            const label = ROUNDS.find(r => r.id === rid)!.label;
            const ms = draw.filter(m => m.round === rid).sort((a, b) => a.slot - b.slot);
            return (
              <div key={rid} className="shrink-0" style={{ width: 190 }}>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-2 text-center" style={{ color: 'var(--ink-2)' }}>{label}</div>
                <div className="flex flex-col gap-2">
                  {ms.map(m => {
                    const winner = results[matchKey(m.round, m.slot)];
                    return (
                      <div key={m.slot} className="rounded-lg overflow-hidden" style={{ border: '1px solid rgba(10,27,51,0.1)' }}>
                        <Side id={m.p1Id} won={winner === m.p1Id} decided={!!winner} mine={highlight.has(m.p1Id)} />
                        <div style={{ height: 1, background: 'rgba(10,27,51,0.08)' }} />
                        <Side id={m.p2Id} won={winner === m.p2Id} decided={!!winner} mine={highlight.has(m.p2Id)} />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Side({ id, won, decided, mine }: { id: string; won: boolean; decided: boolean; mine: boolean }) {
  const p = findPlayer(id);
  const name = p?.name ?? id;
  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1.5 text-xs"
      style={{
        background: mine ? 'rgba(217,154,0,0.12)' : '#FFFFFF',
        color: decided && !won ? 'var(--ink-3)' : 'var(--ink)',
        fontWeight: won ? 700 : 500,
        opacity: decided && !won ? 0.7 : 1,
      }}
    >
      {p?.flag && <span>{p.flag}</span>}
      <span className="truncate">{name}</span>
      {won && <span className="ml-auto text-[10px]" style={{ color: 'var(--green)' }}>✓</span>}
    </div>
  );
}
