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
  // 77-entrant Montréal field (montreal2026Field.json) is the draftable roster; only
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
    // Official window: draw ceremony Fri 31 Jul 2026; main draw runs Sat 1 Aug → the
    // expanded-Masters final on Thu 13 Aug 2026 (UTC times below). R64 doubles as the
    // draft deadline — the squad must be locked before the first ball is struck. The
    // mid-round times are best estimates until the official order of play publishes.
    // Round START times = the FIRST match of each round (the app locks a round's captain /
    // transfers at its first result). Sourced from the tournament's official session schedule
    // (nationalbankopen.com) — Montréal, IGA Stadium, EDT (UTC−4) — and cross-checked against the
    // live results feed (which anchors R32 = Aug 6–7, R16 = Aug 8–9). NB: the DATA feed (Wikipedia
    // draw wikitext) carries NO times, so these live only here. Per-match times can't be "perfect" —
    // the tournament sets the order of play the evening before and it shifts for weather/overruns —
    // so these are the stable round-start anchors, not live per-match clocks. The Final's time is not
    // firmly published (finals-day OoP lands late); it's an estimate until confirmed.
    schedule: {
      R64: '2026-08-04T15:00:00Z', // Round of 64, day 1 — 11:00 EDT (drafted players enter here)
      R32: '2026-08-06T16:30:00Z', // Round of 32, day 1 — 12:30 EDT
      R16: '2026-08-08T16:30:00Z', // Round of 16, day 1 — 12:30 EDT
      QF:  '2026-08-10T20:00:00Z', // Quarter-finals, day 1 — 16:00 EDT
      SF:  '2026-08-12T20:00:00Z', // Semi-finals — 16:00 EDT
      F:   '2026-08-13T17:00:00Z', // Final — ESTIMATE (~13:00 EDT), pending the official finals-day OoP
    },
    court: {
      standTop: '#0c2433', standBottom: '#071726',  // dark stadium seating
      apron: '#1f7a44',                              // GREEN outside court
      surface: '#2f6aa8',                            // BLUE inside court (no stripes — hard)
      line: '#ffffff',
      net: '#eef4f0', netShadow: '#0a1f44', crowdLight: '#dfe6d8', crowdDark: '#9fb6a0',
    },
  },

  // ── NEXT UP: the Cincinnati Open ─────────────────────────────────────────────
  // Real 83-player draftable field built from the published draw (scripts/build-cincinnati-field.mjs)
  // and reconciled exactly against Wikipedia (scripts/reconcile-field.mjs — 0 missing, 0 phantom).
  // Same 96-draw Masters shape as Montréal: 32 seeds bye into the second round, so every drafted
  // player enters at R64. Cincinnati hard court: teal-blue surround + deep-blue playing surface.
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
    // LIVE (cut over 14 Aug 2026, once Montréal's final was decided and scored — Shelton champion).
    // This is the event the app opens on; Montréal stays `live` so managers can still review their
    // finished run from the switcher. Full cutover record in docs/CINCINNATI_CUTOVER.md.
    live: true,
    // Official window: 13–23 Aug 2026, Lindner Family Tennis Center, Mason OH (Eastern, UTC−4).
    // Round START = the FIRST match of each round = that round's LOCK deadline; R64 (seeds' first
    // matches, Sat 15 Aug) doubles as the DRAFT DEADLINE. Day sessions open 11:00 ET (15:00 UTC).
    // Sourced from the tournament day-by-day schedule (lta.org.uk / cincinnatiopen.com). Exact per-
    // match times aren't published until the evening before, so these are stable round-start anchors;
    // the live results feed also locks a round the moment its first result lands (roundStarted), so a
    // slightly-off time self-corrects. SF/F times are afternoon estimates until the finals-day OoP.
    schedule: {
      R64: '2026-08-15T15:00:00Z', // 2nd round begins — seeds enter, DRAFT CLOSES (11:00 ET Sat)
      R32: '2026-08-17T15:00:00Z', // 3rd round — 11:00 ET Mon
      R16: '2026-08-19T15:00:00Z', // round of 16 — 11:00 ET Wed
      QF:  '2026-08-20T15:00:00Z', // quarter-finals begin — 11:00 ET Thu
      SF:  '2026-08-22T17:00:00Z', // semi-finals — ~13:00 ET Sat (estimate)
      F:   '2026-08-23T19:00:00Z', // final — ~15:00 ET Sun (estimate, pending finals-day OoP)
    },
    court: {
      standTop: '#0a2230', standBottom: '#06161f',
      apron: '#0e7490',                              // teal surround (Cincinnati's look)
      surface: '#1e40af',                            // deep-blue inside court
      line: '#ffffff',
      net: '#eef4f0', netShadow: '#0a1f44', crowdLight: '#dbeafe', crowdDark: '#93a4bc',
    },
  },

  // ── LATER: the US Open (staged, not yet active) ──────────────────────────────
  // The season's Grand Slam. A 128-player draw with NO byes, so — unlike a Masters — every
  // player plays Round 1 and ALL SEVEN rounds are scored (R128 → F). The shared draw parser
  // is already validated against the real Grand Slam format (see usOpenDraw.test.ts). Before
  // launch: wire the real 128-entrant field + player_stats seed when the entry list publishes,
  // confirm the official order of play, then flip `live` to true.
  usopen_2026: {
    id: 'usopen_2026',
    name: 'US Open',
    edition: 'US Open 2026',
    year: 2026,
    surface: 'hard',
    location: 'New York, USA',
    drawSize: 128,
    rounds: ['R128', 'R64', 'R32', 'R16', 'QF', 'SF', 'F'], // all seven — Grand Slams have no byes
    mode: 'live',
    live: false, // staged — flip to true once the field is wired + schedule confirmed
    // Placeholder — the US Open main draw runs late Aug into Sep 2026. Replace with the official
    // order of play when it publishes. schedule[R128] doubles as the DRAFT DEADLINE.
    schedule: {
      R128: '2026-08-24T15:00:00Z', // first day of main-draw play — DRAFT CLOSES (CONFIRM DATE)
    },
    court: {
      standTop: '#0a1e33', standBottom: '#06121f',   // night-session dark seating
      apron: '#2a5db0',                              // US Open blue surround
      surface: '#3f7bd6',                            // lighter blue Laykold inside court
      line: '#ffffff',
      net: '#eef4f0', netShadow: '#0a1f44', crowdLight: '#dbeafe', crowdDark: '#8ea6c8',
    },
  },
};

// The event the app opens on for a manager who hasn't chosen one. Points at the CURRENT tournament,
// so a returning manager lands on the one they can still play rather than a finished draw.
const DEFAULT_TOURNAMENT_ID = 'cincinnati_2026';
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
