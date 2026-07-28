import { useState, useRef, useEffect, Fragment } from 'react';
import { WIMBLEDON_2026, WIMBLEDON_2026_EARLY, WIMBLEDON_2026_CHAMPION } from '../data/wimbledon2026';
import type { WMatch, WRound } from '../data/wimbledon2026';
import { useGameStore } from '../store/gameStore';
import { useProfile } from '../store/profileStore';
import { findPlayer } from '../data/players';
import { getRivalTeams } from '../data/rivals';
import { ROUNDS } from '../data/tournament';
import { ROUND_META, ROUND_ORDER, TOURNAMENT } from '../data/tournamentConfig';

// The full draw for display (first two rounds + the scored bracket).
const FULL_DRAW: WMatch[] = [...WIMBLEDON_2026_EARLY, ...WIMBLEDON_2026];
const ALL_COLS: WRound[] = ['R128', 'R64', 'R32', 'R16', 'QF', 'SF'];
const SCORED_COLS: WRound[] = ['R32', 'R16', 'QF', 'SF'];
// Round labels + play-order come straight from the shared config, so a change to
// the tournament's rounds (or their names) flows through the bracket automatically.
const ROUND_LABEL = Object.fromEntries(ROUND_ORDER.map(r => [r, ROUND_META[r].label])) as Record<WRound, string>;
// Position of each round in the played sequence — used to gate spoilers: a round's
// results are hidden until you've played it.
const ROUND_IDX = Object.fromEntries(ROUND_ORDER.map((r, i) => [r, i])) as Record<WRound, number>;

// Bracket geometry — cards share a fixed width; connector columns carry the tree lines.
const CARD_W = 176;
const CONN_W = 22;
const LINE = 'rgba(10,27,51,0.22)';

// Round label sitting atop each column; empty label keeps connector columns aligned.
function ColHeader({ label, gold }: { label: string; gold?: boolean }) {
  return (
    <div
      className="text-[10px] font-bold uppercase tracking-wider mb-2 text-center sticky top-0"
      style={{ color: gold ? 'var(--gold)' : 'var(--ink-2)', background: 'var(--raised)', zIndex: 1, paddingBottom: 4 }}
    >{label || ' '}</div>
  );
}

export default function BracketTree() {
  const [half, setHalf] = useState<'top' | 'bottom'>('top');
  const [focus, setFocus] = useState<string | null>(null);
  // Default to the full draw: the Round of 128 is known from the start, whereas the
  // Last-32 participants stay hidden (no spoilers) until R64 is played — so Last-32
  // would look empty on a first visit.
  const { myTeam, currentRoundIndex } = useGameStore();
  // Auto-adapt: once the draw has narrowed (R32 reached), default to the compact
  // Last-32 view so the business end — and the Final — is front and centre.
  const [depth, setDepth] = useState<'full' | 'last32'>(currentRoundIndex >= 2 ? 'last32' : 'full');
  const cols = depth === 'full' ? ALL_COLS : SCORED_COLS;
  const { teamName, username } = useProfile();
  const treeRef = useRef<HTMLDivElement>(null);
  // Bring a round column into view — scrolls the tree HORIZONTALLY only (never the
  // page), so a jump never yanks you up or down.
  const scrollToRound = (round: string) => {
    const c = treeRef.current;
    const el = c?.querySelector(`[data-round="${round}"]`) as HTMLElement | null;
    if (!c || !el) return;
    const er = el.getBoundingClientRect(), cr = c.getBoundingClientRect();
    c.scrollBy({ left: (er.left - cr.left) - (cr.width - er.width) / 2, behavior: 'smooth' });
  };
  // Follow the action: when the played round advances, centre on the next round
  // (or the Final once it's done). Re-runs on depth change so the target exists.
  useEffect(() => {
    if (currentRoundIndex === 0) return; // draft: show the draw from the start, don't auto-centre
    const target = currentRoundIndex >= ROUND_ORDER.length ? 'F' : ROUND_ORDER[currentRoundIndex];
    const t = setTimeout(() => scrollToRound(target), 60);
    return () => clearTimeout(t);
  }, [currentRoundIndex, depth]);

  // Teams you can highlight in the draw: your squad + every league rival.
  const teams = [
    ...(myTeam.length > 0 ? [{ id: 'you', name: teamName, username: username ? `@${username}` : '@you', squad: myTeam }] : []),
    ...getRivalTeams(currentRoundIndex).map(rt => ({ id: rt.rival.id, name: rt.rival.name, username: rt.rival.manager, squad: rt.squad })),
  ];
  const [teamId, setTeamId] = useState('you');
  const selected = teams.find(t => t.id === teamId) ?? teams[0];
  // Keep the dropdown's value in sync with what's actually highlighted (e.g. when
  // 'you' isn't in the list because no squad is drafted yet).
  const selectedId = selected?.id ?? '';
  const highlight = new Set((selected?.squad ?? []).map(id => findPlayer(id)?.name).filter((n): n is string => !!n));

  const final = WIMBLEDON_2026.find(m => m.round === 'F')!;
  const onRoute = (m: WMatch) => focus !== null && (m.p1.name === focus || m.p2.name === focus);

  const PlayerRow = ({ name, seed, isWinner, dim }: { name: string; seed: number | null; isWinner: boolean; dim: boolean }) => {
    const focused = focus === name;
    const isMine = highlight.has(name);
    return (
      <button
        onClick={() => setFocus(focused ? null : name)}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left transition-colors"
        style={{
          background: focused ? 'rgba(14,111,196,0.12)' : isMine ? 'rgba(217,154,0,0.14)' : 'transparent',
          borderLeft: isMine ? '3px solid var(--gold)' : '3px solid transparent',
        }}
      >
        <span className="font-num text-[9px] w-4 shrink-0" style={{ color: 'var(--ink-3)' }}>{seed ?? ''}</span>
        <span className="text-[11px] truncate flex-1" style={{ color: dim ? 'var(--ink-3)' : 'var(--ink)', fontWeight: isWinner || isMine ? 800 : 500 }}>
          {name}
        </span>
        {isMine && <span className="text-[9px] shrink-0" style={{ color: 'var(--gold)' }}>★</span>}
        {isWinner && <span className="text-[10px] shrink-0" style={{ color: 'var(--green)' }}>✓</span>}
      </button>
    );
  };

  // A blank slot for a match whose participants aren't decided yet (its feeder
  // round hasn't been played) — keeps the tree shape without spoiling anything.
  const TbdRow = () => (
    <div className="w-full flex items-center gap-1.5 px-2 py-1.5" style={{ borderLeft: '3px solid transparent' }}>
      <span className="text-[11px] italic" style={{ color: 'var(--ink-3)' }}>—</span>
    </div>
  );

  const MatchCard = ({ m }: { m: WMatch }) => {
    const route = onRoute(m);
    const ri = ROUND_IDX[m.round];
    const resultRevealed = ri < currentRoundIndex;   // round has been played
    const participantsKnown = ri <= currentRoundIndex; // its feeders have been played
    return (
      <div className="rounded-lg overflow-hidden shrink-0" style={{
        width: CARD_W,
        background: '#FFFFFF',
        border: `1.5px solid ${route ? 'var(--blue)' : 'rgba(10,27,51,0.1)'}`,
        boxShadow: route ? '0 0 0 3px rgba(14,111,196,0.12)' : '0 1px 2px rgba(10,27,51,0.04)',
        opacity: participantsKnown ? 1 : 0.6,
      }}>
        {participantsKnown ? (
          <>
            <PlayerRow name={m.p1.name} seed={m.p1.seed} isWinner={resultRevealed && m.winner === m.p1.name} dim={resultRevealed && m.winner !== m.p1.name} />
            <div style={{ height: 1, background: 'rgba(10,27,51,0.06)' }} />
            <PlayerRow name={m.p2.name} seed={m.p2.seed} isWinner={resultRevealed && m.winner === m.p2.name} dim={resultRevealed && m.winner !== m.p2.name} />
          </>
        ) : (
          <>
            <TbdRow />
            <div style={{ height: 1, background: 'rgba(10,27,51,0.06)' }} />
            <TbdRow />
          </>
        )}
        <div
          className="font-num text-center whitespace-nowrap overflow-hidden text-ellipsis"
          title={resultRevealed ? m.score : undefined}
          style={{ fontSize: 9, lineHeight: '15px', color: 'var(--ink-3)', background: 'var(--raised)', borderTop: '1px solid rgba(10,27,51,0.06)', padding: '0 6px' }}
        >{resultRevealed ? m.score : participantsKnown ? 'to be played' : ''}</div>
      </div>
    );
  };

  // One round of matches — each match sits in an equal flex slot so later rounds
  // line up on the midpoint of their two feeders (a true, proportional bracket).
  const Column = ({ round, matches }: { round: WRound; matches: WMatch[] }) => (
    <div className="flex flex-col" style={{ width: CARD_W }} data-round={round}>
      <ColHeader label={ROUND_LABEL[round]} />
      <div className="flex-1 flex flex-col">
        {matches.map(m => (
          <div key={`${round}-${m.slot}`} className="flex-1 flex items-center">
            <MatchCard m={m} />
          </div>
        ))}
      </div>
    </div>
  );

  // Connector column: for each child match, an elbow joining its two feeders. It
  // grows to absorb spare width, so the columns spread evenly and the Final lands
  // flush against the right edge.
  const Connector = ({ count, single }: { count: number; single?: boolean }) => (
    <div className="flex flex-col" style={{ flex: `1 0 ${CONN_W}px`, minWidth: CONN_W }}>
      <ColHeader label="" />
      <div className="flex-1 flex flex-col">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex-1 relative">
            {single ? (
              // one feeder → straight line across to the child
              <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', borderTop: `1.5px solid ${LINE}` }} />
            ) : (
              <>
                {/* vertical spine spanning the two feeder centres (25%–75%) */}
                <div style={{ position: 'absolute', right: 0, top: '25%', height: '50%', borderRight: `1.5px solid ${LINE}` }} />
                {/* horizontal stub from each feeder into the spine */}
                <div style={{ position: 'absolute', left: 0, right: 0, top: '25%', borderTop: `1.5px solid ${LINE}` }} />
                <div style={{ position: 'absolute', left: 0, right: 0, top: '75%', borderTop: `1.5px solid ${LINE}` }} />
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div>
      {/* Controls — half + depth toggles (left), highlight team (right) */}
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid rgba(10,27,51,0.1)' }}>
            {(['top', 'bottom'] as const).map(h => (
              <button
                key={h}
                onClick={() => setHalf(h)}
                className="px-4 py-2 text-xs font-bold transition-colors"
                style={{ background: half === h ? 'rgba(14,111,196,0.1)' : '#FFFFFF', color: half === h ? 'var(--blue)' : 'var(--ink-2)' }}
              >
                {h === 'top' ? 'Left Half' : 'Right Half'}
              </button>
            ))}
          </div>
          <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid rgba(10,27,51,0.1)' }}>
            {([['full', `Full draw (${TOURNAMENT.drawSize})`], ['last32', 'Last 32']] as const).map(([d, label]) => (
              <button
                key={d}
                onClick={() => setDepth(d)}
                className="px-4 py-2 text-xs font-bold transition-colors"
                style={{ background: depth === d ? 'rgba(14,111,196,0.1)' : '#FFFFFF', color: depth === d ? 'var(--blue)' : 'var(--ink-2)' }}
              >
                {label}
              </button>
            ))}
          </div>
          {/* Jump straight to a round in the draw (the tree scrolls to it) */}
          <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid rgba(10,27,51,0.1)' }}>
            {cols.filter(r => r === cols[0] || r === 'SF').concat('F' as WRound).map(r => (
              <button
                key={r}
                onClick={() => scrollToRound(r)}
                className="px-3 py-2 text-xs font-bold transition-colors"
                style={{ background: r === 'F' ? 'rgba(217,154,0,0.1)' : '#FFFFFF', color: r === 'F' ? 'var(--gold)' : 'var(--ink-2)' }}
                title={`Scroll to ${r === 'F' ? 'the Final' : ROUND_LABEL[r]}`}
              >
                {r === 'F' ? '🏆 Final' : ROUND_LABEL[r]}
              </button>
            ))}
          </div>
        </div>
        {teams.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold" style={{ color: 'var(--ink-2)' }}>Highlight team:</span>
            <select
              value={selectedId}
              onChange={e => setTeamId(e.target.value)}
              className="text-xs font-bold rounded-xl px-2.5 py-2 outline-none"
              style={{ background: '#FFFFFF', border: '1px solid rgba(10,27,51,0.1)', color: 'var(--ink)' }}
              title="Highlight a team's players in the draw"
            >
              {teams.map(t => <option key={t.id} value={t.id}>{t.name} · {t.username}</option>)}
            </select>
          </div>
        )}
      </div>
      <div className="flex items-center gap-3 text-[11px] mb-3 flex-wrap" style={{ color: 'var(--ink-3)' }}>
        {highlight.size > 0 && selected && (
          <span className="flex items-center gap-1 font-semibold" style={{ color: 'var(--gold)' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--gold)', display: 'inline-block' }} /> Highlighting {selected.name}'s players (★)
          </span>
        )}
        <span>
          {focus ? <>Tracing <span className="font-bold" style={{ color: 'var(--blue)' }}>{focus}</span> · <button onClick={() => setFocus(null)} className="underline">clear</button></> : 'Tap a player to trace their route'}
        </span>
        <span className="flex items-center gap-1 font-semibold" style={{ color: 'var(--blue)' }}>
          🔒 {currentRoundIndex === 0 ? 'Results hidden — no spoilers. Play a round to reveal it.' : `Revealed through ${ROUNDS[currentRoundIndex - 1]?.label ?? ''}`}
        </span>
      </div>

      {/* Tree */}
      {/* Only the HORIZONTAL axis scrolls inside the tree; vertical scroll bubbles to
          the page, so dragging up/down never gets stuck inside the bracket. */}
      <div ref={treeRef} className="overflow-x-auto rounded-2xl p-3" style={{ background: 'var(--raised)', border: '1px solid rgba(10,27,51,0.07)', overscrollBehaviorX: 'contain' }}>
        <div className="flex items-stretch w-full" style={{ minWidth: 'min-content' }}>
          {cols.map((round, ci) => {
            const matches = FULL_DRAW.filter(m => m.round === round && m.half === half);
            const nextRound = cols[ci + 1];
            const nextCount = nextRound ? FULL_DRAW.filter(m => m.round === nextRound && m.half === half).length : 0;
            return (
              <Fragment key={round}>
                <Column round={round} matches={matches} />
                {nextRound && <Connector count={nextCount} />}
              </Fragment>
            );
          })}
          {/* SF → Final: a single straight join (the other finalist comes from the other half) */}
          <Connector count={1} single />
          {/* Final */}
          <div className="flex flex-col" style={{ width: CARD_W }} data-round="F">
            <ColHeader label="Final 🏆" gold />
            <div className="flex-1 flex flex-col justify-center">
              <MatchCard m={final} />
              <div className="text-[10px] text-center font-semibold mt-2" style={{ color: 'var(--ink-2)' }}>
                Champion: <span style={{ color: 'var(--ink)' }}>{currentRoundIndex > ROUND_IDX.F ? WIMBLEDON_2026_CHAMPION : '—'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
