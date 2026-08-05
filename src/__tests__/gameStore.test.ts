import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore, eliminatedSquad, substitutionCandidates } from '../store/gameStore';
import { getPlayer, PLAYERS } from '../data/players';
import { getTier } from '../data/tiers';
import { ROUNDS, winPoints, playerRoundPoints } from '../data/tournament';
import { sampleMatches, loadSampleThrough, revealThrough, loadSampleTournament, roles } from './fixtures/sampleDraw';

const store = () => useGameStore.getState();
const price = (id: string) => getPlayer(id).price;
// Mirror the real UI flow AND the strict captain lock (P1): the captain is set while the
// round is still open, THEN its result lands, then it's played. (These unit tests set the
// captain via the pre_round shortcut rather than the continue-button so they can assert a
// specific captain/vice without the auto-defaulted vice the real transition would add.)
const play = (captain: string) => {
  if (store().phase === 'round_complete') useGameStore.setState({ phase: 'pre_round' });
  const round = ROUNDS[store().currentRoundIndex]; // the round about to be played
  store().setCaptain(captain);                     // committed while the round is still open
  if (round) revealThrough(round.id);              // result lands after the captain is set
  store().playNextRound();
};
const NUM_ROUNDS = ROUNDS.length; // Montréal: R64 → Final (6)
// Points a player earns if captained in every round they win (captain doubles).
const captainScore = (id: string) => ROUNDS.reduce((s, r) => {
  const m = sampleMatches.find(x => x.round === r.id && (x.p1Id === id || x.p2Id === id));
  if (!m || m.winnerId !== id) return s;
  const opp = m.p1Id === id ? m.p2Id : m.p1Id;
  return s + winPoints(r.id, id, opp) * 2;
}, 0);
const playAll = (captain: string) => { for (let i = 0; i < NUM_ROUNDS; i++) play(captain); };

// A legal, budget-affordable 2 Platinum · 3 Gold · 5 Silver squad, built from the
// cheapest of each tier so the whole draft fits inside the $150M budget. Field-agnostic.
const cheapestOfTier = (t: string, n: number) =>
  PLAYERS.filter(p => getTier(p.ranking) === t).sort((a, b) => a.price - b.price).slice(0, n).map(p => p.id);
const validSquad = [...cheapestOfTier('Platinum', 2), ...cheapestOfTier('Gold', 3), ...cheapestOfTier('Silver', 5)];

beforeEach(() => { loadSampleThrough(null); store().resetGame(); });

// Roles come from the fixture (sampleDraw.ts) so tests never hard-code a player id:
//   champion  — wins the title (captainScore 132), never eliminated
//   runnerUp  — reaches the Final (alive deep, a Platinum)
//   underdog  — a $10M Silver scripted to reach the SF (big cheap return)
//   qfExit / r16Exit / r32Exit / r64Exit — eliminated in exactly that round

describe('draft mechanics', () => {
  it('starts with $150M, empty team, draft phase', () => {
    expect(store().budget).toBe(150);
    expect(store().myTeam).toHaveLength(0);
    expect(store().phase).toBe('draft');
  });

  it('adding the champion costs his price', () => {
    store().addPlayer(roles.champion);
    expect(store().myTeam).toEqual([roles.champion]);
    expect(store().budget).toBe(150 - price(roles.champion));
  });

  it('budget always equals 150 minus squad cost during draft', () => {
    [roles.champion, roles.underdog, roles.r64Exit].forEach(id => store().addPlayer(id));
    const cost = store().myTeam.reduce((s, id) => s + price(id), 0);
    expect(store().budget).toBe(150 - cost);
  });

  it('rejects an 11th player', () => {
    validSquad.forEach(id => store().addPlayer(id));
    expect(store().myTeam).toHaveLength(10);
    const eleventh = PLAYERS.find(p => !validSquad.includes(p.id))!.id;
    store().addPlayer(eleventh); // squad already full
    expect(store().myTeam).toHaveLength(10);
  });

  it('blocks a third player of a full tier (e.g. no 3rd Platinum)', () => {
    store().addPlayer(roles.champion); // Platinum 1/2
    store().addPlayer(roles.qfExit);   // Platinum 2/2 → full
    store().addPlayer(roles.sfExit);   // Platinum → blocked
    expect(store().myTeam).toEqual([roles.champion, roles.qfExit]);
  });

  it('rejects duplicate players', () => {
    store().addPlayer(roles.champion);
    store().addPlayer(roles.champion);
    expect(store().myTeam).toHaveLength(1);
  });

  it('rejects a player you cannot afford', () => {
    store().addPlayer(roles.champion);
    useGameStore.setState({ budget: 20 });   // tighten the purse
    store().addPlayer(roles.qfExit);          // $47 > 20 → unaffordable
    expect(store().myTeam).toEqual([roles.champion]);
    expect(store().budget).toBe(20);
  });

  it('removing a player refunds budget and clears captain if needed', () => {
    store().addPlayer(roles.champion);
    store().setCaptain(roles.champion);
    store().removePlayer(roles.champion);
    expect(store().myTeam).toHaveLength(0);
    expect(store().budget).toBe(150);
    expect(store().captain).toBeNull();
  });

  it('setCaptain only works for players in the squad', () => {
    store().setCaptain(roles.champion);
    expect(store().captain).toBeNull();
    store().addPlayer(roles.champion);
    store().setCaptain(roles.champion);
    expect(store().captain).toBe(roles.champion);
  });

  it('finalizeDraft moves to pre_round and defaults captain', () => {
    store().addPlayer(roles.champion);
    store().finalizeDraft();
    expect(store().phase).toBe('pre_round');
    expect(store().captain).toBe(roles.champion);
  });
});

describe('scoring — champion, captained every round', () => {
  it('the champion captained wins the title, captained every round, no returns', () => {
    store().addPlayer(roles.champion);
    store().finalizeDraft();
    playAll(roles.champion); // plays all 6 rounds R64 → F
    expect(store().myScore).toBe(captainScore(roles.champion));
    expect(store().phase).toBe('finished');
    expect(store().budgetReturns).toHaveLength(0); // champion, never eliminated
  });
});

describe('scoring — underdog captain earns multiplier + upset bonuses', () => {
  it('the underdog captained banks a big return for a cheap pick over his run to the semis', () => {
    store().addPlayer(roles.underdog); // low-ranked → high mult + capped upset bonuses along the way
    store().finalizeDraft();
    playAll(roles.underdog); // R64..QF wins, out in the SF
    expect(store().myScore).toBe(captainScore(roles.underdog));
    // A deep underdog run is a strong return on a cheap pick, but no longer out-scores
    // the champion's full title run (the rebalance made "going further" worth more).
    expect(store().myScore).toBeGreaterThan(60);
    expect(store().myScore).toBeLessThan(captainScore(roles.champion));
    expect(store().budgetReturns).toHaveLength(0); // out in the SF → no refund (window shut)
  });
});

describe('scoring — captain ×2 and vice-captain ×1.5', () => {
  it('captain doubles and vice earns 1.5× in the same round', () => {
    store().addPlayer(roles.champion);
    store().addPlayer(roles.runnerUp);
    store().finalizeDraft(); // defaults captain = best-ranked alive; both reach the final
    // Pin the roles so the assertion is deterministic regardless of rank order.
    store().setCaptain(roles.champion);
    store().setViceCaptain(roles.runnerUp);
    expect(store().captain).toBe(roles.champion);
    expect(store().viceCaptain).toBe(roles.runnerUp);
    revealThrough('R64');    // captain/vice committed while R64 was open; now the result lands
    store().playNextRound(); // R64 — both win
    const r = store().roundScores.at(-1)!;
    const oppOf = (id: string) => {
      const m = sampleMatches.find(x => x.round === 'R64' && (x.p1Id === id || x.p2Id === id))!;
      return m.p1Id === id ? m.p2Id : m.p1Id;
    };
    const ptsC = winPoints('R64', roles.champion, oppOf(roles.champion)); // captain ×2
    const ptsV = winPoints('R64', roles.runnerUp, oppOf(roles.runnerUp)); // vice ×1.5
    expect(r.points).toBe(ptsC * 2 + ptsV * 1.5); // vice ×1.5 UNrounded → half-points allowed
    expect(r.captainBonus).toBe(ptsC);
    expect(r.viceBonus).toBe(ptsV * 1.5 - ptsV);
  });
});

describe('budget returns', () => {
  it('a QF exit refunds 70% while the transfer window is still open', () => {
    store().addPlayer(roles.qfExit); // reaches the QF, then out
    store().finalizeDraft();
    for (let i = 0; i < 4; i++) play(roles.qfExit); // R64,R32,R16 won; QF lost → out
    const amount = Math.round(price(roles.qfExit) * 0.70 * 10) / 10;
    const ret = store().budgetReturns.find(r => r.playerId === roles.qfExit);
    expect(ret).toMatchObject({ playerId: roles.qfExit, round: 'QF', amount });
    expect(store().budget).toBeCloseTo(150 - price(roles.qfExit) + amount, 5);
  });

  it('a player who lost in the opening round is refunded when R64 is played', () => {
    store().addPlayer(roles.champion);
    store().addPlayer(roles.r64Exit); // lost in R64 (the opening scored round)
    store().finalizeDraft();
    play(roles.champion); // R64 → r64Exit loses, refunded at the R64 rate
    const amount = Math.round(price(roles.r64Exit) * 0.45 * 10) / 10;
    const ret = store().budgetReturns.find(r => r.playerId === roles.r64Exit);
    expect(ret).toMatchObject({ round: 'R64', amount });
    expect(store().budget).toBeCloseTo(150 - price(roles.champion) - price(roles.r64Exit) + amount, 5);
  });
});

describe('scoring invariants over a mixed squad', () => {
  it('score is monotonic and every refund is for an owned, eliminated player', () => {
    [roles.champion, roles.qfExit, roles.r32Exit, roles.r16Exit, roles.underdog, roles.r64Exit]
      .forEach(id => store().addPlayer(id));
    store().finalizeDraft();
    let prev = 0;
    for (let i = 0; i < NUM_ROUNDS; i++) {
      play(roles.champion); // champion never eliminated → always a valid captain
      expect(store().myScore).toBeGreaterThanOrEqual(prev);
      prev = store().myScore;
    }
    expect(store().phase).toBe('finished');
    for (const r of store().budgetReturns) {
      expect(store().myTeam).toContain(r.playerId);
      expect(r.amount).toBeGreaterThan(0);
    }
  });
});

describe('mid-tournament substitutions', () => {
  // Draft champion + r16Exit (Gold, out in R16); play through R16.
  const draftAndReachR16 = () => {
    store().addPlayer(roles.champion);
    store().addPlayer(roles.r16Exit);
    store().finalizeDraft();
    play(roles.champion); // R64
    play(roles.champion); // R32
    play(roles.champion); // R16: champion wins, r16Exit out
  };

  it('an eliminated player can be replaced by an affordable, still-alive player', () => {
    draftAndReachR16();
    expect(eliminatedSquad(store().myTeam, store().currentRoundIndex)).toEqual([roles.r16Exit]);
    // leftover 150 − champion − r16Exit, + r16Exit's R16 refund (price·0.60)
    const refund = Math.round(price(roles.r16Exit) * 0.60 * 10) / 10;
    const budgetBefore = store().budget;
    expect(budgetBefore).toBeCloseTo(150 - price(roles.champion) - price(roles.r16Exit) + refund, 5);

    store().replacePlayer(roles.r16Exit, roles.runnerUp); // alive, reaches the final
    expect(store().myTeam).toContain(roles.runnerUp);
    expect(store().myTeam).not.toContain(roles.r16Exit);
    expect(store().budget).toBeCloseTo(budgetBefore - price(roles.runnerUp), 5);
  });

  it('the replacement scores from the next round on', () => {
    draftAndReachR16();
    store().replacePlayer(roles.r16Exit, roles.runnerUp);
    play(roles.champion); // QF: champion(cap) + runnerUp both win
    const qf = store().roundScores.at(-1)!;
    expect(qf.round).toBe('QF');
    const oppOf = (id: string) => {
      const m = sampleMatches.find(x => x.round === 'QF' && (x.p1Id === id || x.p2Id === id))!;
      return m.p1Id === id ? m.p2Id : m.p1Id;
    };
    const expected = winPoints('QF', roles.champion, oppOf(roles.champion)) * 2
      + winPoints('QF', roles.runnerUp, oppOf(roles.runnerUp));
    expect(qf.points).toBe(expected);
  });

  it('rejects replacing a player who is not eliminated', () => {
    draftAndReachR16();
    store().replacePlayer(roles.champion, roles.runnerUp); // champion still in
    expect(store().myTeam).toContain(roles.champion);
    expect(store().myTeam).not.toContain(roles.runnerUp);
  });

  it('rejects a replacement who is already knocked out', () => {
    draftAndReachR16();
    store().replacePlayer(roles.r16Exit, roles.r64Exit); // r64Exit out in R64 → invalid substitute
    expect(store().myTeam).not.toContain(roles.r64Exit);
    expect(store().myTeam).toContain(roles.r16Exit);
  });

  it('rejects an unaffordable replacement', () => {
    draftAndReachR16();
    useGameStore.setState({ budget: 5 });
    store().replacePlayer(roles.r16Exit, roles.runnerUp); // price > $5
    expect(store().myTeam).not.toContain(roles.runnerUp);
    expect(store().myTeam).toContain(roles.r16Exit);
  });

  it('a QF-round refund is still spendable — transfers stay open through the QF', () => {
    store().addPlayer(roles.champion);
    store().addPlayer(roles.r16Exit); // out R16
    store().finalizeDraft();
    for (let i = 0; i < 4; i++) play(roles.champion); // R64,R32,R16,QF → index 4 (SF up next)
    expect(store().currentRoundIndex).toBe(4);
    store().replacePlayer(roles.r16Exit, roles.runnerUp); // alive; window OPEN for the SF
    expect(store().myTeam).toContain(roles.runnerUp);
    expect(store().myTeam).not.toContain(roles.r16Exit);
  });

  it('the transfer window closes after the semi-finals (final squad locked)', () => {
    store().addPlayer(roles.champion);
    store().addPlayer(roles.r16Exit); // out R16
    store().finalizeDraft();
    for (let i = 0; i < 5; i++) play(roles.champion); // R64..SF → index 5 (Final up next) — window shut
    expect(store().currentRoundIndex).toBe(5);
    expect(eliminatedSquad(store().myTeam, store().currentRoundIndex)).toContain(roles.r16Exit);
    store().replacePlayer(roles.r16Exit, roles.runnerUp); // still alive but window shut for the final
    expect(store().myTeam).toContain(roles.r16Exit);
    expect(store().myTeam).not.toContain(roles.runnerUp);
  });

  it('substitutionCandidates are all alive, unowned, and affordable', () => {
    draftAndReachR16();
    const cands = substitutionCandidates(store().myTeam, store().budget, store().currentRoundIndex);
    for (const c of cands) {
      expect(store().myTeam).not.toContain(c.id);
      expect(c.price).toBeLessThanOrEqual(store().budget);
    }
    expect(cands.map(c => c.id)).toContain(roles.runnerUp);     // alive, affordable
    expect(cands.map(c => c.id)).not.toContain(roles.r64Exit);  // out R64
  });
});

describe('guards', () => {
  it('playNextRound past the final does nothing', () => {
    store().addPlayer(roles.champion);
    store().finalizeDraft();
    playAll(roles.champion);
    const before = store().myScore;
    store().playNextRound();
    store().playNextRound();
    expect(store().myScore).toBe(before);
    expect(store().currentRoundIndex).toBe(NUM_ROUNDS);
  });

  it('resetGame restores a clean slate', () => {
    store().addPlayer(roles.champion);
    store().finalizeDraft();
    play(roles.champion);
    store().resetGame();
    expect(store().budget).toBe(150);
    expect(store().myTeam).toHaveLength(0);
    expect(store().myScore).toBe(0);
    expect(store().phase).toBe('draft');
    expect(store().currentRoundIndex).toBe(0);
  });
});

describe('P6: draft + transfer freeze once the tournament starts', () => {
  it('finalizeDraft is refused once a result is in — the draft is closed', () => {
    store().addPlayer(roles.champion);
    revealThrough('R64');                  // the tournament has produced a result
    store().finalizeDraft();
    expect(store().phase).toBe('draft');   // refused — never left the draft
    expect(store().initialSquad).toEqual([]);
  });

  it('a transfer into a round already under way is refused', () => {
    store().addPlayer(roles.champion);
    store().addPlayer(roles.r16Exit);
    store().finalizeDraft();
    play(roles.champion); // R64
    play(roles.champion); // R32
    play(roles.champion); // R16 → r16Exit out; now round_complete, index 3 (QF up next)
    useGameStore.setState({ phase: 'pre_round' });
    revealThrough('QF');                   // the QF already has results → too late to sub for it
    store().replacePlayer(roles.r16Exit, roles.runnerUp);
    expect(store().myTeam).toContain(roles.r16Exit);       // refused
    expect(store().myTeam).not.toContain(roles.runnerUp);
  });
});

describe('playerRoundPoints — per-player per-round breakdown (Team page)', () => {
  it('is 0 for a round the player did not win, the win value otherwise, and doubles for the captain', () => {
    loadSampleTournament(); // full results in the live store
    const base = playerRoundPoints(roles.champion, 'R64');           // champion won R64, no captaincy
    expect(base).toBeGreaterThan(0);
    expect(playerRoundPoints(roles.r64Exit, 'R64')).toBe(0);          // lost R64 → nothing
    // Captain doubles; vice is 1.5× UNrounded (half-points allowed) — matches the scoring engine.
    expect(playerRoundPoints(roles.champion, 'R64', [{ round: 'R64', playerId: roles.champion }])).toBe(base * 2);
    expect(playerRoundPoints(roles.champion, 'R64', [], [{ round: 'R64', playerId: roles.champion }])).toBe(base * 1.5);
  });
});

describe('economy integrity (regression)', () => {
  it('removePlayer only refunds an owned player — no budget inflation on repeat/absent calls', () => {
    store().addPlayer(roles.champion); // budget 150 − price
    const afterBuy = store().budget;
    store().removePlayer(roles.qfExit); // not owned → must be a no-op
    expect(store().budget).toBe(afterBuy);
    expect(store().myTeam).toEqual([roles.champion]);
    store().removePlayer(roles.champion); // owned → refund once → 150
    store().removePlayer(roles.champion); // now absent → must NOT refund again
    expect(store().budget).toBe(150);
    expect(store().myTeam).toEqual([]);
  });

  it('replacePlayer never creates a 3rd Platinum, but allows a same-tier swap', () => {
    store().addPlayer(roles.champion); // Platinum
    store().addPlayer(roles.qfExit);   // Platinum
    store().addPlayer(roles.r32Exit);  // Gold, exits R32
    store().finalizeDraft();
    play(roles.champion); // R64
    play(roles.champion); // R32 → r32Exit eliminated
    expect(eliminatedSquad(store().myTeam, store().currentRoundIndex)).toContain(roles.r32Exit);
    // sfExit (Platinum) is alive + affordable, but the swap would be a 3rd Platinum
    store().replacePlayer(roles.r32Exit, roles.sfExit);
    expect(store().myTeam).toContain(roles.r32Exit);       // rejected → unchanged
    expect(store().myTeam).not.toContain(roles.sfExit);
    // a same-tier Gold→Gold swap to an alive Gold is allowed
    store().replacePlayer(roles.r32Exit, roles.r16Exit); // Gold, alive past R32
    expect(store().myTeam).toContain(roles.r16Exit);
    expect(store().myTeam).not.toContain(roles.r32Exit);
  });
});
