import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../store/gameStore';
import { ROUNDS, getMatchesForRound, winPoints } from '../data/tournament';
import { PLAYERS } from '../data/players';
import { scoreEntry, type ScoreCtx, type EntryState } from '../scoring/serverEngine';
import { loadSampleTournament, roles } from './fixtures/sampleDraw';
import { ROUND_META, ROUND_ORDER } from '../data/tournamentConfig';
import edgeSrc from '../../supabase/functions/recompute-score/index.ts?raw';
import seedSrc from '../../supabase/server_scoring.sql?raw';

const store = () => useGameStore.getState();

// Build the server-side context from the same live data the client scores against.
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

// The Deno edge function hard-copies the round-points curve + order (it can't import
// app code). This reads that file as text and asserts the copy hasn't drifted from the
// canonical config — so a future rebalance can't silently desync the authoritative score.
describe('edge function stays in sync with the canonical scoring curve', () => {
  it('recompute-score ROUND_POINTS + ROUND_ORDER match ROUND_META', () => {
    const pointsBlock = edgeSrc.match(/ROUND_POINTS[^{]*\{([^}]*)\}/);
    expect(pointsBlock, 'ROUND_POINTS block found in edge fn').toBeTruthy();
    const edgePoints = Object.fromEntries(
      [...pointsBlock![1].matchAll(/(\w+):\s*(\d+)/g)].map(m => [m[1], Number(m[2])]),
    );
    for (const [round, meta] of Object.entries(ROUND_META)) {
      expect(edgePoints[round], `edge base points for ${round}`).toBe(meta.points);
    }
    const orderBlock = edgeSrc.match(/ROUND_ORDER\s*=\s*\[([^\]]*)\]/);
    const edgeOrder = [...orderBlock![1].matchAll(/'(\w+)'/g)].map(m => m[1]);
    expect(edgeOrder).toEqual(ROUND_ORDER);
  });

  it('player_stats seed ranks match PLAYERS exactly (client ↔ server rank parity)', () => {
    // The client scores off PLAYERS.ranking; the edge fn scores off player_stats.ranking.
    // If they ever diverge, the authoritative leaderboard silently disagrees with the app.
    // Regenerate BOTH together when the field changes — this guards it.
    const seed = Object.fromEntries(
      [...seedSrc.matchAll(/\('([a-z0-9]+)',\s*(\d+)\)/g)].map(m => [m[1], Number(m[2])]),
    );
    expect(Object.keys(seed).length, 'seed rows parsed').toBe(PLAYERS.length);
    for (const p of PLAYERS) {
      expect(seed[p.id], `player_stats rank for ${p.id}`).toBe(p.ranking);
    }
  });
});

describe('server engine handles an off-roster (unknown-rank) opponent like the client', () => {
  it('awards no upset when the loser has no rank on record', () => {
    // A rostered underdog beats an off-roster player (no rank). The client awards no
    // upset there; the server must NOT invent one from a default rank — the exact
    // divergence a champion-only parity test can't catch. (The all-rostered sample
    // draw never produces this pairing, so we assert it directly on the engine.)
    const ctx: ScoreCtx = {
      roundsInOrder: ['R64'],
      roundPoints: { R64: 1 },
      rankById: { [roles.underdog]: 45 }, // 'ghost' opponent deliberately absent
      matches: [{ round: 'R64', p1: roles.underdog, p2: 'ghost-off-roster', winner: roles.underdog }],
    };
    const state: EntryState = { initialSquad: [roles.underdog], playedRounds: ['R64'] };
    expect(scoreEntry(state, ctx)).toBe(winPoints('R64', roles.underdog, 'ghost-off-roster'));
  });
});

describe('server-authoritative scoring == client engine (parity)', () => {
  beforeEach(() => { loadSampleTournament(); store().resetGame(); });

  it('matches the client score for a captained + viced champion run', () => {
    store().addPlayer(roles.champion);  // champion (Platinum)
    store().addPlayer(roles.runnerUp);  // reaches the final (Platinum)
    store().finalizeDraft();
    for (let i = 0; i < ROUNDS.length; i++) play(roles.champion, roles.runnerUp);
    expect(store().phase).toBe('finished');
    expect(scoreEntry(stateFromStore(), buildCtx())).toBe(store().myScore);
  });

  it('matches for a low-ranked underdog whose run banks real upset bonuses', () => {
    store().addPlayer(roles.underdog);
    store().finalizeDraft();
    for (let i = 0; i < ROUNDS.length; i++) play(roles.underdog);
    expect(store().phase).toBe('finished');
    expect(store().myScore).toBeGreaterThan(0);
    expect(scoreEntry(stateFromStore(), buildCtx())).toBe(store().myScore);
  });

  it('matches the client score across a mid-tournament transfer', () => {
    store().addPlayer(roles.champion);  // champion
    store().addPlayer(roles.r16Exit);   // out in R16 → gets transferred
    store().finalizeDraft();
    play(roles.champion, roles.r16Exit); // R64
    play(roles.champion, roles.r16Exit); // R32
    play(roles.champion);                // R16 — r16Exit out
    store().replacePlayer(roles.r16Exit, roles.runnerUp); // buy a still-alive finalist
    for (let i = store().currentRoundIndex; i < ROUNDS.length; i++) play(roles.champion, roles.runnerUp);
    expect(store().phase).toBe('finished');
    // score is identical whether computed by the client or the portable server engine
    expect(scoreEntry(stateFromStore(), buildCtx())).toBe(store().myScore);
  });

  it('falls back to the current squad when a squad is not yet locked (initialSquad empty)', () => {
    store().addPlayer(roles.champion);
    store().addPlayer(roles.runnerUp);
    const locked: EntryState = { initialSquad: [roles.champion, roles.runnerUp], playedRounds: ROUNDS.map(r => r.id) };
    const notLocked: EntryState = { initialSquad: [], myTeam: [roles.champion, roles.runnerUp], playedRounds: ROUNDS.map(r => r.id) };
    const ctx = buildCtx();
    expect(scoreEntry(notLocked, ctx)).toBe(scoreEntry(locked, ctx));
    expect(scoreEntry(notLocked, ctx)).toBeGreaterThan(0);
  });

  it('a manipulated client score would NOT match the authoritative recompute', () => {
    store().addPlayer(roles.champion);
    store().finalizeDraft();
    for (let i = 0; i < ROUNDS.length; i++) play(roles.champion);
    const honest = scoreEntry(stateFromStore(), buildCtx());
    // The leaderboard trusts `honest`, not a self-reported number.
    expect(honest).toBe(store().myScore);
    expect(honest).not.toBe(store().myScore + 999);
  });
});
