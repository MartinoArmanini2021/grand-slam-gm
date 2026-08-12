import { describe, it, expect } from 'vitest';
import { parseBracket, buildResolver } from '../data/drawParser';
import { liveMatches, roundComplete, liveExit, type LiveMatch, type LiveResults } from '../data/liveResults';
import type { RoundId } from '../types';

// ── The two-different-scores bug ─────────────────────────────────────────────
// Observed live: Home showed 103.0 while the leaderboard showed 59.0 for the same squad.
// Cause: the CLIENT parses the draw with includeIncomplete=true (so the bracket can show
// pairings as they publish). For a half-published pairing (realPlayer, TBD) the winner
// fallback — "whoever fills the next round's slot" — declared the known side the winner of
// a match that had NOT been played. That phantom win scored real points on the client; the
// server (includeIncomplete=false) scored none. Worse, client results are persisted and
// merged, never deleted, so a phantom win stuck permanently in that browser.

const roster = [
  { id: 'zverev', name: 'Alexander Zverev' },
  { id: 'khachanov', name: 'Karen Khachanov' },
  { id: 'shelton', name: 'Ben Shelton' },
];

// slot 0 fully published; slot 1 has only the top player, and the NEXT round already lists him.
const halfPublished = `{{4TeamBracket
| RD1-team1 = [[Alexander Zverev]]
| RD1-team2 = [[Karen Khachanov]]
| RD1-team3 = [[Ben Shelton]]
| RD2-team1 = [[Alexander Zverev]]
| RD2-team2 = [[Ben Shelton]]
}}`;

describe('a half-published pairing never produces a result', () => {
  const resolve = buildResolver(roster);
  const rounds = ['R64', 'R32'] as RoundId[];

  it('display mode still SHOWS the incomplete pairing (the bracket needs it)', () => {
    const client = parseBracket(halfPublished, rounds, resolve, true);
    expect(client.draw.find(m => m.round === 'R64' && m.slot === 1)).toMatchObject({ p1Id: 'shelton', p2Id: 'tbd' });
  });

  it('but awards NO winner for it — client results now equal the server exactly', () => {
    const client = parseBracket(halfPublished, rounds, resolve, true);
    const server = parseBracket(halfPublished, rounds, resolve, false);
    // The regression: this used to be { R64_0: 'zverev', R64_1: 'shelton' } on the client.
    expect(client.results).toEqual({ R64_0: 'zverev' });
    expect(client.results).toEqual(server.results);
  });
});

describe('a legacy phantom result already in localStorage can never score', () => {
  // A browser that recorded a phantom win BEFORE the parser fix still carries it, because
  // mergeResults only ever adds. Every scoring path re-checks the pairing, so it's inert.
  const draw: LiveMatch[] = [
    { round: 'R64' as RoundId, slot: 0, half: 'top', p1Id: 'zverev', p2Id: 'khachanov' },
    { round: 'R64' as RoundId, slot: 1, half: 'bottom', p1Id: 'shelton', p2Id: 'tbd' },
  ];
  const results: LiveResults = { R64_0: 'zverev', R64_1: 'shelton' }; // R64_1 is the stale phantom

  it('liveMatches drops the half-published pairing, so it earns nothing', () => {
    const matches = liveMatches(draw, results);
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe('R64_0');
  });

  it('the round is NOT complete while a pairing is half-published', () => {
    // Otherwise the round could be "played" (and scored) before it had actually finished.
    expect(roundComplete(draw, results, 'R64' as RoundId)).toBe(false);
  });

  it('nobody is eliminated by a match that is not fully drawn', () => {
    expect(liveExit(draw, results, 'tbd')).toBeNull();
    expect(liveExit(draw, results, 'khachanov')).toBe('R64'); // a real loss still counts
  });
});
