import { describe, it, expect, beforeEach } from 'vitest';
import { useLiveStore } from '../store/liveStore';
import { useGameStore } from '../store/gameStore';
import {
  isEliminated, isUnpickable, isPlayerOut, openingRoundExit, playerRefund, transfersUsed, liveScore, playerRoundPoints, ROUNDS,
} from '../data/tournament';
import { OPENING_ROUND, TOURNAMENT } from '../data/tournamentConfig';
import { MAX_TRANSFERS, STARTING_BUDGET } from '../data/squadRules';
import { PLAYERS, getPlayer } from '../data/players';
import { loadSampleThrough } from './fixtures/sampleDraw';
import type { RoundId } from '../types';

// ── The unscored OPENING round ────────────────────────────────────────────────────────────────
// A 96-draw Masters byes its 32 seeds into the second round, so 64 unseeded players contest a
// first round the game does NOT score — and it is played WHILE THE DRAFT IS STILL OPEN. The app
// therefore READS that round (so the market can't sell a player who already went home) but must
// never PAY for it. These tests pin both halves of that.

const first = TOURNAMENT.rounds[0];
const [a, b] = PLAYERS.slice(0, 2).map(p => p.id);

/** Put one decided OPENING-round match into the live store: `winner` beats `loser`. */
function playOpeningRound(winner: string, loser: string) {
  useLiveStore.setState({
    draw: [{ round: OPENING_ROUND as RoundId, slot: 0, half: 'top', p1Id: winner, p2Id: loser }],
    results: { [`${OPENING_ROUND}_0`]: winner },
    meta: {}, scores: {},
  });
}

beforeEach(() => { loadSampleThrough(null); useGameStore.getState().resetGame(); });

describe('the opening round exists and is NOT scored', () => {
  it('is the round immediately before the first scored one (undefined at a Slam)', () => {
    // Cincinnati/Montréal: rounds start at R64, so the opening round is R128.
    if (first === 'R128') expect(OPENING_ROUND).toBeUndefined(); // a Slam scores its first round
    else expect(OPENING_ROUND).toBe('R128');
  });

  it('is absent from the scored rounds, so nothing can pay it out', () => {
    expect(ROUNDS.map(r => r.id)).not.toContain(OPENING_ROUND);
  });
});

// THE regression this file most needs. The opening round is played WHILE THE DRAFT IS OPEN, so a
// manager building their first squad can be looking at players who already went home. The market
// used to ask `live ? isEliminated(id) : isPlayerOut(id, revealed)` — and `live` means "I have
// locked a squad", not "the tournament is live". Every drafting manager took the second branch,
// where `revealed` comes from the frozen currentRoundIndex and is therefore ALWAYS [] in
// production, so isPlayerOut returned false for everyone. At Cincinnati that left 12 of the 96
// entrants (Draper and Monfils among them) freely draftable after they had lost.
describe('a player knocked out in the opening round CANNOT be drafted', () => {
  it('isUnpickable flags them even during the draft, when nothing is "revealed"', () => {
    if (!OPENING_ROUND) return;
    playOpeningRound(a, b);
    expect(isUnpickable(b, [])).toBe(true);   // the loser — the case that was broken
    expect(isUnpickable(a, [])).toBe(false);  // the winner is through, still pickable
  });

  it('the OLD revealed-rounds check would have missed it (guards the regression)', () => {
    if (!OPENING_ROUND) return;
    playOpeningRound(a, b);
    // Exactly what the market used to call during the draft. It cannot see the opening round,
    // which is precisely why isUnpickable exists.
    expect(isPlayerOut(b, [])).toBe(false);
  });

  it('the store REFUSES to add them to a squad', () => {
    if (!OPENING_ROUND) return;
    playOpeningRound(a, b);
    const store = useGameStore.getState();
    store.addPlayer(b);
    expect(useGameStore.getState().myTeam).not.toContain(b);
    // …and the budget is untouched, so a refused add can't silently charge the manager.
    expect(useGameStore.getState().budget).toBe(STARTING_BUDGET);
  });

  it('still lets you draft someone who has not played the opening round yet', () => {
    if (!OPENING_ROUND) return;
    playOpeningRound(a, b);
    const seed = PLAYERS.find(p => p.id !== a && p.id !== b)!;
    useGameStore.getState().addPlayer(seed.id);
    expect(useGameStore.getState().myTeam).toContain(seed.id);
  });
});

// The user's explicit requirement: winning the opening round must earn NOTHING.
describe('WINNING the opening round earns zero points', () => {
  it('the winner scores 0 — not the base, not a fraction of it', () => {
    if (!OPENING_ROUND) return;
    playOpeningRound(a, b);
    expect(playerRoundPoints(a, OPENING_ROUND as RoundId, [], [])).toBe(0);
  });

  it('a squad holding the winner still totals 0 across the whole tournament', () => {
    if (!OPENING_ROUND) return;
    playOpeningRound(a, b);
    // Captained, which would double any points that did leak through.
    expect(liveScore([a], [], [{ round: OPENING_ROUND, playerId: a }], [])).toBe(0);
  });

  it('even an enormous upset pays nothing (no multiplier applies to an unscored round)', () => {
    if (!OPENING_ROUND) return;
    const strongest = [...PLAYERS].sort((x, y) => x.ranking - y.ranking)[0].id;
    const weakest = [...PLAYERS].sort((x, y) => y.ranking - x.ranking)[0].id;
    playOpeningRound(weakest, strongest); // the biggest possible upset in this field
    expect(liveScore([weakest], [], [], [])).toBe(0);
  });
});

describe('LOSING the opening round takes you out of the market', () => {
  it('the loser is eliminated, so the market cannot sell them', () => {
    if (!OPENING_ROUND) return;
    playOpeningRound(a, b);
    expect(openingRoundExit(b)).toBe(true);
    expect(isEliminated(b)).toBe(true);
  });

  it('the winner is NOT eliminated — they are through to the scored rounds', () => {
    if (!OPENING_ROUND) return;
    playOpeningRound(a, b);
    expect(openingRoundExit(a)).toBe(false);
    expect(isEliminated(a)).toBe(false);
  });

  it('refunds in FULL — they never reached a round that pays', () => {
    if (!OPENING_ROUND) return;
    playOpeningRound(a, b);
    expect(playerRefund(b)).toBe(getPlayer(b).price);
  });
});

describe('repairing an opening-round casualty is free of the transfer cap', () => {
  it('a transfer logged against the opening round does not spend the allowance', () => {
    if (!OPENING_ROUND) return;
    const free = Array.from({ length: MAX_TRANSFERS + 2 }, (_, i) =>
      ({ out: `x${i}`, in: `y${i}`, round: OPENING_ROUND as string }));
    expect(transfersUsed(free)).toBe(0);
  });

  it('but a transfer in a scored round does', () => {
    const paid = [{ out: 'x', in: 'y', round: first as string }];
    expect(transfersUsed(paid)).toBe(1);
  });

  it('counts only the scored-round ones when they are mixed', () => {
    if (!OPENING_ROUND) return;
    const mixed: { out: string; in: string; round: string }[] = [
      { out: 'a', in: 'b', round: OPENING_ROUND },
      { out: 'c', in: 'd', round: first },
      { out: 'e', in: 'f', round: OPENING_ROUND },
    ];
    expect(transfersUsed(mixed)).toBe(1);
  });

  it('the SQL mirrors "free = a round with no matches rows" (keep save_entry_rpc.sql in sync)', async () => {
    const sql = (await import('../../supabase/save_entry_rpc.sql?raw')).default;
    expect(sql).toMatch(/where m\.tournament_id = p_tournament and m\.round = t->>'round'/);
  });
});
