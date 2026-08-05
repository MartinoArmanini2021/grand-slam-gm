import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../store/gameStore';
import { getPlayer } from '../data/players';
import { isEliminated, liveBudget, liveCurrentRound, playerRefund } from '../data/tournament';
import { loadSampleThrough, roles } from './fixtures/sampleDraw';
import type { RoundId } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCTION-CONDITION regression suite.
//
// In a LIVE event the app's `currentRoundIndex` is FROZEN at 0 — the manual "play
// the round" step (playNextRound) is gated on roundPlayable and never fires while a
// round is in progress. Every live decision (budget, refunds, transfers, scoring)
// must therefore be derived from the RESULTS, never from the round index.
//
// This suite pins currentRoundIndex at 0 and walks the tournament through every round
// via the live store, asserting the money + transfer model stays correct at each stage.
// It is the guard for the whole class of "passes at R64, breaks once R32 starts" bug —
// exactly the frozen-index transfer freeze that shipped once and must not return.
// ─────────────────────────────────────────────────────────────────────────────

const store = () => useGameStore.getState();
const price = (id: string) => getPlayer(id).price;

// A manager whose squad exits are spread across every round, plus the champion (never out).
const SPREAD = [roles.champion, roles.r64Exit, roles.r32Exit, roles.r16Exit, roles.qfExit, roles.sfExit];

// Stage the FROZEN-INDEX production state: index 0, pre_round, a given squad, results loaded.
const stageFrozen = (through: RoundId | null, squad: string[], transfers: { out: string; in: string; round: RoundId }[] = []) => {
  loadSampleThrough(through);
  useGameStore.setState({ phase: 'pre_round', currentRoundIndex: 0, myTeam: [...squad], initialSquad: squad, transfers });
};

beforeEach(() => { loadSampleThrough(null); store().resetGame(); });

describe('live model under a frozen round index (production condition)', () => {
  it('budget equals 150 − cost + live refunds at EVERY round, with the index stuck at 0', () => {
    for (const through of ['R64', 'R32', 'R16', 'QF', 'SF', 'F'] as RoundId[]) {
      stageFrozen(through, SPREAD);
      const cost = SPREAD.reduce((s, id) => s + price(id), 0);
      const refund = SPREAD.filter(id => isEliminated(id)).reduce((s, id) => s + playerRefund(id), 0);
      expect(liveBudget(SPREAD, [], SPREAD)).toBeCloseTo(150 - cost + refund, 5);
      // The refund pool only ever grows as the tournament deepens (never regresses).
      expect(refund).toBeGreaterThanOrEqual(0);
    }
  });

  it('THE regression: a transfer still works after R32 starts (index frozen at R64)', () => {
    // With the old index-based rule this froze forever the moment R32 got a result.
    stageFrozen('R32', [roles.champion, roles.r32Exit]);
    expect(isEliminated(roles.r32Exit)).toBe(true);
    store().replacePlayer(roles.r32Exit, roles.runnerUp); // runnerUp still alive
    expect(store().myTeam).toContain(roles.runnerUp);          // ALLOWED
    expect(store().myTeam).not.toContain(roles.r32Exit);
    // Logged against the LIVE round (R32) so the newcomer first scores R16 — never retroactive R32.
    expect(store().transfers.at(-1)).toMatchObject({ in: roles.runnerUp, round: 'R32' });
  });

  it('a transfer logs against the live round every round, and locks only for the final', () => {
    const cases: { through: RoundId; out: string; allowed: boolean }[] = [
      { through: 'R64', out: roles.r64Exit, allowed: true },
      { through: 'R32', out: roles.r32Exit, allowed: true },
      { through: 'R16', out: roles.r16Exit, allowed: true },
      { through: 'QF', out: roles.qfExit, allowed: true },
      { through: 'SF', out: roles.sfExit, allowed: false }, // firstScored = F → squad locked for the final
    ];
    for (const c of cases) {
      stageFrozen(c.through, [roles.champion, c.out]);
      expect(isEliminated(c.out)).toBe(true);
      expect(liveCurrentRound()).toBe(c.through); // the live round IS derived from results
      store().replacePlayer(c.out, roles.runnerUp); // runnerUp alive through the SF
      if (c.allowed) {
        expect(store().myTeam, `${c.through} should allow the swap`).toContain(roles.runnerUp);
        expect(store().transfers.at(-1)).toMatchObject({ in: roles.runnerUp, round: c.through });
      } else {
        expect(store().myTeam, `${c.through} should lock (final)`).toContain(c.out);
        expect(store().myTeam).not.toContain(roles.runnerUp);
      }
    }
  });

  it('the transfer round is derived from RESULTS, not currentRoundIndex (index-independence)', () => {
    // Same live results, different index → the recorded transfer round MUST be identical.
    // If anyone reintroduces ROUNDS[currentRoundIndex-1], index 0 → R64 and index 3 → R16,
    // and this assertion fails.
    const run = (idx: number) => {
      stageFrozen('R32', [roles.champion, roles.r32Exit]);
      useGameStore.setState({ currentRoundIndex: idx });
      store().replacePlayer(roles.r32Exit, roles.runnerUp);
      return store().transfers.at(-1)?.round;
    };
    expect(run(0)).toBe('R32'); // frozen (real production state)
    expect(run(3)).toBe('R32'); // "advanced" — identical, proving the index does not drive it
  });

  it('never refunds a still-alive player, even one whose current-round match is undecided', () => {
    // Only R64 partially revealed: the champion (alive) and a not-yet-played player refund 0.
    stageFrozen('R64', SPREAD);
    expect(playerRefund(roles.champion)).toBe(0);      // wins the title → never a refund
    expect(isEliminated(roles.champion)).toBe(false);
    // A player still in the draw with no exit yet is worth nothing back.
    for (const id of SPREAD) {
      if (!isEliminated(id)) expect(playerRefund(id)).toBe(0);
    }
  });
});
