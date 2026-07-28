import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore, eliminatedSquad, substitutionCandidates } from '../store/gameStore';
import { getPlayer } from '../data/players';
import { ROUNDS, MATCHES, winPoints } from '../data/tournament';

const store = () => useGameStore.getState();
// Mirror the real UI flow: a completed round returns to pre_round (via the
// "Set Captain" step) before the next round can be played.
const play = (captain: string) => {
  if (store().phase === 'round_complete') useGameStore.setState({ phase: 'pre_round' });
  store().setCaptain(captain);
  store().playNextRound();
};
const NUM_ROUNDS = ROUNDS.length; // R128 → Final (7)
// Points a player earns if captained in every round they win (captain doubles).
const captainScore = (id: string) => ROUNDS.reduce((s, r) => {
  const m = MATCHES.find(x => x.round === r.id && (x.p1Id === id || x.p2Id === id));
  if (!m || m.winnerId !== id) return s;
  const opp = m.p1Id === id ? m.p2Id : m.p1Id;
  return s + winPoints(r.id, id, opp) * 2;
}, 0);
const playAll = (captain: string) => { for (let i = 0; i < NUM_ROUNDS; i++) play(captain); };

beforeEach(() => { store().resetGame(); });

// Real Wimbledon 2026 prices (priceFor by ranking): sinner 50, zverev 33,
// augeraliassime 29, djokovic 23, fritz 22, cobolli 20, lehecka 17, fery 6.

describe('draft mechanics', () => {
  it('starts with $200M, empty team, draft phase', () => {
    expect(store().budget).toBe(200);
    expect(store().myTeam).toHaveLength(0);
    expect(store().phase).toBe('draft');
  });

  it('adding Sinner (#1) costs $50M', () => {
    store().addPlayer('sinner');
    expect(store().myTeam).toEqual(['sinner']);
    expect(store().budget).toBe(150);
  });

  it('budget always equals 200 minus squad cost during draft', () => {
    ['sinner', 'fery', 'cobolli'].forEach(id => store().addPlayer(id));
    const cost = store().myTeam.reduce((s, id) => s + getPlayer(id).price, 0);
    expect(store().budget).toBe(200 - cost);
  });

  it('rejects an 11th player', () => {
    // a legal 2 Platinum · 3 Gold · 5 Silver squad, then one more
    ['sinner', 'zverev', 'bublik', 'ruud', 'rublev', 'fery', 'giron', 'munar', 'bergs', 'zheng'].forEach(id => store().addPlayer(id));
    expect(store().myTeam).toHaveLength(10);
    store().addPlayer('svajda'); // squad already full
    expect(store().myTeam).toHaveLength(10);
  });

  it('blocks a third player of a full tier (e.g. no 3rd Platinum)', () => {
    store().addPlayer('sinner');          // Platinum 1/2
    store().addPlayer('zverev');          // Platinum 2/2 → full
    store().addPlayer('augeraliassime');  // Platinum (rank 4) → blocked
    expect(store().myTeam).toEqual(['sinner', 'zverev']);
  });

  it('rejects duplicate players', () => {
    store().addPlayer('sinner');
    store().addPlayer('sinner');
    expect(store().myTeam).toHaveLength(1);
  });

  it('rejects a player you cannot afford', () => {
    store().addPlayer('sinner');            // 50 → 150 left
    useGameStore.setState({ budget: 20 });  // tighten the purse
    store().addPlayer('zverev');            // 33 > 20 → unaffordable
    expect(store().myTeam).toEqual(['sinner']);
    expect(store().budget).toBe(20);
  });

  it('removing a player refunds budget and clears captain if needed', () => {
    store().addPlayer('sinner');
    store().setCaptain('sinner');
    store().removePlayer('sinner');
    expect(store().myTeam).toHaveLength(0);
    expect(store().budget).toBe(200);
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
  it('Sinner (#1) captained wins the title, captained every round, no returns', () => {
    store().addPlayer('sinner');
    store().finalizeDraft();
    playAll('sinner'); // plays all 7 rounds R128 → F
    // #1 → mult 0.6, no upsets; each round's points doubled by captaincy.
    expect(store().myScore).toBe(captainScore('sinner'));
    expect(store().phase).toBe('finished');
    expect(store().budgetReturns).toHaveLength(0); // champion, never eliminated
  });
});

describe('scoring — underdog captain earns multiplier + upset bonuses', () => {
  it('Fery (#178) captained banks a big return for a $6M pick over his run to the semis', () => {
    store().addPlayer('fery'); // ranked 178 → mult 1.3 + capped upset bonuses along the way
    store().finalizeDraft();
    playAll('fery'); // R128..QF wins, out in the SF
    expect(store().myScore).toBe(captainScore('fery'));
    // A deep underdog run is a strong return on a cheap pick, but no longer out-scores
    // the champion's full title run (the rebalance made "going further" worth more).
    expect(store().myScore).toBeGreaterThan(80);
    expect(store().myScore).toBeLessThan(captainScore('sinner'));
    expect(store().budgetReturns).toHaveLength(0); // out in the SF → no refund (window shut)
  });
});

describe('scoring — captain ×2 and vice-captain ×1.5', () => {
  it('captain doubles and vice earns 1.5× in the same round', () => {
    store().addPlayer('sinner');
    store().addPlayer('zverev');
    store().finalizeDraft(); // defaults captain=sinner, vice=zverev (first two alive)
    expect(store().captain).toBe('sinner');
    expect(store().viceCaptain).toBe('zverev');
    store().playNextRound(); // R128 — both win
    const r = store().roundScores.at(-1)!;
    const oppOf = (id: string) => {
      const m = MATCHES.find(x => x.round === 'R128' && (x.p1Id === id || x.p2Id === id))!;
      return m.p1Id === id ? m.p2Id : m.p1Id;
    };
    const ptsS = winPoints('R128', 'sinner', oppOf('sinner')); // captain ×2
    const ptsZ = winPoints('R128', 'zverev', oppOf('zverev')); // vice ×1.5
    expect(r.points).toBe(ptsS * 2 + Math.round(ptsZ * 1.5));
    expect(r.captainBonus).toBe(ptsS);
    expect(r.viceBonus).toBe(Math.round(ptsZ * 1.5) - ptsZ);
  });
});

describe('budget returns', () => {
  it('a QF exit refunds 70% while the transfer window is still open', () => {
    store().addPlayer('fritz'); // $22, reaches the QF
    store().finalizeDraft();
    for (let i = 0; i < 5; i++) play('fritz'); // R128,R64,R32,R16 won; QF lost → out
    expect(store().myScore).toBe(captainScore('fritz'));
    const ret = store().budgetReturns.find(r => r.playerId === 'fritz');
    expect(ret).toMatchObject({ playerId: 'fritz', round: 'QF', amount: 15.4 }); // 22 · 0.70
    expect(store().budget).toBeCloseTo(200 - 22 + 15.4, 5);
  });

  it('a player who lost in the first round is refunded when R128 is played', () => {
    store().addPlayer('sinner');
    store().addPlayer('ruud'); // $18, lost in R128
    store().finalizeDraft();
    play('sinner'); // R128 → ruud loses, refunded at the R128 rate 18·0.40 = 7.2
    const ret = store().budgetReturns.find(r => r.playerId === 'ruud');
    expect(ret).toMatchObject({ round: 'R128', amount: 7.2 });
    expect(store().budget).toBeCloseTo(200 - 50 - 18 + 7.2, 5);
  });
});

describe('scoring invariants over a mixed squad', () => {
  it('score is monotonic and every refund is for an owned, eliminated player', () => {
    ['sinner', 'zverev', 'ruud', 'lehecka', 'fery', 'giron'].forEach(id => store().addPlayer(id));
    store().finalizeDraft();
    let prev = 0;
    const cap = store().captain!;
    for (let i = 0; i < NUM_ROUNDS; i++) {
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
    play('sinner'); // R128
    play('sinner'); // R64
    play('sinner'); // R32
    play('sinner'); // R16: sinner wins, lehecka loses to Zverev → out R16
  };

  it('an eliminated player can be replaced by an affordable, still-alive player', () => {
    draftAndReachR16();
    expect(eliminatedSquad(store().myTeam, store().currentRoundIndex)).toEqual(['lehecka']);
    // draft leftover 200-50-17=133, + Lehecka R16 refund 17·0.60 = 10.2 → 143.2
    const budgetBefore = store().budget;
    expect(budgetBefore).toBeCloseTo(143.2, 5);

    store().replacePlayer('lehecka', 'zverev'); // $33, reaches the final
    expect(store().myTeam).toContain('zverev');
    expect(store().myTeam).not.toContain('lehecka');
    expect(store().budget).toBeCloseTo(143.2 - 33, 5);
  });

  it('the replacement scores from the next round on', () => {
    draftAndReachR16();
    store().replacePlayer('lehecka', 'zverev');
    play('sinner'); // QF: sinner(cap) round(10·.8)=8 ×2 =16; zverev round(10·.826)=8 → 24
    const qf = store().roundScores.at(-1)!;
    expect(qf.round).toBe('QF');
    expect(qf.points).toBe(24);
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
    for (let i = 0; i < 5; i++) play('sinner'); // R128,R64,R32,R16,QF → index 5 (SF up next)
    expect(store().currentRoundIndex).toBe(5);
    store().replacePlayer('lehecka', 'zverev'); // zverev alive; window OPEN for the SF
    expect(store().myTeam).toContain('zverev');
    expect(store().myTeam).not.toContain('lehecka');
  });

  it('the transfer window closes after the semi-finals (final squad locked)', () => {
    store().addPlayer('sinner');
    store().addPlayer('lehecka'); // out R16
    store().finalizeDraft();
    for (let i = 0; i < 6; i++) play('sinner'); // R128..SF → index 6 (Final up next) — window shut
    expect(store().currentRoundIndex).toBe(6);
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
    playAll('sinner');
    const before = store().myScore;
    store().playNextRound();
    store().playNextRound();
    expect(store().myScore).toBe(before);
    expect(store().currentRoundIndex).toBe(NUM_ROUNDS);
  });

  it('resetGame restores a clean slate', () => {
    store().addPlayer('sinner');
    store().finalizeDraft();
    play('sinner');
    store().resetGame();
    expect(store().budget).toBe(200);
    expect(store().myTeam).toHaveLength(0);
    expect(store().myScore).toBe(0);
    expect(store().phase).toBe('draft');
    expect(store().currentRoundIndex).toBe(0);
  });
});
