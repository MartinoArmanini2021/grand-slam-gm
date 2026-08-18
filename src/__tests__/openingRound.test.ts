import { describe, it, expect, beforeEach } from 'vitest';
import { useLiveStore } from '../store/liveStore';
import { useGameStore } from '../store/gameStore';
import {
  isEliminated, isUnpickable, isPlayerOut, openingRoundExit, playerRefund, transfersUsed, liveScore, playerRoundPoints, ROUNDS,
} from '../data/tournament';
import { OPENING_ROUND, TOURNAMENT } from '../data/tournamentConfig';
import { MAX_TRANSFERS, STARTING_BUDGET } from '../data/squadRules';
import { PLAYERS, getPlayer } from '../data/players';
import { loadSampleThrough, roles } from './fixtures/sampleDraw';
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

// Free-ness is keyed on WHO went out, not on the transfer's round stamp. The stamp has to stay
// truthful for scoring (it fixes when the signing starts earning), so a repair made during the
// R64→R32 break is stamped R64 — and charging off the stamp billed a manager for repairing an
// opening-round casualty purely because they did it after the first scored round instead of before.
describe('repairing an opening-round casualty is free of the transfer cap', () => {
  it('is free even when the transfer is stamped with a SCORED round', () => {
    if (!OPENING_ROUND) return;
    playOpeningRound(a, b);                       // b lost the unscored opening round
    // Stamped R64 (a repair made after the first scored round began) — still free.
    expect(transfersUsed([{ out: b, in: a, round: first as string }])).toBe(0);
  });

  it('but replacing a player who reached a SCORED round costs one', () => {
    loadSampleThrough('R64');                     // r64Exit went out in a round that pays
    expect(transfersUsed([{ out: roles.r64Exit, in: roles.champion, round: first as string }])).toBe(1);
  });

  it('counts only the ones that reached a scored round when they are mixed', () => {
    if (!OPENING_ROUND) return;
    playOpeningRound(a, b);
    expect(transfersUsed([
      { out: b, in: a, round: first as string },        // opening-round casualty → free
      { out: 'someone-who-played', in: a, round: first as string }, // unknown id → never free
    ])).toBe(1);
  });

  it('an unrecognised out-id is NEVER free (it would otherwise buy unlimited transfers)', () => {
    // openingRoundExit falls back to "absent from the draw", which is true of any unknown id.
    const spoof = Array.from({ length: MAX_TRANSFERS + 2 }, (_, i) =>
      ({ out: `ghost${i}`, in: `y${i}`, round: OPENING_ROUND as string }));
    expect(transfersUsed(spoof)).toBe(spoof.length);
  });

  it('the SQL mirrors "free = a known player with no matches rows" (keep save_entry_rpc.sql in sync)', async () => {
    const sql = (await import('../../supabase/save_entry_rpc.sql?raw')).default;
    expect(sql).toMatch(/m\.p1_id = t->>'out' or m\.p2_id = t->>'out'/);        // keyed on who went out
    expect(sql).toMatch(/not exists \(select 1 from public\.player_stats ps where ps\.id = t->>'out' and ps\.tournament_id = p_tournament\)/); // unknown → counts
  });
});
