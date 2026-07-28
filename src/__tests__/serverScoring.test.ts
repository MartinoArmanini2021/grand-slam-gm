import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../store/gameStore';
import { ROUNDS, getMatchesForRound } from '../data/tournament';
import { PLAYERS } from '../data/players';
import { scoreEntry, type ScoreCtx, type EntryState } from '../scoring/serverEngine';

const store = () => useGameStore.getState();

// Build the server-side context from the same baked data the client scores against.
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

function stateFromStore(): EntryState {
  const s = store();
  return {
    initialSquad: s.initialSquad,
    transfers: s.transfers,
    captainHistory: s.captainHistory,
    viceCaptainHistory: s.viceCaptainHistory,
    playedRounds: ROUNDS.slice(0, s.currentRoundIndex).map(r => r.id),
  };
}

// Mirror the real UI flow: round_complete → pre_round before playing the next round.
const play = (cap: string, vice?: string) => {
  if (store().phase === 'round_complete') useGameStore.setState({ phase: 'pre_round' });
  store().setCaptain(cap);
  if (vice) store().setViceCaptain(vice);
  store().playNextRound();
};

describe('server-authoritative scoring == client engine (parity)', () => {
  beforeEach(() => store().resetGame());

  it('matches the client score for a captained + viced champion run', () => {
    store().addPlayer('sinner');  // champion (Platinum)
    store().addPlayer('zverev');  // reaches the final (Platinum)
    store().finalizeDraft();
    for (let i = 0; i < ROUNDS.length; i++) play('sinner', 'zverev');
    expect(store().phase).toBe('finished');
    expect(scoreEntry(stateFromStore(), buildCtx())).toBe(store().myScore);
  });

  it('matches the client score across a mid-tournament transfer', () => {
    store().addPlayer('sinner');   // champion
    store().addPlayer('lehecka');  // out in R16 → gets transferred
    store().finalizeDraft();
    play('sinner', 'lehecka'); // R128
    play('sinner', 'lehecka'); // R64
    play('sinner', 'lehecka'); // R32
    play('sinner');            // R16 — lehecka out
    store().replacePlayer('lehecka', 'zverev'); // buy a still-alive finalist
    for (let i = store().currentRoundIndex; i < ROUNDS.length; i++) play('sinner', 'zverev');
    expect(store().phase).toBe('finished');
    // score is identical whether computed by the client or the portable server engine
    expect(scoreEntry(stateFromStore(), buildCtx())).toBe(store().myScore);
  });

  it('falls back to the current squad when a squad is not yet locked (initialSquad empty)', () => {
    store().addPlayer('sinner');
    store().addPlayer('zverev');
    const locked: EntryState = { initialSquad: ['sinner', 'zverev'], playedRounds: ROUNDS.map(r => r.id) };
    const notLocked: EntryState = { initialSquad: [], myTeam: ['sinner', 'zverev'], playedRounds: ROUNDS.map(r => r.id) };
    const ctx = buildCtx();
    expect(scoreEntry(notLocked, ctx)).toBe(scoreEntry(locked, ctx));
    expect(scoreEntry(notLocked, ctx)).toBeGreaterThan(0);
  });

  it('a manipulated client score would NOT match the authoritative recompute', () => {
    store().addPlayer('sinner');
    store().finalizeDraft();
    for (let i = 0; i < ROUNDS.length; i++) play('sinner');
    const honest = scoreEntry(stateFromStore(), buildCtx());
    // The leaderboard trusts `honest`, not a self-reported number.
    expect(honest).toBe(store().myScore);
    expect(honest).not.toBe(store().myScore + 999);
  });
});
