import { describe, it, expect } from 'vitest';
import { liveMatches, roundComplete, liveExit, liveOpponent, matchKey, type LiveMatch, type LiveResults } from '../data/liveResults';

// A tiny synthetic 4-player live draw: two SF pairings feeding one Final. Enough to
// exercise every projection (completed vs pending, elimination, opponents) without a
// real tournament — exactly what live mode needs to be testable before Aug 1.
//   SF slot0: alice vs bob
//   SF slot1: cara vs dana
//   F  slot0: (SF0 winner) vs (SF1 winner)
const DRAW: LiveMatch[] = [
  { round: 'SF', slot: 0, half: 'top',    p1Id: 'alice', p2Id: 'bob' },
  { round: 'SF', slot: 1, half: 'bottom', p1Id: 'cara',  p2Id: 'dana' },
  { round: 'F',  slot: 0, half: 'top',    p1Id: 'alice', p2Id: 'dana' },
];

describe('liveResults — pure live projection', () => {
  it('projects only completed matches into engine-shaped Match[]', () => {
    const results: LiveResults = { [matchKey('SF', 0)]: 'alice' }; // only SF0 played
    const matches = liveMatches(DRAW, results);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ round: 'SF', p1Id: 'alice', p2Id: 'bob', winnerId: 'alice' });
    // pending matches carry no winner and must never leak to the engine
    expect(matches.every(m => !!m.winnerId)).toBe(true);
  });

  it('roundComplete is true only when every pairing in the round has a winner', () => {
    expect(roundComplete(DRAW, {}, 'SF')).toBe(false);
    expect(roundComplete(DRAW, { [matchKey('SF', 0)]: 'alice' }, 'SF')).toBe(false); // SF1 still open
    const bothSF = { [matchKey('SF', 0)]: 'alice', [matchKey('SF', 1)]: 'dana' };
    expect(roundComplete(DRAW, bothSF, 'SF')).toBe(true);
  });

  it('roundComplete is false for a round with no pairings', () => {
    expect(roundComplete(DRAW, {}, 'QF')).toBe(false);
  });

  it('derives a player exit from their recorded loss', () => {
    const results: LiveResults = { [matchKey('SF', 0)]: 'alice', [matchKey('SF', 1)]: 'dana' };
    expect(liveExit(DRAW, results, 'bob')).toBe('SF');   // lost the SF
    expect(liveExit(DRAW, results, 'cara')).toBe('SF');  // lost the SF
    expect(liveExit(DRAW, results, 'alice')).toBeNull(); // won her SF, final pending
    expect(liveExit(DRAW, results, 'dana')).toBeNull();  // won her SF, final pending
  });

  it('the champion has no exit; the runner-up exits at the Final', () => {
    const results: LiveResults = {
      [matchKey('SF', 0)]: 'alice',
      [matchKey('SF', 1)]: 'dana',
      [matchKey('F', 0)]: 'alice',
    };
    expect(liveExit(DRAW, results, 'alice')).toBeNull(); // champion
    expect(liveExit(DRAW, results, 'dana')).toBe('F');   // runner-up
  });

  it('a player with no recorded matches has no exit (undrafted / not yet played)', () => {
    expect(liveExit(DRAW, {}, 'ghost')).toBeNull();
  });

  it('finds a player’s opponent in a round off the draw, regardless of results', () => {
    expect(liveOpponent(DRAW, 'alice', 'SF')).toBe('bob');
    expect(liveOpponent(DRAW, 'bob', 'SF')).toBe('alice');
    expect(liveOpponent(DRAW, 'alice', 'F')).toBe('dana');
    expect(liveOpponent(DRAW, 'cara', 'F')).toBeNull(); // Cara isn't in the final
  });
});
