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

export interface Tournament {
  id: string;
  name: string;      // "Wimbledon"
  edition: string;   // "Wimbledon 2026" — the headline used across the UI
  year: number;
  surface: Surface;
  location: string;
  drawSize: number;  // 128 for a Slam; Masters draws differ
  rounds: RoundId[]; // the ordered rounds this tournament plays & scores
}

// The tournament the app is currently running. Change this object (and add the
// field + bracket data for it) to point the whole app at a new tournament.
export const TOURNAMENT: Tournament = {
  id: 'wimbledon_2026',
  name: 'Wimbledon',
  edition: 'Wimbledon 2026',
  year: 2026,
  surface: 'grass',
  location: 'London, UK',
  drawSize: 128,
  rounds: ['R128', 'R64', 'R32', 'R16', 'QF', 'SF', 'F'],
};

// Convenience: the active surface's theme.
export const SURFACE: SurfaceTheme = SURFACE_THEME[TOURNAMENT.surface];
