import { describe, it, expect, beforeEach } from 'vitest';
import { RIVALS, buildSquad, scoreSquad, getRivalTeams, simulateRival } from '../data/rivals';
import { getPlayer } from '../data/players';
import { ROUNDS, isPlayerOut, winPoints } from '../data/tournament';
import { isSquadValid, tierCounts } from '../data/squadRules';
import { loadSampleTournament, roles, sampleMatches } from './fixtures/sampleDraw';

// Rivals score against the live draw; load a resolved sample so results are deterministic.
beforeEach(loadSampleTournament);

describe('rivals squad building', () => {
  it('every rival strategy yields a legal 10-player squad within $200M meeting the tier rule', () => {
    for (const r of RIVALS) {
      const squad = buildSquad(r.rank);
      expect(squad).toHaveLength(10);
      expect(new Set(squad).size).toBe(10);
      const spent = squad.reduce((s, id) => s + getPlayer(id).price, 0);
      expect(spent).toBeLessThanOrEqual(200);
      // 2 Platinum, 3 Gold, 5 Silver
      expect(isSquadValid(squad)).toBe(true);
      const c = tierCounts(squad);
      expect(c.Platinum).toBe(2);
      expect(c.Gold).toBe(3);
      expect(c.Silver).toBe(5);
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

  it('each rival strategy drafts a distinct squad (no dead/duplicate strategies)', () => {
    const squads = RIVALS.map(r => buildSquad(r.rank).join(','));
    expect(new Set(squads).size).toBe(RIVALS.length);
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

  it('a solo champion scores the full captained title run', () => {
    // The static reference scorer captains the solo player, so a champion who wins every
    // round banks each win doubled — derived from the fixture, not a hard-coded number.
    const champScore = ROUNDS.reduce((s, r) => {
      const m = sampleMatches.find(x => x.round === r.id && (x.p1Id === roles.champion || x.p2Id === roles.champion));
      if (!m || m.winnerId !== roles.champion) return s;
      const opp = m.p1Id === roles.champion ? m.p2Id : m.p1Id;
      return s + winPoints(r.id, roles.champion, opp) * 2;
    }, 0);
    expect(scoreSquad([roles.champion], ROUNDS.length)).toBe(champScore);
  });
});

describe('transfer-aware simulation', () => {
  it('always keeps a legal 10-player squad and non-negative budget at every round', () => {
    for (const r of RIVALS) {
      for (let upto = 0; upto <= ROUNDS.length; upto++) {
        const t = simulateRival(r, upto);
        expect(t.squad).toHaveLength(10);
        expect(new Set(t.squad).size).toBe(10);
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
        expect(isPlayerOut(tr.out, revealedByRound(tr.round))).toBe(true);
        // the player transferred IN was still alive at that round
        expect(isPlayerOut(tr.in, revealedByRound(tr.round))).toBe(false);
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

  it('no manager transfers after the semi-finals (window locked for the final)', () => {
    for (const r of RIVALS) {
      const t = simulateRival(r, ROUNDS.length);
      for (const tr of t.transfers) {
        // transfers react to R64..QF eliminations (prep for the next round); never SF/F
        expect(['R64', 'R32', 'R16', 'QF']).toContain(tr.round);
      }
    }
  });

  it('reacting to eliminations helps on net (managers do transfer, and it pays off in aggregate)', () => {
    const sims = RIVALS.map(r => simulateRival(r, ROUNDS.length));
    // managers actually react to eliminations
    expect(sims.some(s => s.transfers.length > 0)).toBe(true);
    // Under fair pre-declared captaincy a single transfer can occasionally backfire
    // (a newly-bought captain loses), but reacting pays off across the league.
    const dynamicTotal = sims.reduce((t, s) => t + s.score, 0);
    const frozenTotal = sims.reduce((t, s) => t + scoreSquad(s.initialSquad, ROUNDS.length), 0);
    expect(dynamicTotal).toBeGreaterThanOrEqual(frozenTotal);
  });
});
