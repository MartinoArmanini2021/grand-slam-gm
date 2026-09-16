import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../store/gameStore';
import { ROUNDS, getMatchesForRound, winPoints, liveScore, leaderOfRecord } from '../data/tournament';
import { PLAYERS } from '../data/players';
import { scoreEntry, type ScoreCtx, type EntryState } from '../scoring/serverEngine';
import { loadSampleTournament, loadSampleThrough, revealThrough, roles } from './fixtures/sampleDraw';
import { ROUND_ORDER, SCORING_CURVES, curveIdFor, TOURNAMENTS } from '../data/tournamentConfig';
import type { RoundId } from '../types';
import edgeSrc from '../../supabase/functions/recompute-score/index.ts?raw';
import seedSrc from '../../supabase/server_scoring.sql?raw';
import cincinnatiSeedSrc from '../../supabase/seed_cincinnati_player_stats.sql?raw';

const store = () => useGameStore.getState();

// Build the server-side context from the same live data the client scores against.
function buildCtx(): ScoreCtx {
  const matches = ROUNDS.flatMap(r =>
    getMatchesForRound(r.id).map(m => ({ round: r.id as string, p1: m.p1Id, p2: m.p2Id, winner: m.winnerId ?? null })));
  return {
    roundsInOrder: ROUNDS.map(r => r.id),
    roundPoints: Object.fromEntries(ROUNDS.map(r => [r.id, r.points])),
    rankById: Object.fromEntries(PLAYERS.map(p => [p.id, p.ranking])),
    matches,
  };
}

function stateFromStore(): EntryState {
  const s = store();
  return {
    initialSquad: s.initialSquad,
    transfers: s.transfers,
    captainHistory: s.captainHistory,
    viceCaptainHistory: s.viceCaptainHistory,
    playedRounds: ROUNDS.slice(0, s.currentRoundIndex).map(r => r.id),
  };
}

// Realistic live cadence (P1 strict lock): set the captain while the round is still OPEN,
// THEN its result arrives, then play it. This is the only way a captain-of-record counts,
// so it genuinely exercises the multipliers — a results-already-in fixture never could.
const play = (round: RoundId, cap: string, vice?: string) => {
  if (store().phase === 'round_complete') store().continueToNextRound();
  store().setCaptain(cap);
  if (vice) store().setViceCaptain(vice);
  revealThrough(round);           // outcomes land AFTER the captain is committed
  store().playNextRound();
};

// The Deno edge function hard-copies the round-points curves, their order, and WHICH events are
// pinned to which curve (it can't import app code). This reads that file as text and asserts the
// copy hasn't drifted from the canonical client config (tournamentConfig.ts) — so a future
// rebalance, or a newly-added tournament, can't silently desync the authoritative score from what
// the client displays/projects.
describe('edge function stays in sync with the canonical scoring curves', () => {
  it('recompute-score LEGACY_POINTS/FORMAT2_POINTS + ROUND_ORDER match SCORING_CURVES', () => {
    const parseBlock = (block: string) =>
      Object.fromEntries([...block.matchAll(/(\w+):\s*(\d+)/g)].map(m => [m[1], Number(m[2])]));

    const legacyBlock = edgeSrc.match(/LEGACY_POINTS[^{]*\{([^}]*)\}/);
    expect(legacyBlock, 'LEGACY_POINTS block found in edge fn').toBeTruthy();
    const edgeLegacy = parseBlock(legacyBlock![1]);
    for (const [round, points] of Object.entries(SCORING_CURVES.legacy)) {
      expect(edgeLegacy[round], `edge legacy points for ${round}`).toBe(points);
    }

    const format2Block = edgeSrc.match(/FORMAT2_POINTS[^{]*\{([^}]*)\}/);
    expect(format2Block, 'FORMAT2_POINTS block found in edge fn').toBeTruthy();
    const edgeFormat2 = parseBlock(format2Block![1]);
    for (const [round, points] of Object.entries(SCORING_CURVES.format2)) {
      expect(edgeFormat2[round], `edge format2 points for ${round}`).toBe(points);
    }

    const orderBlock = edgeSrc.match(/ROUND_ORDER\s*=\s*\[([^\]]*)\]/);
    const edgeOrder = [...orderBlock![1].matchAll(/'(\w+)'/g)].map(m => m[1]);
    expect(edgeOrder).toEqual(ROUND_ORDER);
  });

  it('recompute-score LEGACY_TOURNAMENTS matches which events the client pins to the legacy curve', () => {
    const setBlock = edgeSrc.match(/LEGACY_TOURNAMENTS\s*=\s*new Set\(\[([^\]]*)\]\)/);
    expect(setBlock, 'LEGACY_TOURNAMENTS set found in edge fn').toBeTruthy();
    const edgeLegacyIds = [...setBlock![1].matchAll(/'([a-z0-9_]+)'/g)].map(m => m[1]).sort();
    const clientLegacyIds = Object.keys(TOURNAMENTS).filter(id => curveIdFor(id) === 'legacy').sort();
    expect(edgeLegacyIds).toEqual(clientLegacyIds);
  });

  it('player_stats seed ranks match PLAYERS exactly (client ↔ server rank parity)', () => {
    // The client scores off PLAYERS.ranking; the edge fn scores off player_stats.ranking.
    // If they ever diverge, the authoritative leaderboard silently disagrees with the app.
    // Regenerate BOTH together when the field changes — this guards it.
    // player_stats is ONE table shared by every tournament and holds the UNION of every seed that
    // has been applied, so check them together: what matters is that each player in the ACTIVE
    // field has a seeded rank somewhere, and that it agrees with the client.
    const seed: Record<string, number> = {};
    for (const src of [seedSrc, cincinnatiSeedSrc]) {
      for (const m of src.matchAll(/\(\s*'[a-z0-9_]+',\s*'([a-z0-9]+)',\s*(\d+)\s*[,)]/g)) seed[m[1]] = Number(m[2]);
    }
    const unseeded = PLAYERS.filter(p => seed[p.id] === undefined).map(p => `${p.name} (${p.id})`);
    expect(unseeded, 'players with no seeded rank').toEqual([]);
    for (const p of PLAYERS) {
      expect(seed[p.id], `player_stats rank for ${p.id}`).toBe(p.ranking);
    }
  });
});

// liveScore is what the UI now shows the user (Home/Team/Tournament) — it must equal the
// authoritative server score, scored PER MATCH (a winner counts the moment their result lands,
// not only once the whole round finishes). This guards against the display diverging from the
// leaderboard, and against a regression back to the old round-gated tally.
describe('liveScore (the on-screen total) == server engine, per match', () => {
  beforeEach(() => { loadSampleThrough(null); store().resetGame(); });

  it('matches scoreEntry for a locked squad on a fully-played draw, with a captain', () => {
    loadSampleTournament(); // full draw + results into the live store
    const initialSquad = [roles.champion, roles.qfExit, roles.r64Exit];
    const captainHistory = [{ round: 'R64', playerId: roles.champion }];
    const state: EntryState = { initialSquad, captainHistory, playedRounds: ROUNDS.map(r => r.id) };
    const client = liveScore(initialSquad, [], captainHistory, []);
    expect(client).toBe(scoreEntry(state, buildCtx()));
    expect(client).toBeGreaterThan(0);
  });

  it('credits a win WITHOUT waiting for the whole round to finish (the bug this fixes)', () => {
    loadSampleTournament(); // results are in the live store — but we never "play"/advance a round
    // The OLD path (myScore via playNextRound) needs a fully-complete, played round → stays 0 here.
    expect(store().myScore).toBe(0);
    // liveScore already reflects the champion's wins — the number the user should see — and it
    // equals what the server would score for that same squad.
    const state: EntryState = { initialSquad: [roles.champion], playedRounds: ROUNDS.map(r => r.id) };
    const client = liveScore([roles.champion], [], [], []);
    expect(client).toBe(scoreEntry(state, buildCtx()));
    expect(client).toBeGreaterThan(0);
  });
});

describe('server engine handles an off-roster (unknown-rank) opponent like the client', () => {
  it('awards no upset when the loser has no rank on record', () => {
    // A rostered underdog beats an off-roster player (no rank). The client awards no
    // upset there; the server must NOT invent one from a default rank — the exact
    // divergence a champion-only parity test can't catch. (The all-rostered sample
    // draw never produces this pairing, so we assert it directly on the engine.)
    const ctx: ScoreCtx = {
      roundsInOrder: ['R64'],
      roundPoints: { R64: 1 },
      rankById: { [roles.underdog]: 45 }, // 'ghost' opponent deliberately absent
      matches: [{ round: 'R64', p1: roles.underdog, p2: 'ghost-off-roster', winner: roles.underdog }],
    };
    const state: EntryState = { initialSquad: [roles.underdog], playedRounds: ['R64'] };
    expect(scoreEntry(state, ctx)).toBe(winPoints('R64', roles.underdog, 'ghost-off-roster'));
  });
});

describe('server-authoritative scoring == client engine (parity)', () => {
  // Start with the draw known but NO results in — the parity tests reveal each round as
  // they go (via play()), so captains are committed while the round is open (strict lock).
  beforeEach(() => { loadSampleThrough(null); store().resetGame(); });

  it('matches the client score for a captained + viced champion run', () => {
    store().addPlayer(roles.champion);  // champion (Platinum)
    store().addPlayer(roles.runnerUp);  // reaches the final (Platinum)
    store().finalizeDraft();
    for (const r of ROUNDS) play(r.id, roles.champion, roles.runnerUp);
    expect(store().phase).toBe('finished');
    expect(store().myScore).toBeGreaterThan(0);
    expect(scoreEntry(stateFromStore(), buildCtx())).toBe(store().myScore);
  });

  it('matches for a low-ranked underdog whose run banks real upset bonuses', () => {
    store().addPlayer(roles.underdog);
    store().finalizeDraft();
    for (const r of ROUNDS) play(r.id, roles.underdog);
    expect(store().phase).toBe('finished');
    expect(store().myScore).toBeGreaterThan(0);
    expect(scoreEntry(stateFromStore(), buildCtx())).toBe(store().myScore);
  });

  it('matches the client score across a mid-tournament transfer', () => {
    store().addPlayer(roles.champion);  // champion
    store().addPlayer(roles.r16Exit);   // out in R16 → gets transferred
    store().finalizeDraft();
    play('R64', roles.champion, roles.r16Exit);
    play('R32', roles.champion, roles.r16Exit);
    play('R16', roles.champion);                // R16 — r16Exit out
    store().replacePlayer(roles.r16Exit, roles.runnerUp); // buy a still-alive finalist
    for (const r of ROUNDS.slice(store().currentRoundIndex)) play(r.id, roles.champion, roles.runnerUp);
    expect(store().phase).toBe('finished');
    // score is identical whether computed by the client or the portable server engine
    expect(scoreEntry(stateFromStore(), buildCtx())).toBe(store().myScore);
  });

  it('P3: a never-locked squad (initialSquad empty) scores 0 — cannot bank points off a live, editable squad', () => {
    // The integrity twin of the F1 captain lock: a user who never locks must NOT be scored
    // off their still-editable myTeam, or they could swap in a round's winners after the
    // result is known and retroactively claim the points. Only the frozen snapshot scores.
    loadSampleTournament(); // full results in, so a locked run would bank real points
    const ctx = buildCtx();
    const locked: EntryState = { initialSquad: [roles.champion, roles.runnerUp], playedRounds: ROUNDS.map(r => r.id) };
    const neverLocked: EntryState = { initialSquad: [], myTeam: [roles.champion, roles.runnerUp], playedRounds: ROUNDS.map(r => r.id) };
    expect(scoreEntry(locked, ctx)).toBeGreaterThan(0);      // a real locked run banks points
    expect(scoreEntry(neverLocked, ctx)).toBe(0);            // the same players, unlocked → pending/0
  });

  it('a manipulated client score would NOT match the authoritative recompute', () => {
    store().addPlayer(roles.champion);
    store().finalizeDraft();
    for (const r of ROUNDS) play(r.id, roles.champion);
    const honest = scoreEntry(stateFromStore(), buildCtx());
    // The leaderboard trusts `honest`, not a self-reported number.
    expect(honest).toBe(store().myScore);
    expect(honest).not.toBe(store().myScore + 999);
  });
});

describe('P1: captain-of-record survives the server lock (no doomed edit)', () => {
  // Mirror of save_entry_rpc.sql's F1 captain lock: for any round that already has a result,
  // the incoming captain/vice-of-record must equal what's stored, else the write is rejected.
  const serverRejects = (
    stored: Pick<EntryState, 'captainHistory' | 'viceCaptainHistory'>,
    incoming: Pick<EntryState, 'captainHistory' | 'viceCaptainHistory'>,
    roundsWithResults: string[],
  ): string | null => {
    const at = (h: { round: string; playerId: string }[] | undefined, r: string) => h?.find(c => c.round === r)?.playerId ?? '';
    for (const r of roundsWithResults) {
      if (at(incoming.captainHistory, r) !== at(stored.captainHistory, r)) return `Cannot change your ${r} captain`;
      if (at(incoming.viceCaptainHistory, r) !== at(stored.viceCaptainHistory, r)) return `Cannot change your ${r} vice-captain`;
    }
    return null;
  };

  beforeEach(() => { loadSampleThrough(null); store().resetGame(); });

  it('records the round captain BEFORE its results, so the post-result save is ACCEPTED', () => {
    store().addPlayer(roles.champion);
    store().addPlayer(roles.runnerUp);
    store().finalizeDraft(); // pre_round R64, R64 still open → captain-of-record committed now
    // What the server has stored from this pre-result save:
    const stored = { captainHistory: [...store().captainHistory], viceCaptainHistory: [...store().viceCaptainHistory] };
    expect(stored.captainHistory.find(c => c.round === 'R64')?.playerId).toBe(roles.champion);

    revealThrough('R64');        // results land, THEN the manager plays the round
    store().playNextRound();
    const incoming = { captainHistory: store().captainHistory, viceCaptainHistory: store().viceCaptainHistory };

    // The server now locks R64 — but incoming == stored for R64, so it ACCEPTS (no ghost edit).
    expect(serverRejects(stored, incoming, ['R64'])).toBeNull();
  });

  it('the OLD play-time-append flow WOULD have been rejected (regression guard)', () => {
    // Before the fix, captainHistory[R64] was written only at play time — AFTER R64 had a
    // result — so the server saw an add-from-empty and rejected it. Encoded to prove the fix
    // changed the OUTCOME, not just the code.
    const stored = { captainHistory: [] as { round: string; playerId: string }[], viceCaptainHistory: [] };
    const oldIncoming = { captainHistory: [{ round: 'R64', playerId: roles.champion }], viceCaptainHistory: [] };
    expect(serverRejects(stored, oldIncoming, ['R64'])).toMatch(/Cannot change your R64 captain/);
  });

  it('a late captain CHANGE is refused, and the previous pick carries forward (mid-tournament)', () => {
    // Strict fairness twin of P3: you can't pick a captain for a round whose result you can
    // already see. (Locking late is closed by P6; here the manager locked in time but returned
    // to change the R32 captain only after R32 had already resolved.)
    //
    // What they DON'T lose is the captain they already committed. The rule is carry-forward: an
    // armband stays in force until changed, so the R64 pick is still the R32 captain and still
    // doubles. This is not a nicety — it is what the SERVER does, and the client must agree with
    // the leaderboard. Live proof from cincinnati_2026: manager "Buzzi2" has a vice history of
    // exactly [{R64, cobolli}] and production paid Cobolli ×1.5 in the R32 AND the R16.
    //
    // This test previously asserted captainBonus === 0, which only held because the client scored
    // the armband with an exact-round .find() while the server carried it forward — so the app
    // showed a lower score than the board it was compared against.
    store().addPlayer(roles.champion);
    store().addPlayer(roles.runnerUp);
    store().finalizeDraft();                          // locked before any result — R64 captain recorded
    revealThrough('R64'); store().playNextRound();    // R64 played (captain applies)
    revealThrough('R32');                             // R32 resolves BEFORE the manager touches it
    store().continueToNextRound();                    // records nothing — R32 already has a result
    expect(store().captainHistory.find(c => c.round === 'R32')).toBeUndefined();
    store().setCaptain(roles.runnerUp);               // a real CHANGE — refused, R32 is frozen
    expect(store().captainHistory.find(c => c.round === 'R32')).toBeUndefined();
    expect(leaderOfRecord(store().captainHistory, 'R32')).toBe(roles.champion); // the R64 pick stands

    store().playNextRound();                          // scores R32 with the carried-forward captain
    const r32 = store().roundScores.find(rs => rs.round === 'R32');
    expect(r32?.captainBonus).toBeGreaterThan(0);     // the committed captain still doubles
    // …and the number the app shows equals the number the server would compute. That equality is
    // the whole point: a manager must never see a different score from the leaderboard.
    expect(scoreEntry(stateFromStore(), buildCtx())).toBe(store().myScore);
  });
});

describe('P6: the server freezes squad + transfers once results are in', () => {
  // Mirror of save_entry_rpc.sql (h)+(i): the squad-membership twin of the captain lock.
  const ROUND_ORDER = ['R128', 'R64', 'R32', 'R16', 'QF', 'SF', 'F'];
  type P6State = { initialSquad?: string[]; transfers?: { out: string; in: string; round: string }[] };
  const serverP6Rejects = (stored: P6State, incoming: P6State, resultRounds: string[]): string | null => {
    if (resultRounds.length === 0) return null; // tournament hasn't started → nothing frozen
    const sortKey = (a: string[] = []) => [...a].sort().join(',');
    if (sortKey(incoming.initialSquad) !== sortKey(stored.initialSquad)) {
      return (stored.initialSquad?.length ?? 0) === 0 ? 'the draft is closed' : 'your squad is locked';
    }
    const stoT = new Set((stored.transfers ?? []).map(t => JSON.stringify(t)));
    for (const t of incoming.transfers ?? []) {
      if (stoT.has(JSON.stringify(t))) continue;                 // pre-existing transfer, fine
      const next = ROUND_ORDER[ROUND_ORDER.indexOf(t.round) + 1]; // the round it first scores
      if (next && resultRounds.includes(next)) return `Too late to transfer for the ${next}`;
    }
    return null;
  };

  it('a LATE lock (initialSquad first set after results) is rejected', () => {
    const stored: P6State = { initialSquad: [], transfers: [] };
    const incoming: P6State = { initialSquad: [roles.champion, roles.runnerUp], transfers: [] };
    expect(serverP6Rejects(stored, incoming, ['R64'])).toMatch(/draft is closed/);
  });

  it('an on-time lock (before any result) is accepted, and unchanged re-saves after are fine', () => {
    const before: P6State = { initialSquad: [], transfers: [] };
    const locked: P6State = { initialSquad: [roles.champion, roles.runnerUp], transfers: [] };
    expect(serverP6Rejects(before, locked, [])).toBeNull();              // lock pre-tournament: OK
    expect(serverP6Rejects(locked, locked, ['R64', 'R32'])).toBeNull();  // same squad re-saved after: OK
  });

  it('a retroactive transfer (into a round already resolved) is rejected, a timely one is not', () => {
    const stored: P6State = { initialSquad: [roles.champion, roles.r16Exit], transfers: [] };
    // A transfer logged against R32 first scores R16; if R16 is already resolved → retroactive.
    const retro: P6State = { ...stored, transfers: [{ out: roles.r16Exit, in: roles.runnerUp, round: 'R32' }] };
    expect(serverP6Rejects(stored, retro, ['R64', 'R32', 'R16'])).toMatch(/Too late to transfer for the R16/);
    // Logged against QF → first scores SF; SF not yet resolved → allowed.
    const timely: P6State = { ...stored, transfers: [{ out: roles.r16Exit, in: roles.runnerUp, round: 'QF' }] };
    expect(serverP6Rejects(stored, timely, ['R64', 'R32', 'R16', 'QF'])).toBeNull();
  });
});
