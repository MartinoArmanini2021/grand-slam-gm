import { describe, it, expect, beforeEach } from 'vitest';
import { useProfile, markTournamentJoined, hasJoined } from '../store/profileStore';

// The onboarding gate's contract: a player joins each tournament exactly once, and
// that record survives per tournament id (so a new event onboards fresh, a returning
// player skips the gate). This guards the "every tournament is a fresh start" rule.
describe('tournament join tracking', () => {
  beforeEach(() => { useProfile.getState().reset(); });

  it('starts with no tournaments joined', () => {
    expect(useProfile.getState().joinedTournaments).toEqual([]);
    expect(hasJoined(useProfile.getState(), 'montreal_2026')).toBe(false);
  });

  it('markTournamentJoined records a tournament and is idempotent', () => {
    markTournamentJoined('montreal_2026');
    markTournamentJoined('montreal_2026'); // again → no duplicate
    expect(useProfile.getState().joinedTournaments).toEqual(['montreal_2026']);
    expect(hasJoined(useProfile.getState(), 'montreal_2026')).toBe(true);
  });

  it('tracks each tournament independently (a new event is not auto-joined)', () => {
    markTournamentJoined('montreal_2026');
    expect(hasJoined(useProfile.getState(), 'us_open_2026')).toBe(false); // fresh event → onboard again
    markTournamentJoined('us_open_2026');
    expect(useProfile.getState().joinedTournaments).toEqual(['montreal_2026', 'us_open_2026']);
  });

  it('reset (used on sign-out) clears joined tournaments and session flags', () => {
    markTournamentJoined('montreal_2026');
    useProfile.getState().set({ entryHydrated: true });
    useProfile.getState().reset();
    expect(useProfile.getState().joinedTournaments).toEqual([]);
    expect(useProfile.getState().entryHydrated).toBe(false);
    expect(useProfile.getState().hydrated).toBe(false);
  });
});
