import { describe, it, expect } from 'vitest';
import { useGameStore, eliminatedSquad, substitutionCandidates } from '../store/gameStore';
import { PLAYERS } from '../data/players';
import { ROUNDS, isPlayerOut } from '../data/tournament';
import { getTier } from '../data/tiers';
import { isSquadValid } from '../data/squadRules';

// Deterministic PRNG so failures reproduce.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const store = () => useGameStore.getState();

// Build a random VALID squad (10 · 2 Platinum · 3 Gold · 5 Silver) within $200M by
// adding through the real store guards until valid.
function draftValidSquad(rand: () => number) {
  store().resetGame();
  const byPrice = (arr: typeof PLAYERS) => [...arr].sort((a, b) => a.price - b.price);
  const platinum = byPrice(PLAYERS.filter(p => getTier(p.ranking) === 'Platinum'));
  const gold = byPrice(PLAYERS.filter(p => getTier(p.ranking) === 'Gold'));
  const silver = byPrice(PLAYERS.filter(p => getTier(p.ranking) === 'Silver'));
  // Seeded pick of n distinct players from a pool — varies the squad per seed while
  // staying within guaranteed-affordable cheap tiers (so the draft never fails; the
  // fuzzed surface is the PLAY loop below, not squad assembly).
  const takeN = (arr: typeof PLAYERS, n: number) => {
    const a = [...arr]; const out: typeof PLAYERS = [];
    for (let k = 0; k < n && a.length; k++) out.push(a.splice(Math.floor(rand() * a.length), 1)[0]!);
    return out;
  };
  // Pick from the cheaper end of each tier so the whole squad always fits the $150
  // budget (the fuzzed surface is the PLAY loop below, not squad assembly).
  const picks = [...takeN(platinum.slice(0, 4), 2), ...takeN(gold.slice(0, 6), 3)]; // 2 Platinum + 3 Gold
  for (const p of silver) { if (picks.length >= 10) break; if (!picks.includes(p)) picks.push(p); } // 5 cheapest Silver
  for (const p of picks) store().addPlayer(p.id);
  return store().myTeam.length === 10 && isSquadValid(store().myTeam);
}

describe('FUZZ — many random full games never break an invariant', () => {
  it('budget stays ≥0, score is monotonic, phase ends finished, no throw', () => {
    const ITER = 150;
    for (let i = 0; i < ITER; i++) {
      const rand = rng(i * 2654435761 + 12345);
      const built = draftValidSquad(rand);
      expect(built, `iter ${i}: could not build a valid squad`).toBe(true);
      store().finalizeDraft();
      expect(store().phase).toBe('pre_round');

      let prevScore = 0;
      for (let r = 0; r < ROUNDS.length; r++) {
        if (store().phase === 'round_complete') useGameStore.setState({ phase: 'pre_round' });
        const revealed = ROUNDS.slice(0, store().currentRoundIndex).map(x => x.id);

        // Occasionally transfer out an eliminated player for a valid candidate.
        if (rand() < 0.5) {
          const outs = eliminatedSquad(store().myTeam, store().currentRoundIndex);
          const cands = substitutionCandidates(store().myTeam, store().budget, store().currentRoundIndex);
          if (outs.length && cands.length) {
            store().replacePlayer(outs[Math.floor(rand() * outs.length)], cands[Math.floor(rand() * cands.length)].id);
          }
        }
        // Pick a captain among alive players (or none if squad wiped).
        const alive2 = store().myTeam.filter(id => !isPlayerOut(id, revealed));
        if (alive2.length) store().setCaptain(alive2[Math.floor(rand() * alive2.length)]);

        store().playNextRound();

        // Invariants after every round:
        expect(store().budget, `iter ${i} round ${r}: negative budget`).toBeGreaterThanOrEqual(-1e-9);
        // Budget never drifts past 1 decimal (every money mutation, incl. transfers, rounds via round1).
        expect(Math.abs(store().budget * 10 - Math.round(store().budget * 10)), `iter ${i} round ${r}: budget float drift (${store().budget})`).toBeLessThan(1e-6);
        expect(store().myScore, `iter ${i} round ${r}: score regressed`).toBeGreaterThanOrEqual(prevScore);
        prevScore = store().myScore;
        // squad always exactly 10 and every member a real roster id
        expect(store().myTeam).toHaveLength(10);
        for (const id of store().myTeam) expect(PLAYERS.some(p => p.id === id)).toBe(true);
        // every recorded transfer references real players
        for (const t of store().transfers) { expect(PLAYERS.some(p => p.id === t.in)).toBe(true); expect(PLAYERS.some(p => p.id === t.out)).toBe(true); }
      }
      expect(store().phase, `iter ${i}: did not finish`).toBe('finished');
      expect(store().currentRoundIndex).toBe(ROUNDS.length);
      // budgetReturns are all for owned-or-formerly-owned real players, positive amounts
      for (const b of store().budgetReturns) { expect(PLAYERS.some(p => p.id === b.playerId)).toBe(true); expect(b.amount).toBeGreaterThan(0); }
    }
  });
});
