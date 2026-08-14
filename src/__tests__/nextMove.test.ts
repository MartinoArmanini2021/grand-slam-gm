import { describe, it, expect, beforeEach } from 'vitest';
import { buildView } from '../components/NextMove';
import { useGameStore } from '../store/gameStore';
import { useLiveStore } from '../store/liveStore';
import { matchKey } from '../data/liveResults';
import { loadSampleThrough, sampleDraw, sampleResults, roles } from './fixtures/sampleDraw';
import type { GamePhase } from '../types';

// The "Your next move" coach must correctly match each manager's real status at all times. This
// pins the state machine across every phase: before the tournament, the mid-event sign-up, before
// a round, during a round, and once it's over — with the done/pending flags derived from real state.
const noop = () => {};
const view = (over = { hasLeague: false }) => buildView(useGameStore.getState(), over.hasLeague, noop, noop);
const set = (s: Partial<ReturnType<typeof useGameStore.getState>>) => useGameStore.setState(s as never);

beforeEach(() => { loadSampleThrough(null); useGameStore.getState().resetGame(); });

describe('NextMove state machine', () => {
  it('BEFORE THE TOURNAMENT — a 4-step draft checklist; league done once you have a squad or a league', () => {
    loadSampleThrough(null); // no results → tournament hasn't started
    set({ phase: 'draft', myTeam: [], captain: null, viceCaptain: null });
    const v = view();
    expect(v.eyebrow).toBe('Before the tournament');
    expect(v.steps).toHaveLength(4);
    expect(v.steps![0].done).toBe(false); // no league, no squad
    expect(v.steps![1].done).toBe(false); // squad not drafted
    expect(v.steps![3].done).toBe(false); // lock is never "done" while in the draft
    // Playing "the world" (drafting a player) satisfies the league step.
    set({ myTeam: [roles.champion] });
    expect(view().steps![0].done).toBe(true);
    // Or joining a private league does, with no squad yet.
    set({ myTeam: [] });
    expect(view({ hasLeague: true }).steps![0].done).toBe(true);
  });

  it('MID-EVENT SIGN-UP — draft phase but the tournament has started → the spectator path, not a dead draft', () => {
    loadSampleThrough('R64'); // R64 has results → tournamentStarted() is true
    set({ phase: 'draft', myTeam: [] });
    const v = view();
    expect(v.eyebrow).toBe('Draft closed');
    expect(v.steps).toBeUndefined();      // NOT a draft checklist
    expect(v.actions).toBeTruthy();       // spectate + leaderboard
    expect(v.actions!.some(a => /bracket/i.test(a.label))).toBe(true);
  });

  it('BEFORE A ROUND — replace pending when you hold an eliminated player; captain carries forward', () => {
    loadSampleThrough('R64'); // R64 done, R32 up next
    set({
      phase: 'pre_round', currentRoundIndex: 0,
      myTeam: [roles.champion, roles.r64Exit, roles.sfExit, roles.qfExit],
      initialSquad: [roles.champion, roles.r64Exit, roles.sfExit, roles.qfExit], transfers: [],
      captain: roles.champion, viceCaptain: roles.sfExit,
      captainHistory: [{ round: 'R64', playerId: roles.champion }],
      viceCaptainHistory: [{ round: 'R64', playerId: roles.sfExit }],
    });
    const v = view();
    expect(v.eyebrow).toContain('R32');
    expect(v.steps![0].done).toBe(false); // r64Exit is knocked out & still held → replace
    expect(v.steps![1].done).toBe(true);  // captain (champion) carried to R32 and still alive
    expect(v.steps![2].done).toBe(true);  // no unlocked signings
  });

  it('BEFORE A ROUND — flags a captain who has been eliminated', () => {
    loadSampleThrough('R64');
    set({
      phase: 'pre_round', currentRoundIndex: 0,
      myTeam: [roles.champion, roles.sfExit],
      initialSquad: [roles.champion, roles.sfExit], transfers: [],
      captain: roles.r64Exit, viceCaptain: roles.sfExit,
      captainHistory: [{ round: 'R64', playerId: roles.r64Exit }],   // captain lost R64
      viceCaptainHistory: [{ round: 'R64', playerId: roles.sfExit }],
    });
    const cap = view().steps![1];
    expect(cap.done).toBe(false);
    expect(cap.sub).toMatch(/out/i);
  });

  it('BEFORE A ROUND — all clear when nobody is out and the captain is set', () => {
    loadSampleThrough('R64');
    set({
      phase: 'pre_round', currentRoundIndex: 0,
      myTeam: [roles.champion, roles.runnerUp, roles.sfExit, roles.qfExit], // none lost R64
      initialSquad: [roles.champion, roles.runnerUp, roles.sfExit, roles.qfExit], transfers: [],
      captain: roles.champion, viceCaptain: roles.runnerUp,
      captainHistory: [{ round: 'R64', playerId: roles.champion }],
      viceCaptainHistory: [{ round: 'R64', playerId: roles.runnerUp }],
    });
    expect(view().steps!.every(s => s.done)).toBe(true);
  });

  it('DURING A ROUND — a live round in progress → watch, don’t manage', () => {
    loadSampleThrough('R64');
    const oneR32 = sampleDraw.find(m => m.round === 'R32')!;   // reveal a single R32 result → underway
    const k = matchKey(oneR32.round, oneR32.slot);
    useLiveStore.setState(s => ({ ...s, results: { ...s.results, [k]: sampleResults[k] } }));
    set({ phase: 'pre_round', currentRoundIndex: 0, myTeam: [roles.champion], initialSquad: [roles.champion] });
    const v = view();
    expect(v.eyebrow.toLowerCase()).toContain('live');
    expect(v.steps).toBeUndefined();
    expect(v.actions!.some(a => /result/i.test(a.label))).toBe(true);
  });

  it('BEFORE THE FINAL — the market is shut, so it never offers a transfer the store would refuse', () => {
    // Through the SF: the Final is drawn but unplayed. transferWindowOpen() is false from here on
    // (a signing could only score in the Final; eliminations refund 0), so cashInPlayer/buyPlayer
    // both early-return. The card must NOT send the manager to a dead Market.
    loadSampleThrough('SF');
    set({
      phase: 'pre_round', currentRoundIndex: 0,
      myTeam: [roles.champion, roles.qfExit],           // qfExit is knocked out and still held
      initialSquad: [roles.champion, roles.qfExit], transfers: [],
      captain: roles.champion, viceCaptain: roles.champion,
      captainHistory: [{ round: 'R64', playerId: roles.champion }],
      viceCaptainHistory: [{ round: 'R64', playerId: roles.champion }],
    });
    const first = view().steps![0];
    expect(first.label).toMatch(/final/i);              // "Squad is final", not "Replace eliminated"
    expect(first.label).not.toMatch(/replace/i);
    expect(first.done).toBe(true);                      // nothing outstanding — there's nothing you CAN do
    expect(first.sub).toMatch(/no transfers/i);
  });

  it('LOCK SQUAD — an explicit lock ticks the step (it stayed open forever before)', () => {
    loadSampleThrough('R64'); // R64 done, R32 up next → market open, signings score from R32
    const base = {
      phase: 'pre_round' as GamePhase, currentRoundIndex: 0,
      myTeam: [roles.champion, roles.runnerUp],
      initialSquad: [roles.champion, roles.r64Exit],
      // a fresh signing logged against R64 → first scores R32, which hasn't started → "unlocked"
      transfers: [{ out: roles.r64Exit, in: roles.runnerUp, round: 'R64' }],
      captain: roles.champion, viceCaptain: roles.runnerUp,
      captainHistory: [{ round: 'R64', playerId: roles.champion }],
      viceCaptainHistory: [{ round: 'R64', playerId: roles.runnerUp }],
    };
    set({ ...base, finalized: false });
    const open = view().steps![2];
    expect(open.done).toBe(false);                      // pending signing, not yet confirmed
    expect(open.sub).toMatch(/confirm/i);

    set({ ...base, finalized: true });                  // manager clicks "Lock Squad"
    const locked = view().steps![2];
    expect(locked.done).toBe(true);                     // …and the step now ticks
    expect(locked.sub).toMatch(/locked in/i);
  });

  it('TOURNAMENT OVER — every round played out → a performance summary', () => {
    loadSampleThrough('F'); // all rounds decided
    set({ phase: 'pre_round' as GamePhase, currentRoundIndex: 0, myTeam: [roles.champion], initialSquad: [roles.champion] });
    const v = view();
    expect(v.eyebrow).toBe('Tournament over');
    expect(v.title).toMatch(/point/i);
    expect(v.actions).toBeTruthy();
  });
});
