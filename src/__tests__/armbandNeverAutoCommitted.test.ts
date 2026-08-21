import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../store/gameStore';
import { loadSampleThrough, revealThrough, roles } from './fixtures/sampleDraw';

// ── THE APP MUST NEVER COMMIT AN ARMBAND THE MANAGER DID NOT CHOOSE ─────────────────────────────
//
// Reported 2026-08-20: "Cobolli was the Vice Cap of both teams and had different scores."
// He was not, and the manager was right to disbelieve the record — the app had written it.
//
// `continueToNextRound` called `pickLeaders(myTeam, null, null, revealed)`. Passing null, null
// DISCARDED the manager's captain and vice, replaced them with the two highest-ranked survivors,
// and then wrote that into captainHistory/viceCaptainHistory as a committed pick. Tapping
// "next round" silently rewrote who was scoring ×2 and ×1.5.
//
// For manager "Agass" that put Mensik — the highest-ranked survivor, who had just arrived as the
// replacement for their transferred-out captain Shelton — into the Round-of-32 vice slot. It then
// carried into the Round of 16, where it cost them Cobolli's ×1.5: the same Cobolli win paid 7.5 to
// a manager who never moved their armband and 5 to them, for a reason that existed nowhere in the
// UI and that they had never agreed to.
//
// Nothing needs to be written when a round advances. leaderOfRecord already carries the last
// committed pick forward into every later round, so a manager who never touches the captaincy keeps
// their ×2 / ×1.5 automatically. A write here can only overwrite a real choice with a guess.
const store = () => useGameStore.getState();

describe('advancing a round never touches the armband record', () => {
  beforeEach(() => { loadSampleThrough(null); store().resetGame(); });

  const lockAndPlayR64 = () => {
    store().addPlayer(roles.champion);
    store().addPlayer(roles.runnerUp);
    store().addPlayer(roles.underdog);
    store().finalizeDraft();
    revealThrough('R64');
    store().playNextRound();
  };

  it('does not append a new entry to either history', () => {
    lockAndPlayR64();
    const capBefore = JSON.stringify(store().captainHistory);
    const viceBefore = JSON.stringify(store().viceCaptainHistory);

    store().continueToNextRound();

    expect(JSON.stringify(store().captainHistory)).toBe(capBefore);
    expect(JSON.stringify(store().viceCaptainHistory)).toBe(viceBefore);
  });

  // The specific shape of the bug: an R32 entry appearing that the manager never made.
  it('leaves the next round uncommitted, so the previous pick simply carries forward', () => {
    lockAndPlayR64();
    store().continueToNextRound();
    expect(store().captainHistory.find(c => c.round === 'R32')).toBeUndefined();
    expect(store().viceCaptainHistory.find(c => c.round === 'R32')).toBeUndefined();
  });

  // The visible half of the fault: your chosen captain was replaced by the top-ranked survivor.
  it('keeps the manager\'s own captain and vice on court rather than reassigning by rank', () => {
    lockAndPlayR64();
    store().continueToNextRound();               // → pre_round, where an armband can be set
    // The runner-up survives to the final, so any later change can only be the app reassigning —
    // never the draw forcing its hand.
    store().setCaptain(roles.runnerUp);
    const chosenCap = store().captain;
    const chosenVice = store().viceCaptain;
    expect(chosenCap).toBe(roles.runnerUp);

    revealThrough('R32');
    store().playNextRound();
    store().continueToNextRound();                // the call that used to overwrite both slots

    expect(store().captain).toBe(chosenCap);
    expect(store().viceCaptain).toBe(chosenVice);
  });
});

// The second half of the same fault: recordLeaders used to take both slots unconditionally, so
// changing ONE armband committed the OTHER — whatever value happened to be sitting in state, often
// one pickLeaders had auto-assigned. Each setter must now write only the slot the manager moved.
describe('changing one armband does not commit the other', () => {
  beforeEach(() => { loadSampleThrough(null); store().resetGame(); });

  const lockAndAdvance = () => {
    store().addPlayer(roles.champion);
    store().addPlayer(roles.runnerUp);
    store().addPlayer(roles.underdog);
    store().finalizeDraft();
    revealThrough('R64');
    store().playNextRound();
    store().continueToNextRound();
  };

  it('setCaptain leaves the vice history untouched', () => {
    lockAndAdvance();
    const viceBefore = JSON.stringify(store().viceCaptainHistory);
    store().setCaptain(roles.underdog);
    expect(store().captainHistory.find(c => c.round === 'R32')?.playerId).toBe(roles.underdog);
    expect(JSON.stringify(store().viceCaptainHistory)).toBe(viceBefore);
  });

  it('setViceCaptain leaves the captain history untouched', () => {
    lockAndAdvance();
    const capBefore = JSON.stringify(store().captainHistory);
    store().setViceCaptain(roles.underdog);
    expect(store().viceCaptainHistory.find(c => c.round === 'R32')?.playerId).toBe(roles.underdog);
    expect(JSON.stringify(store().captainHistory)).toBe(capBefore);
  });

  // Promoting your own vice to captain genuinely moves BOTH slots — that one is a real choice and
  // must still be recorded, or the vacated vice slot would keep scoring the promoted player.
  it('promoting the vice to captain records both, because the manager moved both', () => {
    lockAndAdvance();
    const vice = store().viceCaptain!;
    expect(vice).toBeTruthy();
    store().setCaptain(vice);
    expect(store().captainHistory.find(c => c.round === 'R32')?.playerId).toBe(vice);
    expect(store().viceCaptainHistory.find(c => c.round === 'R32')).toBeDefined();
  });
});
