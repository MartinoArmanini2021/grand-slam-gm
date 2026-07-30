import { describe, it, expect, beforeEach } from 'vitest';
import { ROUNDS, TRANSFER_LOCK_INDEX, getMatchesForRound, getPlayerExit, isPlayerOut, getOpponentId, upsetBonus } from '../data/tournament';
import { getPlayer, PLAYERS } from '../data/players';
import { TOURNAMENT, ROUND_META, ROUND_ORDER } from '../data/tournamentConfig';
import { sampleMatches, loadSampleTournament, roles } from './fixtures/sampleDraw';

// The live engine scores whatever draw+results are in the live store. These tests load
// a known finished draw (the sample fixture) so the engine's projection is deterministic.
beforeEach(loadSampleTournament);

describe('live draw projection integrity', () => {
  it('every player in R32 also appears in the opening round (full draw resolves)', () => {
    const opening = getMatchesForRound('R64');
    for (const p of getMatchesForRound('R32').flatMap(m => [m.p1Id, m.p2Id])) {
      expect(opening.some(m => m.p1Id === p || m.p2Id === p)).toBe(true);
    }
  });

  it('round points ramp R64 → Final', () => {
    expect(ROUNDS.map(r => r.points)).toEqual([1, 2, 5, 10, 20, 40]);
  });

  it('each match has a winner among its two distinct players', () => {
    for (const m of sampleMatches) {
      expect(m.p1Id).not.toBe(m.p2Id);
      expect([m.p1Id, m.p2Id]).toContain(m.winnerId);
    }
  });

  it('round sizes are 32/16/8/4/2/1', () => {
    expect(getMatchesForRound('R64')).toHaveLength(32);
    expect(getMatchesForRound('R32')).toHaveLength(16);
    expect(getMatchesForRound('R16')).toHaveLength(8);
    expect(getMatchesForRound('QF')).toHaveLength(4);
    expect(getMatchesForRound('SF')).toHaveLength(2);
    expect(getMatchesForRound('F')).toHaveLength(1);
  });

  it('the opening round features 64 distinct players', () => {
    const players = new Set(getMatchesForRound('R64').flatMap(m => [m.p1Id, m.p2Id]));
    expect(players.size).toBe(64);
  });

  it('winners of a round are exactly the participants of the next round', () => {
    const order = ['R64', 'R32', 'R16', 'QF', 'SF'] as const;
    const next = ['R32', 'R16', 'QF', 'SF', 'F'] as const;
    order.forEach((r, i) => {
      const winners = new Set(getMatchesForRound(r).map(m => m.winnerId));
      const participants = new Set(getMatchesForRound(next[i]).flatMap(m => [m.p1Id, m.p2Id]));
      expect(participants).toEqual(winners);
    });
  });

  it('the sample champion wins the final over the runner-up', () => {
    const final = getMatchesForRound('F')[0];
    expect(final.winnerId).toBe(roles.champion);
    expect([final.p1Id, final.p2Id]).toContain(roles.runnerUp);
  });
});

// The engine is config-driven — ROUNDS, the transfer lock, and exit staging are DERIVED
// from the tournament's declared rounds + the shared points curve, not hard-coded. These
// guard that derivation so a new tournament (a different round count) can't silently desync.
describe('config-driven round structure', () => {
  it('ROUNDS is exactly the tournament’s declared rounds, in order', () => {
    expect(ROUNDS.map(r => r.id)).toEqual(TOURNAMENT.rounds);
  });

  it('every round’s points come from the one shared curve (ROUND_META)', () => {
    for (const r of ROUNDS) {
      expect(r.points).toBe(ROUND_META[r.id].points);
      expect(r.label).toBe(ROUND_META[r.id].label);
    }
  });

  it('the transfer lock is the last round’s index (penultimate round still swappable)', () => {
    expect(TRANSFER_LOCK_INDEX).toBe(ROUNDS.length - 1);
  });

  it('declared rounds are a subset of the canonical ordering, and in canonical order', () => {
    const orderPos = new Map(ROUND_ORDER.map((r, i) => [r, i]));
    const positions = TOURNAMENT.rounds.map(r => orderPos.get(r));
    expect(positions.every(p => p !== undefined)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => (a! - b!)));
  });
});

describe('getPlayerExit / isPlayerOut (derived from live results)', () => {
  it('the champion has no exit and is never out', () => {
    expect(getPlayerExit(roles.champion)).toBeNull();
    expect(isPlayerOut(roles.champion, ['R32', 'R16', 'QF', 'SF', 'F'])).toBe(false);
  });

  it('the runner-up exits at the Final — out only once the Final is revealed', () => {
    expect(getPlayerExit(roles.runnerUp)).toBe('F');
    expect(isPlayerOut(roles.runnerUp, ['R32', 'R16', 'QF', 'SF'])).toBe(false);
    expect(isPlayerOut(roles.runnerUp, ['R32', 'R16', 'QF', 'SF', 'F'])).toBe(true);
  });

  it('the underdog reached the semis — out when the SF is revealed', () => {
    expect(getPlayerExit(roles.underdog)).toBe('SF');
    expect(isPlayerOut(roles.underdog, ['R32', 'R16', 'QF'])).toBe(false);
    expect(isPlayerOut(roles.underdog, ['R32', 'R16', 'QF', 'SF'])).toBe(true);
  });

  it('an opening-round loser is eliminated the moment R64 is revealed', () => {
    expect(getPlayerExit(roles.r64Exit)).toBe('R64');
    expect(isPlayerOut(roles.r64Exit, [])).toBe(false);       // draft, nothing revealed
    expect(isPlayerOut(roles.r64Exit, ['R64'])).toBe(true);   // opening round resolved → out
  });

  it("every roster player's exit matches the round they lost in the full draw", () => {
    for (const p of PLAYERS) {
      const played = sampleMatches.filter(m => m.p1Id === p.id || m.p2Id === p.id);
      const lost = played.find(m => m.winnerId !== p.id);
      const expected = lost ? lost.round : null; // never lost → champion (null exit)
      expect(getPlayerExit(p.id), `${p.name} (#${p.ranking})`).toBe(expected);
    }
  });
});

describe('getOpponentId', () => {
  it('returns the other player in a match', () => {
    expect(getOpponentId(roles.champion, 'F')).toBe(roles.runnerUp);
    expect(getOpponentId(roles.runnerUp, 'F')).toBe(roles.champion);
  });
  it('returns null when the player is not in that round', () => {
    expect(getOpponentId(roles.underdog, 'F')).toBeNull(); // underdog lost in the SF
  });
});

describe('upsetBonus', () => {
  const rank = (id: string) => getPlayer(id).ranking;

  it('is zero when the winner is equal or higher ranked', () => {
    expect(upsetBonus(roles.champion, roles.r64Exit)).toBe(0); // #4 beats #27 → expected
    expect(rank(roles.champion)).toBeLessThan(rank(roles.r64Exit));
  });

  it('rewards a lower-ranked player beating a higher-ranked one', () => {
    const a = roles.r64Exit, b = roles.r16Exit; // #27 over #11
    const expected = Math.min(15, Math.round((rank(a) - rank(b)) * 0.4));
    expect(expected).toBeGreaterThan(0);
    expect(expected).toBeLessThan(15);
    expect(upsetBonus(a, b)).toBe(expected);
  });

  it('is capped at 15', () => {
    const a = roles.underdog, b = roles.qfExit; // #45 over #2
    expect(Math.round((rank(a) - rank(b)) * 0.4)).toBeGreaterThan(15); // raw exceeds cap
    expect(upsetBonus(a, b)).toBe(15);
  });

  it('never exceeds 15 for any pair in the draw', () => {
    const ids = [...new Set(sampleMatches.flatMap(m => [m.p1Id, m.p2Id]))];
    let min = Infinity, max = -Infinity;
    for (const a of ids) for (const b of ids) {
      const bonus = upsetBonus(a, b);
      if (bonus < min) min = bonus;
      if (bonus > max) max = bonus;
    }
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThanOrEqual(15);
  });
});
