import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Read-only mode, exercised rather than inspected ──────────────────────────────────────────────
//
// A finished tournament must not be writable. The danger is not a rejected save — it is what the
// app does WITH a rejection: CloudSync maps a server "invalid" to revertToCloud(), which overwrites
// local state with the server's copy. So a manager who taps something on a finished event does not
// merely fail to save; they can lose whatever they were doing.
//
// These tests force IS_READ_ONLY true and then try to mutate through the real store actions. Every
// one must be inert. Checking the guards by reading them would prove only that the text is present.
vi.mock('../data/tournamentConfig', async () => {
  const actual = await vi.importActual<typeof import('../data/tournamentConfig')>('../data/tournamentConfig');
  return { ...actual, IS_READ_ONLY: true };
});

const { useGameStore } = await import('../store/gameStore');
const { PLAYERS } = await import('../data/players');

const snapshot = () => {
  const s = useGameStore.getState();
  return JSON.stringify([s.myTeam, s.captain, s.viceCaptain, s.phase, s.budget, s.transfers, s.cashedIn]);
};

describe('read-only tournament: every squad mutation is inert', () => {
  beforeEach(() => {
    useGameStore.setState({
      myTeam: [], captain: '', viceCaptain: '', phase: 'draft',
      budget: 150, transfers: [], cashedIn: [], initialSquad: [],
    });
  });

  // The draft actions are the ones actually reachable on a finished event: a fresh device (or one
  // whose state was reset) sits in phase 'draft', and the draft guards test the PHASE, not whether
  // the tournament is over. Before this gate they were wide open.
  it('addPlayer does nothing', () => {
    const before = snapshot();
    useGameStore.getState().addPlayer(PLAYERS[0].id);
    expect(snapshot()).toBe(before);
    expect(useGameStore.getState().myTeam).toEqual([]);
  });

  it('removePlayer does nothing', () => {
    useGameStore.setState({ myTeam: [PLAYERS[0].id] });
    const before = snapshot();
    useGameStore.getState().removePlayer(PLAYERS[0].id);
    expect(snapshot()).toBe(before);
  });

  it('setCaptain and setViceCaptain do nothing', () => {
    useGameStore.setState({ myTeam: [PLAYERS[0].id, PLAYERS[1].id] });
    const before = snapshot();
    useGameStore.getState().setCaptain(PLAYERS[0].id);
    useGameStore.getState().setViceCaptain(PLAYERS[1].id);
    expect(snapshot()).toBe(before);
  });

  it('finalizeDraft does not lock a squad', () => {
    useGameStore.setState({ myTeam: PLAYERS.slice(0, 10).map(p => p.id) });
    const before = snapshot();
    useGameStore.getState().finalizeDraft();
    expect(snapshot()).toBe(before);
    expect(useGameStore.getState().phase).toBe('draft');
  });

  it('the transfer actions do nothing', () => {
    useGameStore.setState({ myTeam: PLAYERS.slice(0, 10).map(p => p.id), phase: 'pre_round' });
    const before = snapshot();
    const g = useGameStore.getState();
    g.replacePlayer(PLAYERS[0].id, PLAYERS[20].id);
    g.cashInPlayer(PLAYERS[1].id);
    g.buyPlayer(PLAYERS[21].id);
    g.undoBuy(PLAYERS[21].id);
    expect(snapshot()).toBe(before);
  });

  // resetGame is deliberately NOT gated: it is the sign-out and error-recovery cleanup path, and
  // blocking it would leave one account's squad on screen after another signs in. Its danger was
  // that it drops phase back to 'draft' and so re-opens the draft actions — which the tests above
  // prove is now harmless. This test pins that reasoning: reset still works, and the squad actions
  // stay shut afterwards.
  it('resetGame still works, and the draft stays shut afterwards', () => {
    useGameStore.setState({ myTeam: PLAYERS.slice(0, 3).map(p => p.id), phase: 'pre_round' });
    useGameStore.getState().resetGame();
    expect(useGameStore.getState().myTeam).toEqual([]);

    useGameStore.getState().addPlayer(PLAYERS[0].id);
    expect(useGameStore.getState().myTeam).toEqual([]);
  });
});
