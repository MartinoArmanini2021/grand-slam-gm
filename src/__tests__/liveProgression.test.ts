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
  it('budget is MANUAL at every round: no auto-refund; cashing in credits exactly the refund', () => {
    for (const through of ['R64', 'R32', 'R16', 'QF', 'SF', 'F'] as RoundId[]) {
      stageFrozen(through, SPREAD);
      const cost = SPREAD.reduce((s, id) => s + price(id), 0);
      // Nothing cashed in yet → 150 − cost, even with players eliminated (floored at 0 so an
      // over-priced role-spread never reads negative — same clamp real over-budget squads get).
      expect(liveBudget(SPREAD, [], SPREAD, [])).toBeCloseTo(Math.max(0, 150 - cost), 5);
      // Cashing in the eliminated players credits EXACTLY their elimination refunds.
      const dead = SPREAD.filter(id => isEliminated(id));
      const refund = dead.reduce((s, id) => s + playerRefund(id), 0);
      expect(refund).toBeGreaterThanOrEqual(0);
      expect(liveBudget(SPREAD, [], SPREAD, dead)).toBeCloseTo(Math.max(0, 150 - cost + refund), 5);
    }
  });

  it('CASH IN claims the refund, removes the player, and credits the money', () => {
    stageFrozen('R16', [roles.champion, roles.r16Exit]); // r16Exit is out
    expect(isEliminated(roles.r16Exit)).toBe(true);
    const refund = playerRefund(roles.r16Exit);
    store().cashInPlayer(roles.r16Exit);
    expect(store().myTeam).not.toContain(roles.r16Exit); // removed from the active squad
    expect(store().myTeam).toContain(roles.champion);
    expect(store().cashedIn).toEqual([roles.r16Exit]);
    // Manual credit: budget = 150 − cost of everything drafted + the claimed refund.
    const cost = price(roles.champion) + price(roles.r16Exit);
    expect(store().budget).toBeCloseTo(150 - cost + refund, 5);
  });

  it('CASH IN is refused for a still-alive player and is idempotent', () => {
    stageFrozen('R16', [roles.champion, roles.r16Exit]);
    store().cashInPlayer(roles.champion);            // alive → refused
    expect(store().cashedIn).toEqual([]);
    store().cashInPlayer(roles.r16Exit);
    store().cashInPlayer(roles.r16Exit);             // already cashed → no-op
    expect(store().cashedIn).toEqual([roles.r16Exit]);
  });

  it('BUY needs an open slot, then adds an ANY-tier replacement and logs a transfer', () => {
    stageFrozen('R16', [roles.champion, roles.r16Exit]);
    store().buyPlayer(roles.underdog);               // no open slot yet → refused
    expect(store().myTeam).not.toContain(roles.underdog);
    store().cashInPlayer(roles.r16Exit);             // frees a slot + money
    store().buyPlayer(roles.underdog);               // Silver into a Gold's slot — any tier
    expect(store().myTeam).toContain(roles.underdog);
    expect(store().transfers.at(-1)).toMatchObject({ out: roles.r16Exit, in: roles.underdog });
  });

  it('you can CASH IN and leave the slot empty (play a man down)', () => {
    stageFrozen('R16', [roles.champion, roles.r16Exit]);
    store().cashInPlayer(roles.r16Exit);
    expect(store().myTeam).toEqual([roles.champion]); // squad < 10 is allowed
    expect(store().transfers).toEqual([]);            // no purchase made
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
