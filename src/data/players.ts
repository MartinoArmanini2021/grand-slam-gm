import type { Player, Surface, TournamentResult, YearResult } from '../types';
import montrealField from './montreal2026Field.json';
import { poolPlayer } from './playerPool';
import { TOURNAMENT, ACTIVE_TOURNAMENT_ID } from './tournamentConfig';

// The draftable field for the ACTIVE tournament. Each tournament has its own entrant
// list; add a new field JSON here when a tournament's entry list publishes. Cincinnati
// borrows the Montréal field as a placeholder for staging until its own field is wired.
const FIELDS: Record<string, unknown> = {
  montreal_2026: montrealField,
  cincinnati_2026: montrealField, // TODO: swap in cincinnati2026Field.json when it's built
};
const rawField = FIELDS[ACTIVE_TOURNAMENT_ID] ?? montrealField;

// ── Real National Bank Open 2026 (Montréal) men's singles field ──────────────
// The 74 entrants of the actual Montréal field (see montreal2026Field.json —
// matched from the official nationalbankopen.com entry list to the 300-player
// stats pool; Sinner/Alcaraz/Djokovic all skipped the event, so Zverev leads).
// Current ATP rank + 2026 form/surface stats are overlaid from the pool below.

interface RawPlayer {
  id: string; name: string; country: string; flag: string; age: number;
  hand: 'R' | 'L'; ranking: number; seed: number | null;
  surface: { grass: number; hard: number; clay: number };
  ytd: { wins: number; losses: number; titles: number };
  yearResults: { short: string; result: string }[];
  // (the field JSON still carries a legacy "wimbledon2026Exit" key — unused; exits are
  //  now derived live from results, so it's ignored here.)
}

const SLAM_META: Record<string, { short: string; surface: Surface; tournament: string }> = {
  W:  { short: 'WIM', surface: 'grass', tournament: 'Wimbledon' },
  RG: { short: 'RG',  surface: 'clay',  tournament: 'Roland Garros' },
  AO: { short: 'AO',  surface: 'hard',  tournament: 'Australian Open' },
};

// ── Detailed pricing ─────────────────────────────────────────────────────────
// Price is built from three real, transparent inputs (see priceBreakdown):
//   1. RANK base   — a steep curve on current ATP rank (a marquee name eats a
//      third of the budget; deep value picks stay cheap).
//   2. FORM        — 2026 win% and titles nudge the price ±; a red-hot player
//      costs more than their rank alone implies, a cold one less.
//   3. SURFACE     — the player's win% on THIS tournament's surface (hard for
//      Montréal) tilts the price: a hard-court specialist is worth more here.
// Rank sets the tier, but FORM and SURFACE carry real weight (±~25% each) so the
// draft is a genuine decision in every tier — especially the 5 Silver picks, where a
// hot hard-court riser (Fonseca) is a clear premium over a cold clay-specialist filler,
// instead of everyone bunching around the same $10. All prices clamp to $4–50M.
export function priceFor(ranking: number): number {
  return Math.max(4, Math.min(50, Math.round(55 * Math.pow(Math.max(1, ranking), -0.46))));
}

export interface PriceBreakdown {
  price: number;      // final $M (clamped $4–50)
  base: number;       // rank-only base $M, shown clamped to the $50M ceiling
  formMult: number;   // form multiplier (e.g. 1.08 = +8%)
  surfMult: number;   // surface multiplier
  winRate: number | null;   // 2026 win% used (null = too few matches)
  surfaceWin: number | null; // active-surface win% used
  capped: boolean;    // true when the ceiling/floor clamped the final price
}

const PRICE_CEIL = 50, PRICE_FLOOR = 4;

// The pricing detail for a player, given current rank + 2026 form + surface win%.
export function priceBreakdown(
  ranking: number,
  ytd: { wins: number; losses: number; titles: number } | null | undefined,
  surfaceWin: number | null | undefined,
): PriceBreakdown {
  const rawBase = 55 * Math.pow(Math.max(1, ranking), -0.46); // guard: rank ≤ 0 → NaN otherwise
  const played = ytd ? ytd.wins + ytd.losses : 0;
  // Neutral (0.5) when the sample is thin, so scant data never distorts price.
  const winRate = played >= 8 ? ytd!.wins / played : null;
  // Form: up to ±~25% from win% around .500, plus a small premium per 2026 title —
  // strong enough that an in-form player is a visibly costlier pick than a cold one.
  const formMult = 1 + (winRate != null ? (winRate - 0.5) * 0.9 : 0) + Math.min(0.12, (ytd?.titles ?? 0) * 0.03);
  // Surface: up to ±25% from this surface's win% around 50 — a hard-court specialist
  // commands a real premium at a hard-court event; a clay grinder is a discount.
  const surfMult = 1 + (surfaceWin != null ? (surfaceWin / 100 - 0.5) * 0.5 : 0);
  const raw = Math.round(rawBase * formMult * surfMult);
  const price = Math.max(PRICE_FLOOR, Math.min(PRICE_CEIL, raw));
  return {
    price,
    base: Math.min(PRICE_CEIL, Math.round(rawBase)),
    formMult, surfMult,
    winRate: winRate != null ? Math.round(winRate * 100) : null,
    surfaceWin: surfaceWin ?? null,
    capped: raw > PRICE_CEIL || raw < PRICE_FLOOR,
  };
}

function deriveStyle(p: RawPlayer): string {
  const { grass, hard, clay } = p.surface;
  const best = Math.max(grass, hard, clay);
  const base = best === grass ? (grass >= 72 ? 'Grass-court threat' : 'Grass-court mover')
    : best === hard ? 'Hard-court baseliner'
    : 'Clay-court grinder';
  return (p.hand === 'L' ? 'Left-handed ' : '') + base;
}

function toYearResults(rows: RawPlayer['yearResults']): YearResult[] {
  return rows.map(r => {
    const meta = SLAM_META[r.short] ?? { short: r.short, surface: 'grass' as Surface, tournament: r.short };
    return { short: meta.short, surface: meta.surface, tournament: meta.tournament, result: r.result as TournamentResult };
  });
}

function toPlayer(r: RawPlayer): Player {
  // Overlay the master pool's CURRENT data (see scripts/build-2026-stats.mjs) onto the
  // playable roster: current ATP rank, real 2026 surface win%, 2026 W/L + titles, and
  // per-tournament results — falling back to the baked field value only where the pool
  // has no data. Country/flag/photo also come from the pool. Name stays from the field
  // so the bracket's name→id lookup holds.
  const base = poolPlayer(r.id);
  // RANK stays the at-event value — this replay's scoring, tiers, and the underdog
  // hook (a #178 wildcard's deep run) are built around it, and live scores depend on
  // it. Only the descriptive STATS are overlaid from the current pool.
  const ranking = r.ranking;
  const surface = {
    hard: base?.surface?.hard ?? r.surface.hard,
    clay: base?.surface?.clay ?? r.surface.clay,
    grass: base?.surface?.grass ?? r.surface.grass,
  };
  const ytd = base?.ytd ?? r.ytd;
  const activeSurfaceWin = surface[TOURNAMENT.surface];
  return {
    id: r.id, name: r.name,
    country: base?.country ?? r.country,
    flag: base?.flag ?? r.flag,
    ranking, seed: r.seed, age: base?.age ?? r.age, hand: base?.hand ?? r.hand,
    style: deriveStyle({ ...r, surface, hand: base?.hand ?? r.hand }),
    price: priceBreakdown(ranking, ytd, activeSurfaceWin).price,
    surface,
    ytd,
    form: [],
    yearResults: base?.results2026?.length ? (base.results2026 as YearResult[]) : toYearResults(r.yearResults),
    statsYear: base?.statsYear,
  };
}

export const PLAYERS: Player[] = (rawField as RawPlayer[]).map(toPlayer);

const BY_ID = new Map(PLAYERS.map(p => [p.id, p]));

// Returns undefined for an unknown id — callers that can receive untrusted ids
// (persisted state, bracket names) must handle it.
export const findPlayer = (id: string): Player | undefined => BY_ID.get(id);

// For ids that MUST exist by invariant (roster/bracket). Throws loudly on a bad
// id instead of silently returning undefined and crashing on a deref later.
export const getPlayer = (id: string): Player => {
  const p = BY_ID.get(id);
  if (!p) throw new Error(`Unknown player id: ${id}`);
  return p;
};
