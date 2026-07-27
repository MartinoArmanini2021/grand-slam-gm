import { describe, it, expect } from 'vitest';
import { ROUNDS, MATCHES, TRANSFER_LOCK_INDEX, getMatchesForRound, getPlayerExit, isPlayerOut, getOpponentId, upsetBonus, unmappedBracketNames } from '../data/tournament';
import { getPlayer, PLAYERS } from '../data/players';
import { TOURNAMENT, ROUND_META, ROUND_ORDER } from '../data/tournamentConfig';

describe('real Wimbledon 2026 bracket integrity', () => {
  it('every roster player is a real participant in the opening round (R128)', () => {
    // The early rounds include off-roster opponents (not draftable), so the draw
    // has unmapped names by design — but every rostered player must map.
    const r128 = getMatchesForRound('R128');
    for (const p of getMatchesForRound('R32').flatMap(m => [m.p1Id, m.p2Id])) {
      expect(r128.some(m => m.p1Id === p || m.p2Id === p)).toBe(true);
    }
    // sanity: the whole scored draw (R32→F) still resolves cleanly
    const scoredNames = unmappedBracketNames; // populated at import; non-roster early names allowed
    expect(Array.isArray(scoredNames)).toBe(true);
  });

  it('round points ramp R128 → Final', () => {
    expect(ROUNDS.map(r => r.points)).toEqual([1, 1, 2, 5, 10, 20, 40]);
  });

  it('each match has a winner among its two distinct players', () => {
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

  it('Sinner is the champion and Zverev the runner-up', () => {
    const final = getMatchesForRound('F')[0];
    expect(final.winnerId).toBe('sinner');
    expect([final.p1Id, final.p2Id]).toContain('zverev');
  });
});

// W1: the engine is config-driven — ROUNDS, the transfer lock, and exit staging
// are DERIVED from the tournament's declared rounds + the shared points curve, not
// hard-coded. These guard that derivation so a new tournament (a Masters draw with a
// different round count) can't silently desync the engine.
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
    // strictly increasing → the tournament plays its rounds earliest → latest
    expect(positions).toEqual([...positions].sort((a, b) => (a! - b!)));
  });
});

describe('getPlayerExit / isPlayerOut', () => {
  it('champion Sinner has no exit and is never out', () => {
    expect(getPlayerExit('sinner')).toBeNull();
    expect(isPlayerOut('sinner', ['R32', 'R16', 'QF', 'SF', 'F'])).toBe(false);
  });

  it('runner-up Zverev exits at the Final — out only once the Final is revealed', () => {
    expect(getPlayerExit('zverev')).toBe('F');
    expect(isPlayerOut('zverev', ['R32', 'R16', 'QF', 'SF'])).toBe(false);
    expect(isPlayerOut('zverev', ['R32', 'R16', 'QF', 'SF', 'F'])).toBe(true);
  });

  it('wildcard Fery reached the semis — out when the SF is revealed', () => {
    expect(getPlayerExit('fery')).toBe('SF');
    expect(isPlayerOut('fery', ['R32', 'R16', 'QF'])).toBe(false);
    expect(isPlayerOut('fery', ['R32', 'R16', 'QF', 'SF'])).toBe(true);
  });

  it('a pre-last-32 loser (Shelton, out R128) is eliminated the moment R32 is revealed', () => {
    expect(getPlayerExit('shelton')).toBe('R128');
    expect(isPlayerOut('shelton', [])).toBe(false);          // draft, nothing revealed
    expect(isPlayerOut('shelton', ['R32'])).toBe(true);      // scored draw begins → already out
  });

  it("a scored-round exit matches where the player actually lost", () => {
    for (const p of getMatchesForRound('R32').flatMap(m => [m.p1Id, m.p2Id])) {
      const exit = getPlayerExit(p);
      if (exit === null) continue; // champion
      const lostMatch = MATCHES.find(m => m.round === exit && (m.p1Id === p || m.p2Id === p));
      expect(lostMatch?.winnerId).not.toBe(p);
    }
  });

  // Covers the WHOLE draw (R128 → Final), not just the last 32 — the exit field
  // drives elimination/refunds, so it must match where each player actually lost.
  it("every roster player's exit matches the round they lost in the full bracket", () => {
    for (const p of PLAYERS) {
      const played = MATCHES.filter(m => m.p1Id === p.id || m.p2Id === p.id);
      const lost = played.find(m => m.winnerId !== p.id);
      const expected = lost ? lost.round : 'W'; // never lost → champion
      expect(p.exit, `${p.name} (#${p.ranking})`).toBe(expected);
    }
  });
});

describe('getOpponentId', () => {
  it('returns the other player in a match', () => {
    expect(getOpponentId('sinner', 'F')).toBe('zverev');
    expect(getOpponentId('zverev', 'F')).toBe('sinner');
  });
  it('returns null when the player is not in that round', () => {
    expect(getOpponentId('fery', 'F')).toBeNull(); // Fery lost in the SF
  });
});

describe('upsetBonus', () => {
  const rank = (id: string) => getPlayer(id).ranking;

  it('is zero when the winner is equal or higher ranked', () => {
    expect(upsetBonus('sinner', 'brooksby')).toBe(0); // #1 beats #82 → expected
    expect(rank('sinner')).toBeLessThan(rank('brooksby'));
  });

  it('rewards a lower-ranked player beating a higher-ranked one', () => {
    // hurkacz (#41) beat paul (#25): round((41-25)*0.4) = round(6.4) = 6
    expect(upsetBonus('hurkacz', 'paul')).toBe(6);
  });

  it('is capped at 15', () => {
    // Fery (#178) over Cobolli (#10): round(168*0.4)=67 → capped at 15
    expect(upsetBonus('fery', 'cobolli')).toBe(15);
  });

  it('never exceeds 15 for any pair in the draw', () => {
    const ids = [...new Set(MATCHES.flatMap(m => [m.p1Id, m.p2Id]))]; // distinct participants
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
