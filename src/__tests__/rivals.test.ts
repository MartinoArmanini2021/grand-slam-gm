import { describe, it, expect } from 'vitest';
import { RIVALS, buildSquad, scoreSquad, getRivalTeams, simulateRival } from '../data/rivals';
import { getPlayer } from '../data/players';
import { ROUNDS, getPlayerExit } from '../data/tournament';

describe('rivals squad building', () => {
  it('every rival strategy yields a legal 6-player squad within $100M', () => {
    for (const r of RIVALS) {
      const squad = buildSquad(r.rank);
      expect(squad).toHaveLength(6);
      expect(new Set(squad).size).toBe(6);
      const spent = squad.reduce((s, id) => s + getPlayer(id).price, 0);
      expect(spent).toBeLessThanOrEqual(100);
    }
  });

  it('getRivalTeams returns 5 teams with a captain inside their squad', () => {
    const teams = getRivalTeams(ROUNDS.length);
    expect(teams).toHaveLength(5);
    for (const t of teams) {
      expect(t.squad).toContain(t.captainId);
      expect(t.budget).toBeGreaterThanOrEqual(0);
    }
  });

  it('getRivalTeams is cached per round index', () => {
    expect(getRivalTeams(3)).toBe(getRivalTeams(3));
  });
});

describe('static scoreSquad (reference)', () => {
  it('score is 0 before any round and non-decreasing as rounds reveal', () => {
    const squad = buildSquad(RIVALS[0].rank);
    let prev = scoreSquad(squad, 0);
    expect(prev).toBe(0);
    for (let i = 1; i <= ROUNDS.length; i++) {
      const s = scoreSquad(squad, i);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });

  it('a solo champion squad scores 154 over the full tournament', () => {
    expect(scoreSquad(['alcaraz'], ROUNDS.length)).toBe(154);
  });
});

describe('transfer-aware simulation', () => {
  it('always keeps a legal 6-player squad and non-negative budget at every round', () => {
    for (const r of RIVALS) {
      for (let upto = 0; upto <= ROUNDS.length; upto++) {
        const t = simulateRival(r, upto);
        expect(t.squad).toHaveLength(6);
        expect(new Set(t.squad).size).toBe(6);
        expect(t.budget).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('score is non-decreasing as rounds are played', () => {
    for (const r of RIVALS) {
      let prev = -1;
      for (let upto = 0; upto <= ROUNDS.length; upto++) {
        const s = simulateRival(r, upto).score;
        expect(s).toBeGreaterThanOrEqual(prev);
        prev = s;
      }
    }
  });

  it('every transfer swaps an eliminated player for an affordable, still-alive one', () => {
    for (const r of RIVALS) {
      const t = simulateRival(r, ROUNDS.length);
      const revealedByRound = (round: string) => {
        const idx = ROUNDS.findIndex(x => x.id === round);
        return ROUNDS.slice(0, idx + 1).map(x => x.id);
      };
      for (const tr of t.transfers) {
        // the player transferred OUT was eliminated by that round
        const outExit = getPlayerExit(tr.out);
        expect(outExit && revealedByRound(tr.round).includes(outExit)).toBeTruthy();
        // the player transferred IN was still alive at that round
        const inExit = getPlayerExit(tr.in);
        expect(inExit === null || !revealedByRound(tr.round).includes(inExit)).toBeTruthy();
      }
    }
  });

  it('transfers never exceed available money (spend is covered by draft leftover + returns)', () => {
    for (const r of RIVALS) {
      const t = simulateRival(r, ROUNDS.length);
      // final squad cost minus initial cost must be <= returns banked (budget stays >= 0 throughout,
      // which the per-round invariant above already guarantees). Here just assert budget is finite & >= 0.
      expect(Number.isFinite(t.budget)).toBe(true);
      expect(t.budget).toBeGreaterThanOrEqual(0);
    }
  });

  it('no manager transfers after the quarter-finals (window locked for SF & final)', () => {
    for (const r of RIVALS) {
      const t = simulateRival(r, ROUNDS.length);
      for (const tr of t.transfers) {
        // transfers are triggered by eliminations in R32 or R16 only (prep for R16/QF)
        expect(['R32', 'R16']).toContain(tr.round);
      }
    }
  });

  it('reacting to eliminations helps: at least one manager transfers and improves vs its frozen squad', () => {
    const anyTransfers = RIVALS.some(r => simulateRival(r, ROUNDS.length).transfers.length > 0);
    expect(anyTransfers).toBe(true);
    // for a manager that transferred, the dynamic score should be >= the frozen-squad score
    for (const r of RIVALS) {
      const sim = simulateRival(r, ROUNDS.length);
      if (sim.transfers.length === 0) continue;
      const frozen = scoreSquad(sim.initialSquad, ROUNDS.length);
      expect(sim.score).toBeGreaterThanOrEqual(frozen);
    }
  });
});
