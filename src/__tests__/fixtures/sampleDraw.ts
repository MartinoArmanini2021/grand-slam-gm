// A synthetic, fully-decided 6-round (R64 → Final) draw built from the LIVE field, used
// ONLY to validate the scoring/economy engine deterministically. The app never imports
// this — production awaits real results. Because it's generated from PLAYERS (not a fixed
// roster) and exposes ROLES (champion, underdog, exits) rather than hard-coded names, it
// stays correct across field changes: tests reference roles, not "sinner".
import { PLAYERS } from '../../data/players';
import { useLiveStore } from '../../store/liveStore';
import { liveMatches, matchKey, type LiveMatch, type LiveResults } from '../../data/liveResults';
import type { Match, RoundId } from '../../types';

const ROUND_SEQ: RoundId[] = ['R64', 'R32', 'R16', 'QF', 'SF', 'F'];

// Top 64 entrants by rank — seed 0 is the best-ranked (the eventual champion).
const seeds = [...PLAYERS].sort((a, b) => a.ranking - b.ranking).slice(0, 64);

// Standard bracket seed positions for 64 players (so seed 0 and 1 can only meet in the
// final). Recursive reflection: [0,1] → [0,3,1,2] → …
function seedPositions(n: number): number[] {
  let arr = [0, 1];
  while (arr.length < n) {
    const m = arr.length * 2;
    const next: number[] = [];
    for (const s of arr) { next.push(s); next.push(m - 1 - s); }
    arr = next;
  }
  return arr;
}

// One scripted upset run: this seed wins R64→QF (reaches the SF) before losing — giving a
// cheap, low-ranked player a deep run for the underdog-captain test. 40 ≈ a Silver-tier rank.
const UNDERDOG_SEED = 40;

const draw: LiveMatch[] = [];
const results: LiveResults = {};
let alive = seedPositions(64).map(si => ({ seed: si, id: seeds[si].id }));

for (let r = 0; r < ROUND_SEQ.length; r++) {
  const round = ROUND_SEQ[r];
  const half = alive.length / 4;
  const next: typeof alive = [];
  for (let slot = 0; slot < alive.length / 2; slot++) {
    const a = alive[2 * slot], b = alive[2 * slot + 1];
    draw.push({ round, slot, half: slot < half ? 'top' : 'bottom', p1Id: a.id, p2Id: b.id });
    const underdog = a.seed === UNDERDOG_SEED ? a : b.seed === UNDERDOG_SEED ? b : null;
    // Underdog wins rounds 0..3 (R64→QF) then loses the SF; otherwise the better seed wins.
    const winner = underdog && r <= 3 ? underdog : (a.seed < b.seed ? a : b);
    results[matchKey(round, slot)] = winner.id;
    next.push(winner);
  }
  alive = next;
}

export const sampleDraw: LiveMatch[] = draw;
export const sampleResults: LiveResults = results;
export const sampleMatches: Match[] = liveMatches(sampleDraw, sampleResults);

// The round each player lost in (null = champion), derived from the results.
function exitOf(id: string): RoundId | null {
  for (const m of sampleDraw) {
    if (m.p1Id !== id && m.p2Id !== id) continue;
    const w = sampleResults[matchKey(m.round, m.slot)];
    if (w && w !== id) return m.round;
  }
  return null;
}
const firstWithExit = (round: RoundId | null) => (PLAYERS.find(p => exitOf(p.id) === round)?.id ?? '');

// Named roles so tests never hard-code a player id (survives field changes). Derived
// from the actual results — exactly one player never loses (the champion).
export const roles = {
  champion: PLAYERS.find(p => sampleDraw.some(m => m.p1Id === p.id || m.p2Id === p.id) && exitOf(p.id) === null)!.id,
  runnerUp: firstWithExit('F'),                // lost the final
  underdog: seeds[UNDERDOG_SEED].id,           // cheap pick, scripted to reach the SF
  sfExit: firstWithExit('SF'),
  qfExit: firstWithExit('QF'),
  r16Exit: firstWithExit('R16'),
  r32Exit: firstWithExit('R32'),
  r64Exit: firstWithExit('R64'),               // lost the opening scored round
};

// Load the sample tournament into the live store — call in a test's beforeEach.
export function loadSampleTournament(): void {
  useLiveStore.setState({ draw: sampleDraw, results: sampleResults, overrides: {}, lastSync: null });
}
