import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { useProfile } from '../store/profileStore';
import { useLiveStore } from '../store/liveStore';
import { findPlayer } from '../data/players';
import { useLeagueBoard } from '../data/leagueBoard';
import { ROUNDS } from '../data/tournament';
import { matchKey, type PlayerMetaMap } from '../data/liveResults';
import { TOURNAMENT } from '../data/tournamentConfig';
import type { RoundId } from '../types';

// The live bracket. The draw's pairings and each result arrive over time (feed/admin)
// into the live store. Before the draw is published there is nothing to show — a real,
// first-class "not started yet" state, not an empty grid.
export default function BracketTree() {
  const { draw, results, meta, scores } = useLiveStore();
  const { myTeam, captain, viceCaptain } = useGameStore();
  const { teamName, username } = useProfile();

  // Teams you can highlight in the draw: the real managers in your league (no bots). Each carries its
  // captain + vice so we can badge them right on the bracket for whichever team is highlighted.
  const board = useLeagueBoard(null);
  const teams = board.length > 0
    ? board.map(e => ({ id: e.id, name: e.name, squad: e.squad, captain: e.captain, viceCaptain: e.viceCaptain }))
    : (myTeam.length > 0 ? [{ id: 'you', name: teamName || (username ? `@${username}` : 'You'), squad: myTeam, captain, viceCaptain }] : []);
  const [teamId, setTeamId] = useState('you');
  const selected = teams.find(t => t.id === teamId) ?? teams[0];
  const highlight = new Set(selected?.squad ?? []);
  const capId = selected?.captain ?? null;   // highlighted team's captain (C ×2)
  const viceId = selected?.viceCaptain ?? null; // …and vice (V ×1.5)
  const leaderRole = (id: string): 'C' | 'V' | undefined => (id === capId ? 'C' : id === viceId ? 'V' : undefined);
  // Trace ONE player's route through the draw: tap any player and every match they play lights
  // up (blue), showing exactly how far they've gone. Tap them again (or ✕) to clear.
  const [pathId, setPathId] = useState<string | null>(null);
  const pickPath = (id: string) => setPathId(prev => (prev === id ? null : id));
  const tracedName = pathId ? (findPlayer(pathId)?.name ?? meta[pathId]?.name ?? prettifyId(pathId)) : null;

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

  // ── The FULL bracket, drawn to the final from day one ───────────────────────
  // Every scored round with its exact number of slots (round-of-64 → 32 matches, R32 → 16, …
  // Final → 1), so you can trace where players will meet before those rounds are drawn. Known
  // pairings are placed; the rest read "TBD vs TBD" until the draw fills in. Slots are numbered
  // in bracket order — round i's match s is fed by round i-1's matches 2s and 2s+1 (verified) —
  // so equal-height columns with justify-around center each match between its two feeders.
  const K = ROUNDS.length;
  const bracket = ROUNDS.map((r, i) => {
    const bySlot = new Map(draw.filter(m => m.round === r.id).map(m => [m.slot, m]));
    const matches = Array.from({ length: 2 ** (K - 1 - i) }, (_, slot) =>
      bySlot.get(slot) ?? { round: r.id as RoundId, slot, half: 'top' as const, p1Id: 'tbd', p2Id: 'tbd' });
    return { id: r.id as RoundId, label: r.label, matches };
  });

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {teams.length > 0 && (
          <>
            <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-2)' }}>Highlight team</span>
            <select
              value={selected?.id ?? ''}
              onChange={e => setTeamId(e.target.value)}
              className="text-sm font-semibold rounded-lg px-2 py-1.5"
              style={{ background: 'var(--raised)', border: '1px solid rgba(10,27,51,0.12)', color: 'var(--ink)' }}
            >
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </>
        )}
        {/* Player-path tracer: either the live "tracing X" chip, or a hint to tap a player. */}
        {tracedName ? (
          <button
            onClick={() => setPathId(null)}
            className="inline-flex items-center gap-1.5 text-xs font-bold pl-2.5 pr-2 py-1.5 rounded-lg"
            style={{ background: 'rgba(14,111,196,0.12)', border: '1px solid rgba(14,111,196,0.35)', color: 'var(--blue)' }}
          >
            <span>Tracing {tracedName}</span>
            <span aria-hidden="true" style={{ opacity: 0.8 }}>✕</span>
          </button>
        ) : (
          <span className="text-[11px]" style={{ color: 'var(--ink-3)' }}>Tap any player to trace their path →</span>
        )}
      </div>

      <div className="overflow-x-auto pb-1">
        {/* Equal-height columns (items-stretch) with matches spread evenly (justify-around) so each
            round's match sits centred between the two matches that feed it — a readable tree. */}
        <div className="flex gap-3 items-stretch" style={{ minWidth: 'min-content' }}>
          {bracket.map(({ id, label, matches }) => (
            <div key={id} className="shrink-0 flex flex-col" style={{ width: 168 }}>
              <div className="text-[10px] font-bold uppercase tracking-wider mb-2 text-center" style={{ color: 'var(--ink-2)' }}>{label}</div>
              <div className="flex-1 flex flex-col justify-around">
                {matches.map(m => {
                  const winner = results[matchKey(m.round, m.slot)];
                  const live = highlight.has(m.p1Id) || highlight.has(m.p2Id);
                  const onPath = !!pathId && (m.p1Id === pathId || m.p2Id === pathId); // traced player plays here
                  const sc = scores[matchKey(m.round, m.slot)];
                  return (
                    <div key={m.slot} className="rounded-lg overflow-hidden shrink-0" style={{
                      border: `1px solid ${onPath ? 'var(--blue)' : live ? 'rgba(217,154,0,0.5)' : 'rgba(10,27,51,0.1)'}`,
                      boxShadow: onPath ? '0 0 0 1px var(--blue)' : 'none', margin: '3px 0',
                    }}>
                      <Side id={m.p1Id} meta={meta} won={winner === m.p1Id} decided={!!winner} mine={highlight.has(m.p1Id)} isPath={m.p1Id === pathId} onPick={pickPath} sets={sc?.p1} role={leaderRole(m.p1Id)} />
                      <div style={{ height: 1, background: 'rgba(10,27,51,0.08)' }} />
                      <Side id={m.p2Id} meta={meta} won={winner === m.p2Id} decided={!!winner} mine={highlight.has(m.p2Id)} isPath={m.p2Id === pathId} onPick={pickPath} sets={sc?.p2} role={leaderRole(m.p2Id)} />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Name particles that stay lowercase when we rebuild a name from a placeholder id.
const NAME_PARTICLES = new Set(['de', 'del', 'della', 'di', 'da', 'dos', 'van', 'von', 'der', 'den', 'la', 'le', 'el', 'bin', 'ben']);

// Opponents who aren't in the draftable roster (qualifiers, low-ranked entrants) resolve to a
// synthetic id like "x_daniel_merida". Turn that into a readable name ("Daniel Merida") instead of
// showing the raw id. Roster players keep their real name; this only runs for the "x_" fallback.
function prettifyId(id: string): string {
  if (!id.startsWith('x_')) return id;
  const words = id.slice(2).split('_').filter(Boolean);
  if (words.length === 0) return id;
  return words
    .map((w) => (NAME_PARTICLES.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

function Side({ id, meta, won, decided, mine, isPath, onPick, sets, role }: { id: string; meta: PlayerMetaMap; won: boolean; decided: boolean; mine: boolean; isPath?: boolean; onPick?: (id: string) => void; sets?: string[]; role?: 'C' | 'V' }) {
  const isTbd = id === 'tbd';                // a seed's opponent, still to be decided in the first round
  const p = isTbd ? undefined : findPlayer(id);
  // Off-roster opponent (not in the draftable field): use the real name + flag the feed
  // pulled from the draw; fall back to a prettified id if the feed hasn't loaded it yet.
  const m = p || isTbd ? undefined : meta[id];
  const name = isTbd ? 'TBD' : (p?.name ?? m?.name ?? prettifyId(id));
  const flag = p?.flag ?? m?.flag;
  const clickable = !isTbd && !!onPick; // tap a real player to trace their path
  return (
    <div
      onClick={clickable ? () => onPick!(id) : undefined}
      title={clickable ? `Trace ${name}'s path` : undefined}
      className="flex items-center gap-1.5 px-2 py-1.5 text-xs"
      style={{
        background: isPath ? 'rgba(14,111,196,0.16)' : mine ? 'rgba(217,154,0,0.12)' : '#FFFFFF',
        color: isTbd ? 'var(--ink-3)' : isPath ? 'var(--blue)' : decided && !won ? 'var(--ink-3)' : 'var(--ink)',
        fontWeight: won || isPath ? 700 : 500,
        opacity: decided && !won && !isPath ? 0.7 : 1,
        fontStyle: isTbd ? 'italic' : 'normal',
        cursor: clickable ? 'pointer' : 'default',
      }}
    >
      {flag && <span>{flag}</span>}
      <span className="flex items-center gap-1 flex-1 min-w-0">
        <span className="truncate min-w-0">{name}</span>
        {/* Captain / vice badge for the highlighted team — spot your leaders right in the draw. */}
        {role && (
          <span className="shrink-0 text-[8px] font-extrabold leading-none px-1 py-0.5 rounded" style={{ background: role === 'C' ? 'var(--gold)' : '#3f6ea5', color: '#fff' }}>{role}</span>
        )}
      </span>

      {/* Set-by-set games (this side), right-aligned like a real bracket. The winner's line is
          bold via the row's fontWeight; a decided match with no score falls back to a ✓. */}
      {sets && sets.length > 0 ? (
        <span className="shrink-0 flex gap-1 font-num tabular-nums text-[11px]" style={{ color: won ? 'var(--ink)' : 'var(--ink-3)' }}>
          {sets.map((g, i) => <span key={i}>{g}</span>)}
        </span>
      ) : won ? (
        <span className="shrink-0 text-[10px]" style={{ color: 'var(--green)' }}>✓</span>
      ) : null}
    </div>
  );
}
