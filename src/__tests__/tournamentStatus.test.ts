import { describe, it, expect } from 'vitest';
import {
  TOURNAMENTS, SELECTABLE_TOURNAMENTS, TOURNAMENT, ACTIVE_TOURNAMENT_ID, IS_READ_ONLY,
} from '../data/tournamentConfig';

// ── Tournament lifecycle: staged | live | completed ──────────────────────────────────────────────
//
// This replaced a single `live: boolean` that meant two things at once — "players can see it" and
// "players can play it" — and therefore could not express a FINISHED event you may still look at.
// The gap was a live hazard: Montréal stayed flagged `live` after it ended, so it sat in the
// switcher next to the running event. Since fix 1.3 each event owns its player rows, so a save
// against Montréal is rejected as "Squad contains an unknown player" — and CloudSync answers a
// rejected save by calling revertToCloud(), which DISCARDS local state. One tap could bin real work.
describe('tournament status model', () => {
  it('every tournament declares a valid status', () => {
    for (const t of Object.values(TOURNAMENTS)) {
      expect(['staged', 'live', 'completed']).toContain(t.status);
    }
  });

  // EXACTLY one, not "at least" one. The server has a single app_config.active_tournament_id and
  // both the scorer and the results feed key off it, so a second live event here would mean the app
  // offers something the backend is not scoring — a leaderboard frozen at zero with no error.
  it('exactly one tournament is live', () => {
    const live = Object.values(TOURNAMENTS).filter(t => t.status === 'live');
    expect(live.map(t => t.id)).toHaveLength(1);
  });

  // THE TRAPDOOR THIS CLOSES. Pinned by id: if anyone flips Montréal back to 'live' this fails.
  it('Montréal is completed, not live', () => {
    expect(TOURNAMENTS.montreal_2026.status).toBe('completed');
  });

  it('staged tournaments are never selectable; completed ones are', () => {
    const ids = SELECTABLE_TOURNAMENTS.map(t => t.id);
    for (const t of Object.values(TOURNAMENTS)) {
      if (t.status === 'staged') expect(ids).not.toContain(t.id);
      else expect(ids).toContain(t.id);
    }
  });
});

describe('boot resolution', () => {
  // BUG 1. The default was the hardcoded string 'cincinnati_2026' — right the day it was written,
  // wrong the moment Cincinnati ends, and it had already been stale once (it read 'montreal_2026'
  // while Cincinnati was running). It is now derived, so a fresh manager always lands on the event
  // they can actually play.
  it('a fresh session opens on the live tournament, not a finished one', () => {
    // No VITE_ACTIVE_TOURNAMENT and no stored choice under test → the derived default.
    expect(TOURNAMENT.status).toBe('live');
    expect(ACTIVE_TOURNAMENT_ID).toBe(Object.values(TOURNAMENTS).find(t => t.status === 'live')!.id);
  });

  it('the read-only gate agrees with the active status', () => {
    expect(IS_READ_ONLY).toBe(TOURNAMENT.status === 'completed');
  });
});

describe('the switcher can always be reached', () => {
  // BUG 2. TournamentSwitcher renders nothing when SELECTABLE_TOURNAMENTS.length <= 1. That was
  // fine while only live events were listed, but once finished ones became browsable it created a
  // trap: a manager whose stored choice is a finished tournament lands there, and the one control
  // that could take them back to the running event is hidden — hidden BECAUSE only one event is
  // live. Whenever a completed tournament is reachable, there must be at least two entries, so the
  // switcher renders.
  it('a completed tournament is never the only thing on offer', () => {
    const completed = SELECTABLE_TOURNAMENTS.filter(t => t.status === 'completed');
    if (completed.length > 0) expect(SELECTABLE_TOURNAMENTS.length).toBeGreaterThan(1);
  });
});
