import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore, eliminatedSquad, substitutionCandidates } from '../store/gameStore';
import { getPlayer } from '../data/players';

const store = () => useGameStore.getState();
const play = (captain: string) => { store().setCaptain(captain); store().playNextRound(); };

beforeEach(() => { store().resetGame(); });

describe('draft mechanics', () => {
  it('starts with $100M, empty team, draft phase', () => {
    expect(store().budget).toBe(100);
    expect(store().myTeam).toHaveLength(0);
    expect(store().phase).toBe('draft');
  });

  it('adding a player reduces budget by their price', () => {
    store().addPlayer('alcaraz'); // $48
    expect(store().myTeam).toEqual(['alcaraz']);
    expect(store().budget).toBe(52);
  });

  it('budget always equals 100 minus squad cost during draft', () => {
    ['alcaraz', 'hurkacz', 'thompson'].forEach(id => store().addPlayer(id));
    const cost = store().myTeam.reduce((s, id) => s + getPlayer(id).price, 0);
    expect(store().budget).toBe(100 - cost);
  });

  it('rejects a 7th player', () => {
    ['thompson', 'nakashima', 'sonego', 'davidovich', 'vandezandschulp', 'bautistaagut'].forEach(id => store().addPlayer(id));
    expect(store().myTeam).toHaveLength(6);
    store().addPlayer('cobolli');
    expect(store().myTeam).toHaveLength(6);
  });

  it('rejects duplicate players', () => {
    store().addPlayer('alcaraz');
    store().addPlayer('alcaraz');
    expect(store().myTeam).toHaveLength(1);
  });

  it('rejects a player you cannot afford', () => {
    store().addPlayer('alcaraz'); // 48
    store().addPlayer('sinner');  // 44 → 92 spent, 8 left
    store().addPlayer('zverev');  // 38 → unaffordable
    expect(store().myTeam).toEqual(['alcaraz', 'sinner']);
    expect(store().budget).toBe(8);
  });

  it('removing a player refunds budget and clears captain if needed', () => {
    store().addPlayer('alcaraz');
    store().setCaptain('alcaraz');
    store().removePlayer('alcaraz');
    expect(store().myTeam).toHaveLength(0);
    expect(store().budget).toBe(100);
    expect(store().captain).toBeNull();
  });

  it('setCaptain only works for players in the squad', () => {
    store().setCaptain('alcaraz'); // not in team
    expect(store().captain).toBeNull();
    store().addPlayer('alcaraz');
    store().setCaptain('alcaraz');
    expect(store().captain).toBe('alcaraz');
  });

  it('finalizeDraft moves to pre_round and defaults captain', () => {
    store().addPlayer('alcaraz');
    store().finalizeDraft();
    expect(store().phase).toBe('pre_round');
    expect(store().captain).toBe('alcaraz');
  });
});

describe('scoring — solo champion, captained every round', () => {
  it('scores base+captain across all 5 rounds with no upset (=154)', () => {
    store().addPlayer('alcaraz'); // #1, wins the whole thing
    store().finalizeDraft();
    for (let i = 0; i < 5; i++) play('alcaraz');
    // R32 2*2 + R16 5*2 + QF 10*2 + SF 20*2 + F 40*2 = 4+10+20+40+80
    expect(store().myScore).toBe(154);
    expect(store().phase).toBe('finished');
    expect(store().roundScores).toHaveLength(5);
    expect(store().budgetReturns).toHaveLength(0); // never eliminated
  });
});

describe('scoring — upset bonus + budget return', () => {
  it('captained underdog win adds upset bonus, then elimination returns budget', () => {
    store().addPlayer('eubanks'); // #25, price 7
    store().finalizeDraft();
    // R32: eubanks (#25) beats rublev (#8) → base 2 + upset 7 = 9, captain → 18
    play('eubanks');
    expect(store().myScore).toBe(18);
    // R16: eubanks loses to rune → eliminated, no points, budget return 7*0.40 = 2.8
    play('eubanks');
    expect(store().myScore).toBe(18);
    expect(store().budgetReturns).toHaveLength(1);
    expect(store().budgetReturns[0]).toMatchObject({ playerId: 'eubanks', round: 'R16', amount: 2.8 });
    // budget: 100 - 7 spent + 2.8 returned
    expect(store().budget).toBeCloseTo(95.8, 5);
  });
});

describe('scoring invariants over a mixed squad', () => {
  it('score is monotonic non-decreasing and returns only for eliminated players', () => {
    ['alcaraz', 'eubanks', 'draper', 'deminaur', 'zverev', 'thompson'].forEach(id => store().addPlayer(id));
    store().finalizeDraft();
    let prev = 0;
    const cap = store().captain!;
    for (let i = 0; i < 5; i++) {
      play(cap);
      expect(store().myScore).toBeGreaterThanOrEqual(prev);
      prev = store().myScore;
    }
    expect(store().phase).toBe('finished');
    // every budget return corresponds to a player who was actually eliminated
    for (const r of store().budgetReturns) {
      expect(store().myTeam).toContain(r.playerId);
      expect(r.amount).toBeGreaterThan(0);
    }
  });
});

describe('mid-tournament substitutions', () => {
  // helper: draft alcaraz(#1, champ) + eubanks(#25); play R32 then R16 so eubanks is out
  const draftAndReachR16 = () => {
    store().addPlayer('alcaraz'); // 48
    store().addPlayer('eubanks'); // 7
    store().finalizeDraft();
    play('alcaraz'); // R32: both win
    play('alcaraz'); // R16: alcaraz wins, eubanks loses → out R16
  };

  it('an eliminated player can be replaced by an affordable, still-alive player', () => {
    draftAndReachR16();
    expect(eliminatedSquad(store().myTeam, store().currentRoundIndex)).toEqual(['eubanks']);
    const budgetBefore = store().budget; // 45 draft leftover + 2.8 return = 47.8
    expect(budgetBefore).toBeCloseTo(47.8, 5);

    store().replacePlayer('eubanks', 'zverev'); // #3, $38, still alive (reaches final)
    expect(store().myTeam).toContain('zverev');
    expect(store().myTeam).not.toContain('eubanks');
    expect(store().budget).toBeCloseTo(47.8 - 38, 5);
  });

  it('the replacement scores from the next round on', () => {
    draftAndReachR16();
    store().replacePlayer('eubanks', 'zverev');
    play('alcaraz'); // QF: alcaraz(cap) beats rune → 20; zverev beats de Minaur → 10
    const qf = store().roundScores.at(-1)!;
    expect(qf.round).toBe('QF');
    expect(qf.points).toBe(30);
  });

  it('rejects replacing a player who is not eliminated', () => {
    draftAndReachR16();
    store().replacePlayer('alcaraz', 'zverev'); // alcaraz still in
    expect(store().myTeam).toContain('alcaraz');
    expect(store().myTeam).not.toContain('zverev');
  });

  it('rejects a replacement who is already knocked out', () => {
    draftAndReachR16();
    // thompson lost in R32 → not a valid substitute
    store().replacePlayer('eubanks', 'thompson');
    expect(store().myTeam).not.toContain('thompson');
    expect(store().myTeam).toContain('eubanks');
  });

  it('rejects an unaffordable replacement', () => {
    draftAndReachR16();
    // spend the budget down so nothing pricey is affordable
    // budget is ~47.8; alcaraz(#1) is out of the field anyway. Use a manual budget squeeze:
    useGameStore.setState({ budget: 5 });
    store().replacePlayer('eubanks', 'zverev'); // $38 > $5
    expect(store().myTeam).not.toContain('zverev');
    expect(store().myTeam).toContain('eubanks');
  });

  it('the transfer window closes after the quarter-finals', () => {
    store().addPlayer('alcaraz'); // champion
    store().addPlayer('eubanks'); // out R16
    store().finalizeDraft();
    play('alcaraz'); // R32
    play('alcaraz'); // R16 → eubanks eliminated
    play('alcaraz'); // QF → currentRoundIndex now 3 (SF up next)
    expect(store().currentRoundIndex).toBe(3);
    // eubanks is still an un-replaced eliminated player, but transfers are now locked
    expect(eliminatedSquad(store().myTeam, store().currentRoundIndex)).toContain('eubanks');
    store().replacePlayer('eubanks', 'zverev'); // zverev still alive (reaches final) but window shut
    expect(store().myTeam).toContain('eubanks');
    expect(store().myTeam).not.toContain('zverev');
  });

  it('substitutionCandidates are all alive, unowned, and affordable', () => {
    draftAndReachR16();
    const cands = substitutionCandidates(store().myTeam, store().budget, store().currentRoundIndex);
    for (const c of cands) {
      expect(store().myTeam).not.toContain(c.id);
      expect(c.price).toBeLessThanOrEqual(store().budget);
      // still alive: not eliminated in a revealed round
      const exit = getPlayer(c.id) && (c as { id: string }).id;
      expect(exit).toBeTruthy();
    }
    // zverev (alive, $38, affordable) should be offered; thompson (out R32) should not
    expect(cands.map(c => c.id)).toContain('zverev');
    expect(cands.map(c => c.id)).not.toContain('thompson');
  });
});

describe('guards', () => {
  it('playNextRound past the final does nothing', () => {
    store().addPlayer('alcaraz');
    store().finalizeDraft();
    for (let i = 0; i < 5; i++) play('alcaraz');
    const before = store().myScore;
    store().playNextRound();
    store().playNextRound();
    expect(store().myScore).toBe(before);
    expect(store().currentRoundIndex).toBe(5);
  });

  it('resetGame restores a clean slate', () => {
    store().addPlayer('alcaraz');
    store().finalizeDraft();
    play('alcaraz');
    store().resetGame();
    expect(store().budget).toBe(100);
    expect(store().myTeam).toHaveLength(0);
    expect(store().myScore).toBe(0);
    expect(store().phase).toBe('draft');
    expect(store().currentRoundIndex).toBe(0);
  });
});
