import { describe, it, expect, beforeEach } from 'vitest';
import { ROUNDS, getMatchesForRound, liveScore, playerRoundPoints, roundHasResult } from '../data/tournament';
import { PLAYERS } from '../data/players';
import { scoreEntry, type ScoreCtx } from '../scoring/serverEngine';
import { loadSampleTournament, roles } from './fixtures/sampleDraw';
import type { RoundId } from '../types';

// Guards the per-round captaincy fix: a captain of record carries forward from the round it was set
// until changed, so the ×2 applies EVERY round (R64→F) — not only R64 (the shipped bug) — and the
// client display stays in lock-step with the authoritative serverEngine.
function buildCtx(): ScoreCtx {
  const matches = ROUNDS.flatMap(r =>
    getMatchesForRound(r.id).map(m => ({ round: r.id as string, p1: m.p1Id, p2: m.p2Id, winner: m.winnerId ?? null })));
  return {
    roundsInOrder: ROUNDS.map(r => r.id),
    roundPoints: Object.fromEntries(ROUNDS.map(r => [r.id, r.points])),
    rankById: Object.fromEntries(PLAYERS.map(p => [p.id, p.ranking])),
    matches,
  };
}

describe('captain carry-forward (per-round captaincy)', () => {
  beforeEach(() => loadSampleTournament()); // full draw + every result

  const squad = () => [roles.champion, roles.runnerUp, roles.sfExit, roles.qfExit, roles.r16Exit, roles.r32Exit];
  const playedRounds = () => ROUNDS.map(r => r.id).filter(id => roundHasResult(id)) as RoundId[];

  it('a captain set only at R64 is doubled EVERY round it wins, not just R64', () => {
    const initial = squad();
    const capHist = [{ round: 'R64', playerId: roles.champion }];
    const noCap = liveScore(initial, [], [], []);
    const carry = liveScore(initial, [], capHist, []);
    // The champion's plain (un-captained) total across all rounds they played.
    const champPlain = playedRounds().reduce((s, r) => s + playerRoundPoints(roles.champion, r, [], []), 0);
    // Captaincy adds exactly ONE extra copy of the champion each round → their full base total.
    // If the ×2 were R64-only (the bug), the delta would be just the champion's R64 base (~1 pt).
    expect(carry - noCap).toBeCloseTo(champPlain, 5);
    expect(playedRounds().length).toBeGreaterThan(3); // champion won several rounds — not a degenerate case
    expect(champPlain).toBeGreaterThan(playerRoundPoints(roles.champion, 'R64', [], [])); // more than the R64 base alone
  });

  it('client liveScore === authoritative serverEngine for a carry-forward captain + vice', () => {
    const initial = squad();
    const capHist = [{ round: 'R64', playerId: roles.champion }];
    const viceHist = [{ round: 'R64', playerId: roles.runnerUp }];
    const client = liveScore(initial, [], capHist, viceHist);
    const server = scoreEntry({ initialSquad: initial, transfers: [], captainHistory: capHist, viceCaptainHistory: viceHist, playedRounds: playedRounds() }, buildCtx());
    expect(server).toBeCloseTo(client, 5);
  });

  it('a mid-tournament captain change applies each pick to its round onward (client === server)', () => {
    const initial = squad();
    // Champion captained R64→R16, then switched to runnerUp from the QF on.
    const capHist = [{ round: 'R64', playerId: roles.champion }, { round: 'QF', playerId: roles.runnerUp }];
    const client = liveScore(initial, [], capHist, []);
    const server = scoreEntry({ initialSquad: initial, transfers: [], captainHistory: capHist, viceCaptainHistory: [], playedRounds: playedRounds() }, buildCtx());
    expect(server).toBeCloseTo(client, 5);
    // The switch must actually change the total vs. keeping the champion captain all the way.
    const stayChampion = liveScore(initial, [], [{ round: 'R64', playerId: roles.champion }], []);
    expect(client).not.toBeCloseTo(stayChampion, 5);
  });
});
