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
  // The court graphic reads as three clearly separated zones, outer→inner:
  //   stands  → the stadium seating bowl (darkest)
  //   apron   → the OUTSIDE court: the painted run-off surround
  //   surface → the INSIDE court: the playing surface, carrying the white lines
  // Only grass gets mowing `stripe`s; hard & clay are a solid inside surface.
  court: {
    standTop: string; standBottom: string; // seating bowl gradient
    apron: string;                          // outside court (run-off surround)
    surface: string;                        // inside court (playing surface)
    stripe?: string;                        // grass mowing stripe (omit for hard/clay)
    line: string;                           // painted court lines
    net: string; netShadow: string;         // net + its dashed shadow
    crowdLight: string; crowdDark: string;  // crowd speckle in the stands
  };
}

// Each Grand Slam surface gets its own court palette. Grass = Wimbledon greens,
// Hard = US-Open blue, Clay = Roland-Garros terracotta.
export const SURFACE_THEME: Record<Surface, SurfaceTheme> = {
  grass: {
    label: 'Grass', accent: '#12A150',
    court: {
      standTop: '#0f2e1c', standBottom: '#0a2013',
      apron: '#15562e',                       // dark green surround
      surface: '#3c9147', stripe: '#347f3c',  // green with mowing stripes
      line: '#ffffff',
      net: '#eef4f0', netShadow: '#0a1f44', crowdLight: '#dfe6d8', crowdDark: '#9fb6a0',
    },
  },
  hard: {
    label: 'Hard', accent: '#0e6fc4',
    court: {
      standTop: '#0c2036', standBottom: '#07162a',
      apron: '#1f7a44',                       // green surround (US-Open style)
      surface: '#2f6aa8',                     // solid blue playing surface (no stripes)
      line: '#ffffff',
      net: '#eef4f0', netShadow: '#0a1f44', crowdLight: '#ccd8e6', crowdDark: '#93a4bc',
    },
  },
  clay: {
    label: 'Clay', accent: '#E5472B',
    court: {
      standTop: '#341a10', standBottom: '#241009',
      apron: '#8a4a2c',                       // darker clay surround
      surface: '#c96f42',                     // terracotta playing surface
      line: '#f2ead9',
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
  // Playable in PRODUCTION? Only `live` tournaments appear in the in-app switcher, so an
  // upcoming one can be fully built + config'd (and tested on staging) without exposing it
  // to players. Flip to true to launch it. (Staging can still force any id via env.)
  live: boolean;
  // The ISO datetime (UTC) each round's play begins = the LOCK DEADLINE for that round:
  //   • schedule[firstRound] is when the draft closes (you must have a squad by then).
  //   • schedule[round] is when captain/vice lock for that round.
  // Optional/partial — a round with no time shows no countdown. Update with the official
  // order of play when it publishes.
  schedule?: Partial<Record<RoundId, string>>;
  court?: SurfaceTheme['court']; // optional court palette override (else the surface default)
}

// Every tournament the app knows about. One is active at a time (ACTIVE_TOURNAMENT_ID);
// the rest are staged, ready to switch to once their field + data are wired.
export const TOURNAMENTS: Record<string, Tournament> = {
  // Active tournament: the National Bank Open (Montréal) — run LIVE. Results arrive
  // from the feed/admin as the tournament is played; nothing is pre-baked. The real
  // 74-entrant Montréal field (montreal2026Field.json) is the draftable roster; only
  // the live match RESULTS/pairings are still pending until the draw publishes.
  // Montréal hard court: green surround (stands), blue playing surface.
  montreal_2026: {
    id: 'montreal_2026',
    name: 'National Bank Open',
    edition: 'National Bank Open 2026',
    year: 2026,
    surface: 'hard',
    location: 'Montréal, Canada',
    // The real 96-player Masters draw: the 32 seeds get first-round byes, so every
    // drafted player (all top-rank entrants) enters at the Round of 64 — a clean 6-round
    // scored draw. The 32 opening qualifier matches sit below where any drafted player enters.
    drawSize: 96,
    rounds: ['R64', 'R32', 'R16', 'QF', 'SF', 'F'],
    mode: 'live',
    live: true, // ← the live production tournament
    // ESTIMATED order of play (UTC) — replace with the official schedule when it publishes.
    // schedule.R64 doubles as the draft deadline (squad must be locked before play starts).
    schedule: {
      R64: '2026-08-02T15:00:00Z',
      R32: '2026-08-04T15:00:00Z',
      R16: '2026-08-06T15:00:00Z',
      QF:  '2026-08-08T15:00:00Z',
      SF:  '2026-08-10T17:00:00Z',
      F:   '2026-08-12T18:00:00Z',
    },
    court: {
      standTop: '#0c2433', standBottom: '#071726',  // dark stadium seating
      apron: '#1f7a44',                              // GREEN outside court
      surface: '#2f6aa8',                            // BLUE inside court (no stripes — hard)
      line: '#ffffff',
      net: '#eef4f0', netShadow: '#0a1f44', crowdLight: '#dfe6d8', crowdDark: '#9fb6a0',
    },
  },

  // ── NEXT UP: the Cincinnati Open (staged, not yet active) ────────────────────
  // Built and tested on a STAGING deployment (VITE_ACTIVE_TOURNAMENT=cincinnati_2026)
  // while Montréal runs live. Its field/draw/player_stats are wired when Cincinnati's
  // entry list publishes; until then staging borrows a placeholder field (see players.ts).
  // Cincinnati hard court: its signature teal-blue surround + deep-blue playing surface.
  cincinnati_2026: {
    id: 'cincinnati_2026',
    name: 'Cincinnati Open',
    edition: 'Cincinnati Open 2026',
    year: 2026,
    surface: 'hard',
    location: 'Cincinnati, USA',
    drawSize: 96,
    rounds: ['R64', 'R32', 'R16', 'QF', 'SF', 'F'],
    mode: 'live',
    live: false, // ← not launched yet; flip to true (with the real field wired) to go live
    court: {
      standTop: '#0a2230', standBottom: '#06161f',
      apron: '#0e7490',                              // teal surround (Cincinnati's look)
      surface: '#1e40af',                            // deep-blue inside court
      line: '#ffffff',
      net: '#eef4f0', netShadow: '#0a1f44', crowdLight: '#dbeafe', crowdDark: '#93a4bc',
    },
  },
};

const DEFAULT_TOURNAMENT_ID = 'montreal_2026';
const ACTIVE_STORE_KEY = 'gsgm-active-tournament';

// The tournaments a player can pick between in the app — the `live` ones, ordered as
// declared. When there's only one, the switcher hides entirely.
export const LIVE_TOURNAMENTS: Tournament[] = Object.values(TOURNAMENTS).filter(t => t.live);

// Which tournament is running THIS session. Precedence:
//   1. VITE_ACTIVE_TOURNAMENT env — a STAGING build forces a specific (even not-yet-live)
//      tournament onto its own URL, without touching production.
//   2. the player's saved switcher choice (only honoured if that tournament is `live`).
//   3. the default (Montréal).
// Resolved ONCE at boot; switching re-boots the app (see switchTournament) so every
// per-tournament constant (config, field, store keys) re-initialises cleanly.
function resolveActiveId(): string {
  const env = import.meta.env.VITE_ACTIVE_TOURNAMENT as string | undefined;
  if (env && TOURNAMENTS[env]) return env;
  try {
    const stored = localStorage.getItem(ACTIVE_STORE_KEY);
    if (stored && TOURNAMENTS[stored]?.live) return stored;
  } catch { /* ignore */ }
  return DEFAULT_TOURNAMENT_ID;
}

export const ACTIVE_TOURNAMENT_ID = resolveActiveId();
export const TOURNAMENT: Tournament = TOURNAMENTS[ACTIVE_TOURNAMENT_ID];

// Switch the active tournament: persist the choice and reload so the whole app re-inits
// for it (each tournament has its own squad/leaderboard, isolated by id). No-op for the
// current one or a non-live id.
export function switchTournament(id: string): void {
  if (id === ACTIVE_TOURNAMENT_ID || !TOURNAMENTS[id]?.live) return;
  try { localStorage.setItem(ACTIVE_STORE_KEY, id); } catch { /* ignore */ }
  window.location.reload();
}

// Convenience: the active surface's theme, with any per-tournament court override
// applied (e.g. Montréal's green-surround / blue-surface hard court).
const BASE_SURFACE = SURFACE_THEME[TOURNAMENT.surface];
export const SURFACE: SurfaceTheme = TOURNAMENT.court
  ? { ...BASE_SURFACE, court: TOURNAMENT.court }
  : BASE_SURFACE;
