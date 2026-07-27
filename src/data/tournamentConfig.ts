// ── Tournament identity & per-surface theming ────────────────────────────────
// The single place that says WHICH tournament the app is running and what it
// looks like. Swapping the active tournament (and its surface) re-skins the
// branding and the court graphic — no component edits needed.
//
// Roadmap: this is the W1/W2 foundation. Draw size / round structure (for Masters
// vs Slam), the full field, and the live-results feed build on top of this.

export type Surface = 'grass' | 'hard' | 'clay';

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
  drawSize: number;  // 128 for a Slam (Masters events differ — used later by W1)
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
};

// Convenience: the active surface's theme.
export const SURFACE: SurfaceTheme = SURFACE_THEME[TOURNAMENT.surface];
