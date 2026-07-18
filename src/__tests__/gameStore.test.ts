import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore, eliminatedSquad, substitutionCandidates } from '../store/gameStore';
import { getPlayer } from '../data/players';

const store = () => useGameStore.getState();
const play = (captain: string) => { store().setCaptain(captain); store().playNextRound(); };

beforeEach(() => { store().resetGame(); });

// Real Wimbledon 2026 prices (priceFor by ranking): sinner 50, zverev 33,
// augeraliassime 29, djokovic 23, fritz 22, cobolli 20, lehecka 17, fery 6.

describe('draft mechanics', () => {
  it('starts with $100M, empty team, draft phase', () => {
    expect(store().budget).toBe(100);
    expect(store().myTeam).toHaveLength(0);
    expect(store().phase).toBe('draft');
  });

  it('adding Sinner (#1) costs $50M', () => {
    store().addPlayer('sinner');
    expect(store().myTeam).toEqual(['sinner']);
    expect(store().budget).toBe(50);
  });

  it('budget always equals 100 minus squad cost during draft', () => {
    ['sinner', 'fery', 'cobolli'].forEach(id => store().addPlayer(id));
    const cost = store().myTeam.reduce((s, id) => s + getPlayer(id).price, 0);
    expect(store().budget).toBe(100 - cost);
  });

  it('rejects a 7th player', () => {
    ['fery', 'giron', 'munar', 'bergs', 'zheng', 'svajda'].forEach(id => store().addPlayer(id));
    expect(store().myTeam).toHaveLength(6);
    store().addPlayer('cilic');
    expect(store().myTeam).toHaveLength(6);
  });

  it('rejects duplicate players', () => {
    store().addPlayer('sinner');
    store().addPlayer('sinner');
    expect(store().myTeam).toHaveLength(1);
  });

  it('rejects a player you cannot afford', () => {
    store().addPlayer('sinner');         // 50
    store().addPlayer('zverev');         // 33 → 83 spent, 17 left
    store().addPlayer('augeraliassime'); // 29 → unaffordable
    expect(store().myTeam).toEqual(['sinner', 'zverev']);
    expect(store().budget).toBe(17);
  });

  it('removing a player refunds budget and clears captain if needed', () => {
    store().addPlayer('sinner');
    store().setCaptain('sinner');
    store().removePlayer('sinner');
    expect(store().myTeam).toHaveLength(0);
    expect(store().budget).toBe(100);
    expect(store().captain).toBeNull();
  });

  it('setCaptain only works for players in the squad', () => {
    store().setCaptain('sinner');
    expect(store().captain).toBeNull();
    store().addPlayer('sinner');
    store().setCaptain('sinner');
    expect(store().captain).toBe('sinner');
  });

  it('finalizeDraft moves to pre_round and defaults captain', () => {
    store().addPlayer('sinner');
    store().finalizeDraft();
    expect(store().phase).toBe('pre_round');
    expect(store().captain).toBe('sinner');
  });
});

describe('scoring — champion, captained every round', () => {
  it('Sinner (#1) captained wins the title for 92 pts, no upsets, no returns', () => {
    store().addPlayer('sinner');
    store().finalizeDraft();
    for (let i = 0; i < 5; i++) play('sinner');
    // #1 → mult 0.6: round(base·.6) then ×2 → 2+6+12+24+48
    expect(store().myScore).toBe(92);
    expect(store().phase).toBe('finished');
    expect(store().budgetReturns).toHaveLength(0); // champion, never eliminated
  });
});

describe('scoring — underdog captain earns multiplier + upset bonuses', () => {
  it('Fery (#178) captained scores 142 over his run to the semis', () => {
    store().addPlayer('fery'); // ranked 178 → mult 1.5
    store().finalizeDraft();
    // R32 beat Bergs: round(2·1.5)=3 +15 upset =18 ×2 =36
    // R16 beat Dimitrov: round(5·1.5)=8 +15 =23 ×2 =46
    // QF beat Cobolli: round(10·1.5)=15 +15 =30 ×2 =60
    // SF lost to Zverev → 0 (SF exit returns nothing)
    for (let i = 0; i < 5; i++) play('fery');
    expect(store().myScore).toBe(36 + 46 + 60);
    expect(store().budgetReturns).toHaveLength(0); // out in the SF → no refund
  });
});

describe('budget returns', () => {
  it('a QF exit refunds 35% while the transfer window is still open', () => {
    store().addPlayer('fritz'); // $22, reaches the QF
    store().finalizeDraft();
    // R32 beat Sonego: round(2·.7615)=2 ×2 =4 · R16 beat Bublik: round(5·.7615)=4 ×2 =8
    play('fritz'); play('fritz');
    expect(store().myScore).toBe(12);
    play('fritz'); // QF: loses to Zverev → out, refund 22·0.35 = 7.7
    expect(store().budgetReturns).toHaveLength(1);
    expect(store().budgetReturns[0]).toMatchObject({ playerId: 'fritz', round: 'QF', amount: 7.7 });
    expect(store().budget).toBeCloseTo(100 - 22 + 7.7, 5);
  });

  it('a player who lost before the last 32 is still refunded at the R32 reveal', () => {
    store().addPlayer('sinner');
    store().addPlayer('ruud'); // $18, lost in R128 (never reached the scored draw)
    store().finalizeDraft();
    play('sinner'); // R32 → ruud revealed as out, refunded at the R32 rate 18·0.15 = 2.7
    const ret = store().budgetReturns.find(r => r.playerId === 'ruud');
    expect(ret).toMatchObject({ round: 'R32', amount: 2.7 });
    expect(store().budget).toBeCloseTo(100 - 50 - 18 + 2.7, 5);
  });
});

describe('scoring invariants over a mixed squad', () => {
  it('score is monotonic and every refund is for an owned, eliminated player', () => {
    ['sinner', 'zverev', 'fery', 'fritz', 'cobolli', 'lehecka'].forEach(id => store().addPlayer(id));
    store().finalizeDraft();
    let prev = 0;
    const cap = store().captain!;
    for (let i = 0; i < 5; i++) {
      play(cap);
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
  // Draft Sinner (champ) + Lehecka (#14, $17, out in R16); play R32 then R16.
  const draftAndReachR16 = () => {
    store().addPlayer('sinner'); // 50
    store().addPlayer('lehecka'); // 17
    store().finalizeDraft();
    play('sinner'); // R32: both win
    play('sinner'); // R16: sinner wins, lehecka loses to Zverev → out R16
  };

  it('an eliminated player can be replaced by an affordable, still-alive player', () => {
    draftAndReachR16();
    expect(eliminatedSquad(store().myTeam, store().currentRoundIndex)).toEqual(['lehecka']);
    // draft leftover 100-50-17=33, + Lehecka R16 refund 17·0.25 → round(42.5)=43 → 4.3
    const budgetBefore = store().budget;
    expect(budgetBefore).toBeCloseTo(37.3, 5);

    store().replacePlayer('lehecka', 'zverev'); // $33, reaches the final
    expect(store().myTeam).toContain('zverev');
    expect(store().myTeam).not.toContain('lehecka');
    expect(store().budget).toBeCloseTo(37.3 - 33, 5);
  });

  it('the replacement scores from the next round on', () => {
    draftAndReachR16();
    store().replacePlayer('lehecka', 'zverev');
    play('sinner'); // QF: sinner(cap) round(10·.6)=6 ×2 =12; zverev round(10·.646)=6 → 18
    const qf = store().roundScores.at(-1)!;
    expect(qf.round).toBe('QF');
    expect(qf.points).toBe(18);
  });

  it('rejects replacing a player who is not eliminated', () => {
    draftAndReachR16();
    store().replacePlayer('sinner', 'zverev'); // sinner still in
    expect(store().myTeam).toContain('sinner');
    expect(store().myTeam).not.toContain('zverev');
  });

  it('rejects a replacement who is already knocked out', () => {
    draftAndReachR16();
    // brooksby lost in R32 → not a valid substitute
    store().replacePlayer('lehecka', 'brooksby');
    expect(store().myTeam).not.toContain('brooksby');
    expect(store().myTeam).toContain('lehecka');
  });

  it('rejects an unaffordable replacement', () => {
    draftAndReachR16();
    useGameStore.setState({ budget: 5 });
    store().replacePlayer('lehecka', 'zverev'); // $33 > $5
    expect(store().myTeam).not.toContain('zverev');
    expect(store().myTeam).toContain('lehecka');
  });

  it('a QF-round refund is still spendable — transfers stay open through the QF', () => {
    store().addPlayer('sinner');
    store().addPlayer('lehecka'); // out R16
    store().finalizeDraft();
    play('sinner'); // R32
    play('sinner'); // R16 → lehecka eliminated
    play('sinner'); // QF → currentRoundIndex now 3 (SF up next) — window still open
    expect(store().currentRoundIndex).toBe(3);
    store().replacePlayer('lehecka', 'zverev'); // zverev alive; window OPEN for the SF
    expect(store().myTeam).toContain('zverev');
    expect(store().myTeam).not.toContain('lehecka');
  });

  it('the transfer window closes after the semi-finals (final squad locked)', () => {
    store().addPlayer('sinner');
    store().addPlayer('lehecka'); // out R16
    store().finalizeDraft();
    play('sinner'); // R32
    play('sinner'); // R16 → lehecka eliminated
    play('sinner'); // QF
    play('sinner'); // SF → currentRoundIndex now 4 (Final up next) — window shut
    expect(store().currentRoundIndex).toBe(4);
    expect(eliminatedSquad(store().myTeam, store().currentRoundIndex)).toContain('lehecka');
    store().replacePlayer('lehecka', 'zverev'); // still alive but window shut for the final
    expect(store().myTeam).toContain('lehecka');
    expect(store().myTeam).not.toContain('zverev');
  });

  it('substitutionCandidates are all alive, unowned, and affordable', () => {
    draftAndReachR16();
    const cands = substitutionCandidates(store().myTeam, store().budget, store().currentRoundIndex);
    for (const c of cands) {
      expect(store().myTeam).not.toContain(c.id);
      expect(c.price).toBeLessThanOrEqual(store().budget);
    }
    expect(cands.map(c => c.id)).toContain('zverev');    // alive, affordable
    expect(cands.map(c => c.id)).not.toContain('brooksby'); // out R32
  });
});

describe('guards', () => {
  it('playNextRound past the final does nothing', () => {
    store().addPlayer('sinner');
    store().finalizeDraft();
    for (let i = 0; i < 5; i++) play('sinner');
    const before = store().myScore;
    store().playNextRound();
    store().playNextRound();
    expect(store().myScore).toBe(before);
    expect(store().currentRoundIndex).toBe(5);
  });

  it('resetGame restores a clean slate', () => {
    store().addPlayer('sinner');
    store().finalizeDraft();
    play('sinner');
    store().resetGame();
    expect(store().budget).toBe(100);
    expect(store().myTeam).toHaveLength(0);
    expect(store().myScore).toBe(0);
    expect(store().phase).toBe('draft');
    expect(store().currentRoundIndex).toBe(0);
  });
});
