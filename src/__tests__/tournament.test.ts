import { describe, it, expect } from 'vitest';
import { ROUNDS, MATCHES, getMatchesForRound, getPlayerExit, getOpponentId, upsetBonus } from '../data/tournament';
import { getPlayer } from '../data/players';

describe('tournament bracket integrity', () => {
  it('round points are 2/5/10/20/40', () => {
    expect(ROUNDS.map(r => r.points)).toEqual([2, 5, 10, 20, 40]);
  });

  it('each match has a winner that is one of its two players, and distinct players', () => {
    for (const m of MATCHES) {
      expect(m.p1Id).not.toBe(m.p2Id);
      expect([m.p1Id, m.p2Id]).toContain(m.winnerId);
    }
  });

  it('round sizes are 16/8/4/2/1', () => {
    expect(getMatchesForRound('R32')).toHaveLength(16);
    expect(getMatchesForRound('R16')).toHaveLength(8);
    expect(getMatchesForRound('QF')).toHaveLength(4);
    expect(getMatchesForRound('SF')).toHaveLength(2);
    expect(getMatchesForRound('F')).toHaveLength(1);
  });

  it('R32 features 32 distinct players', () => {
    const players = new Set(getMatchesForRound('R32').flatMap(m => [m.p1Id, m.p2Id]));
    expect(players.size).toBe(32);
  });

  it('winners of a round are exactly the participants of the next round', () => {
    const order = ['R32', 'R16', 'QF', 'SF'] as const;
    const next = ['R16', 'QF', 'SF', 'F'] as const;
    order.forEach((r, i) => {
      const winners = new Set(getMatchesForRound(r).map(m => m.winnerId));
      const participants = new Set(getMatchesForRound(next[i]).flatMap(m => [m.p1Id, m.p2Id]));
      expect(participants).toEqual(winners);
    });
  });
});

describe('getPlayerExit', () => {
  it('champion (alcaraz) has null exit', () => {
    expect(getPlayerExit('alcaraz')).toBeNull();
  });

  it('a first-round loser exits at R32', () => {
    // thompson lost to alcaraz in R32
    expect(getPlayerExit('thompson')).toBe('R32');
  });

  it('exit round matches where the player actually lost', () => {
    for (const p of getMatchesForRound('R32').flatMap(m => [m.p1Id, m.p2Id])) {
      const exit = getPlayerExit(p);
      if (exit === null) continue; // champion
      const lostMatch = MATCHES.find(m => m.round === exit && (m.p1Id === p || m.p2Id === p));
      expect(lostMatch?.winnerId).not.toBe(p);
    }
  });
});

describe('getOpponentId', () => {
  it('returns the other player in a match', () => {
    expect(getOpponentId('alcaraz', 'R32')).toBe('thompson');
    expect(getOpponentId('thompson', 'R32')).toBe('alcaraz');
  });
  it('returns null when the player is not in that round', () => {
    expect(getOpponentId('thompson', 'F')).toBeNull();
  });
});

describe('upsetBonus', () => {
  const rank = (id: string) => getPlayer(id).ranking;

  it('is zero when the winner is equal or higher ranked', () => {
    expect(upsetBonus('alcaraz', 'thompson')).toBe(0); // #1 beats #32 → no upset
    expect(rank('alcaraz')).toBeLessThan(rank('thompson'));
  });

  it('rewards a lower-ranked player beating a higher-ranked one', () => {
    // eubanks (#25) beat rublev (#8): round((25-8)*0.4) = round(6.8) = 7
    expect(upsetBonus('eubanks', 'rublev')).toBe(7);
  });

  it('is capped at 12', () => {
    // biggest possible gap #32 over #1 = round(31*0.4)=round(12.4)=12
    expect(upsetBonus('thompson', 'alcaraz')).toBe(12);
  });

  it('never exceeds 12 for any pair', () => {
    const ids = MATCHES.flatMap(m => [m.p1Id, m.p2Id]);
    for (const a of ids) for (const b of ids) {
      expect(upsetBonus(a, b)).toBeLessThanOrEqual(12);
      expect(upsetBonus(a, b)).toBeGreaterThanOrEqual(0);
    }
  });
});
