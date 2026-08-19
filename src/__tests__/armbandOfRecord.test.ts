import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ── The court must show the armband that SCORES ─────────────────────────────────────────────────
//
// THE BUG, from production on 2026-08-19. Manager "Agass" captained Fonseca in the Round of 32.
// Fonseca lost. pickLeaders() then silently reassigned state.captain to Cobolli — the best-ranked
// survivor — because that is what it does whenever the current captain is eliminated. But
// pickLeaders does NOT write to captainHistory, and captainHistory is the only thing
// recompute-score reads.
//
// So the app displayed "Cobolli · Captain ×2" and paid him ×1, while the captain of record stayed
// Fonseca, who was out and scored nothing. The founder saw the same player credited differently to
// two managers, could not explain it, and lost confidence in the whole scoreboard. That is the
// worst thing that can happen to a fantasy game — worse than any visual defect.
//
// The rule is not wrong: an armband is committed per round and freezes at that round's first
// result, which is what stops retroactive captain picks. What was wrong is that the UI hid the
// consequence and invented a replacement.
const src = readFileSync(fileURLToPath(new URL('../components/SquadCourt.tsx', import.meta.url)), 'utf8');

describe('SquadCourt — the on-court armband is the leader OF RECORD', () => {
  it('resolves the armband from the committed history once the tournament is live', () => {
    expect(src).toMatch(/capOfRecord\s*=\s*roundForLeaders\s*\?\s*leaderOfRecord\(captainHistory/);
    expect(src).toMatch(/viceOfRecord\s*=\s*roundForLeaders\s*\?\s*leaderOfRecord\(viceCaptainHistory/);
  });

  // The store value is still right during the draft — nothing is committed until lock — but it must
  // never win once play has started, because that is the value pickLeaders rewrites.
  it('prefers the record over the store value while live, and the store value while drafting', () => {
    const capLine = src.split('\n').find(l => l.startsWith('  const cap = captainId'));
    expect(capLine, 'the cap resolution line').toBeTruthy();
    expect(capLine).toMatch(/liveArmband \? capOfRecord : captain/);
  });

  // A dead armband must be stated, not papered over. This is the specific regression: silently
  // promoting a survivor on screen is what made a real manager distrust real numbers.
  it('warns when the committed armband is missing or eliminated', () => {
    expect(src).toMatch(/capDead\s*=\s*isOwnTeam0 && liveArmband && \(!capOfRecord \|\| isEliminated\(capOfRecord\)\)/);
    expect(src).toMatch(/viceDead\s*=\s*isOwnTeam0 && liveArmband && \(!viceOfRecord \|\| isEliminated\(viceOfRecord\)\)/);
    expect(src).toMatch(/Nobody is scoring ×2/);
    expect(src).toMatch(/Nobody is scoring ×1\.5/);
  });

  it('the warning replaces the generic locked banner rather than stacking with it', () => {
    expect(src).toMatch(/\{leadersLocked && !capDead && !viceDead && \(/);
  });
});

// pickLeaders is still the right behaviour for the DRAFT — it guarantees two on-court leaders while
// you build a squad. The fault was never the auto-pick itself; it was that its result was displayed
// as though it had been committed. This pins the boundary so a future change cannot quietly make the
// auto-pick authoritative again.
describe('gameStore — pickLeaders never writes history', () => {
  const store = readFileSync(fileURLToPath(new URL('../store/gameStore.ts', import.meta.url)), 'utf8');

  it('auto-picked leaders are not recorded as committed', () => {
    const fn = store.slice(store.indexOf('function pickLeaders('), store.indexOf('// STRICT captain-of-record'));
    expect(fn).not.toMatch(/captainHistory/);
    expect(fn).not.toMatch(/recordLeaders/);
  });

  // recordLeaders is the ONLY writer, and it refuses once the round has a result — the server's
  // save_entry enforces the same freeze, so a UI that recorded here would just be rejected.
  it('recordLeaders refuses to commit once the round has started', () => {
    expect(store).toMatch(/if \(!roundId \|\| roundStarted\(roundId\)\) return \{ captainHistory, viceCaptainHistory \};/);
  });
});
