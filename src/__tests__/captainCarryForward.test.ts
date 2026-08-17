import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ROUNDS, getMatchesForRound, liveScore, playerRoundPoints, roundHasResult } from '../data/tournament';
import { PLAYERS } from '../data/players';
import { scoreEntry, type ScoreCtx } from '../scoring/serverEngine';
import { loadSampleTournament, loadSampleThrough, roles } from './fixtures/sampleDraw';
import { useGameStore } from '../store/gameStore';
import { TOURNAMENT } from '../data/tournamentConfig';
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

// ── Late lock must still record a captain ────────────────────────────────────────────────────────
// The draft closes on the first RESULT, but a round counts as STARTED at its scheduled time — so
// there is a real window (play begun, nothing finished) in which a manager can still lock a squad.
// finalizeDraft used to stamp the captain against a hardcoded ROUNDS[0]; recordLeaders refuses a
// started round, so it silently recorded NOTHING. Empty history is fatal rather than merely late:
// leaderOfRecord carries forward from the most recent EARLIER entry, so with none at all the
// manager gets no captain or vice multiplier for the WHOLE tournament. One Cincinnati manager
// locked in that window with both picked in the UI and scored as though neither existed.
describe('locking after the first round has started still records a captain', () => {
  beforeEach(() => { loadSampleThrough(null); useGameStore.getState().resetGame(); });

  const lockLateAndRead = () => {
    const s = useGameStore.getState();
    const squad = [roles.champion, roles.runnerUp, roles.sfExit];
    squad.forEach(id => s.addPlayer(id));
    useGameStore.setState({ captain: roles.champion, viceCaptain: roles.runnerUp });
    useGameStore.getState().finalizeDraft();
    return useGameStore.getState();
  };

  it('records against the first round that has NOT started, not a hardcoded R64', () => {
    const first = ROUNDS[0].id;
    // Clock past R64's scheduled start, but no result yet — the exact window that broke.
    const iso = TOURNAMENT.schedule?.[first];
    if (!iso) return;
    vi.setSystemTime(new Date(Date.parse(iso) + 60_000));
    try {
      const st = lockLateAndRead();
      expect(st.captainHistory.length).toBeGreaterThan(0);      // was [] — the bug
      expect(st.viceCaptainHistory.length).toBeGreaterThan(0);
      expect(st.captainHistory[0].round).not.toBe(first);       // can't claim an already-started round
      expect(st.captainHistory[0].playerId).toBe(roles.champion);
    } finally {
      vi.setSystemTime(new Date('2026-07-01T00:00:00Z'));
    }
  });

  it('still records against the first round when locking before anything starts', () => {
    const st = lockLateAndRead();
    expect(st.captainHistory[0]).toMatchObject({ round: ROUNDS[0].id, playerId: roles.champion });
  });
});
