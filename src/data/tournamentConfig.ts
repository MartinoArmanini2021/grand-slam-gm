// ── Tournament identity & per-surface theming ────────────────────────────────
// The single place that says WHICH tournament the app is running and what it
// looks like. Swapping the active tournament (and its surface) re-skins the
// branding and the court graphic — no component edits needed.
//
// Roadmap: this is the W1/W2 foundation. Draw size / round structure (for Masters
// vs Slam), the full field, and the live-results feed build on top of this.

import type { RoundId } from '../types';

export type Surface = 'grass' | 'hard' | 'clay';

// ── Shared round metadata ────────────────────────────────────────────────────
// One canonical curve by round name: a given round is worth the same points in
// every tournament (a Masters final scores like a Slam final). A tournament just
// declares WHICH of these rounds it plays (its `rounds` list) — the engine derives
// everything else (exit staging, transfer lock, bracket columns) from that.
export const ROUND_META: Record<RoundId, { label: string; short: string; points: number }> = {
  R128: { label: 'Round of 128', short: 'R128', points: 1 },
  R64:  { label: 'Round of 64',  short: 'R64',  points: 1 },
  R32:  { label: 'Round of 32',  short: 'R32',  points: 2 },
  R16:  { label: 'Round of 16',  short: 'R16',  points: 5 },
  QF:   { label: 'Quarter-Final', short: 'QF',  points: 10 },
  SF:   { label: 'Semi-Final', short: 'SF',  points: 20 },
  F:    { label: 'Final', short: 'F',   points: 40 },
};

// Canonical earliest→latest ordering of every possible round — the basis for
// "how far did a player get" (exit staging), independent of which subset a given
// tournament scores.
export const ROUND_ORDER: RoundId[] = ['R128', 'R64', 'R32', 'R16', 'QF', 'SF', 'F'];

export interface SurfaceTheme {
  label: string;   // "Grass" / "Hard" / "Clay" — shown in the header
  accent: string;  // the surface's brand accent (matches the app's surface palette)
  court: {
    standTop: string; standBottom: string; // stadium bowl gradient
    band1: string; band2: string;           // concentric stand bands
    stripeA: string; stripeB: string;       // playing-surface stripes
    line: string;                           // painted court lines
    net: string; netShadow: string;         // net + its dashed shadow
    crowdLight: string; crowdDark: string;  // crowd speckle
  };
}

// Each Grand Slam surface gets its own court palette. Grass = Wimbledon greens,
// Hard = US-Open blue, Clay = Roland-Garros terracotta.
export const SURFACE_THEME: Record<Surface, SurfaceTheme> = {
  grass: {
    label: 'Grass', accent: '#12A150',
    court: {
      standTop: '#123420', standBottom: '#0c2417', band1: '#163d25', band2: '#1b4a2d',
      stripeA: '#3f8347', stripeB: '#367038', line: '#ffffff',
      net: '#eef4f0', netShadow: '#0a1f44', crowdLight: '#dfe6d8', crowdDark: '#9fb6a0',
    },
  },
  hard: {
    label: 'Hard', accent: '#0e6fc4',
    court: {
      standTop: '#0c2036', standBottom: '#07162a', band1: '#123049', band2: '#17395a',
      stripeA: '#2f6aa8', stripeB: '#285d95', line: '#ffffff',
      net: '#eef4f0', netShadow: '#0a1f44', crowdLight: '#ccd8e6', crowdDark: '#93a4bc',
    },
  },
  clay: {
    label: 'Clay', accent: '#E5472B',
    court: {
      standTop: '#3a1f14', standBottom: '#2a160e', band1: '#5a2e1c', band2: '#6b3822',
      stripeA: '#c96f42', stripeB: '#b45f36', line: '#f2ead9',
      net: '#eef4f0', netShadow: '#3a1f14', crowdLight: '#e6d8cd', crowdDark: '#bca697',
    },
  },
};

// How the app runs a tournament:
//  • 'replay' — the whole draw is known and baked in; the app plays back completed
//    results with no spoilers (Wimbledon 2026 — a finished event).
//  • 'live'   — results don't exist yet; they arrive round by round from a feed
//    (Wikipedia poll) with an admin override. The engine is the same; only the
//    source of results and the gating on "can this round be played" differ.
export type TournamentMode = 'replay' | 'live';

export interface Tournament {
  id: string;
  name: string;      // "Wimbledon"
  edition: string;   // "Wimbledon 2026" — the headline used across the UI
  year: number;
  surface: Surface;
  location: string;
  drawSize: number;  // 128 for a Slam; Masters draws differ
  rounds: RoundId[]; // the ordered rounds this tournament plays & scores
  mode: TournamentMode;
  court?: SurfaceTheme['court']; // optional court palette override (else the surface default)
}

// Every tournament the app knows about. One is active at a time (ACTIVE_TOURNAMENT_ID);
// the rest are staged, ready to switch to once their field + data are wired.
export const TOURNAMENTS: Record<string, Tournament> = {
  // Active tournament for the friends demo: branded as the National Bank Open
  // (Montréal). It still plays the baked 128-draw bracket as STAND-IN data until the
  // real Montréal field/draw is wired (W4); only the branding + court are Montréal.
  // Montréal hard court: green surround (stands), blue playing surface.
  wimbledon_2026: {
    id: 'wimbledon_2026',
    name: 'National Bank Open',
    edition: 'National Bank Open 2026',
    year: 2026,
    surface: 'hard',
    location: 'Montréal, Canada',
    drawSize: 128,
    rounds: ['R128', 'R64', 'R32', 'R16', 'QF', 'SF', 'F'],
    mode: 'replay',
    court: {
      standTop: '#123420', standBottom: '#0c2417', band1: '#163d25', band2: '#1b4a2d', // green surround
      stripeA: '#2f6aa8', stripeB: '#285d95', line: '#ffffff',                          // blue playing surface
      net: '#eef4f0', netShadow: '#0a1f44', crowdLight: '#dfe6d8', crowdDark: '#9fb6a0',
    },
  },
  // National Bank Open 2026 (men's) — Montréal, IGA Stadium, Aug 1–13. The new
  // 12-day, 96-player Masters format: the top 32 seeds get first-round byes, so for
  // our roster of top players the scored draw is a clean 6-round R64 → Final (the 32
  // opening qualifier matches sit below where any drafted player enters). This is a
  // LIVE event — results arrive as it's played (see the live-results feed).
  canada_2026: {
    id: 'canada_2026',
    name: 'National Bank Open',
    edition: 'National Bank Open 2026',
    year: 2026,
    surface: 'hard',
    location: 'Montréal, Canada',
    drawSize: 96,
    rounds: ['R64', 'R32', 'R16', 'QF', 'SF', 'F'],
    mode: 'live',
  },
};

// The tournament the app is currently running. Switch this id (once the target's
// field + data are wired) to point the whole app at a different tournament.
export const ACTIVE_TOURNAMENT_ID = 'wimbledon_2026';
export const TOURNAMENT: Tournament = TOURNAMENTS[ACTIVE_TOURNAMENT_ID];

// Convenience: the active surface's theme, with any per-tournament court override
// applied (e.g. Montréal's green-surround / blue-surface hard court).
const BASE_SURFACE = SURFACE_THEME[TOURNAMENT.surface];
export const SURFACE: SurfaceTheme = TOURNAMENT.court
  ? { ...BASE_SURFACE, court: TOURNAMENT.court }
  : BASE_SURFACE;
