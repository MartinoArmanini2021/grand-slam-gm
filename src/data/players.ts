import type { Player, Surface, TournamentResult, YearResult } from '../types';
import montrealField from './montreal2026Field.json';
import cincinnatiField from './cincinnati2026Field.json';
import { poolPlayer } from './playerPool';
import { TOURNAMENT, ACTIVE_TOURNAMENT_ID } from './tournamentConfig';

// The draftable field for the ACTIVE tournament. Each tournament has its own entrant
// list; add a new field JSON here when a tournament's entry list publishes. Both fields
// are built from the real published draw (scripts/build-*-field.mjs) and reconciled
// against Wikipedia (scripts/reconcile-field.mjs) so every entrant is draftable and no
// withdrawn player lingers.
const FIELDS: Record<string, unknown> = {
  montreal_2026: montrealField,
  cincinnati_2026: cincinnatiField,
};
const rawField = FIELDS[ACTIVE_TOURNAMENT_ID] ?? montrealField;

// ── Real National Bank Open 2026 (Montréal) men's singles field ──────────────
// The 77 entrants of the actual Montréal field (see montreal2026Field.json —
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

// The 2026 tour calendar for every event that shows up in a player's season results:
// its canonical SURFACE, full NAME, and a chronological WEEK key (ascending = earlier
// in the season). This drives BOTH the surface dot AND the left→right ordering on the
// Player page, so the results strip reads as a true form timeline (January → now)
// instead of a Slams-first jumble — and the dots finally match reality (hard vs clay
// vs grass), which is the whole point of showing form heading into a hard-court event.
const TOUR_CALENDAR: Record<string, { surface: Surface; tournament: string; week: number }> = {
  BRI: { surface: 'hard',  tournament: 'Brisbane',         week: 1 },
  ADL: { surface: 'hard',  tournament: 'Adelaide',         week: 2 },
  AKL: { surface: 'hard',  tournament: 'Auckland',         week: 2 },
  AO:  { surface: 'hard',  tournament: 'Australian Open',  week: 4 },
  DUB: { surface: 'hard',  tournament: 'Dubai',            week: 9 },
  IW:  { surface: 'hard',  tournament: 'Indian Wells',     week: 11 },
  MIA: { surface: 'hard',  tournament: 'Miami',            week: 13 },
  MAD: { surface: 'clay',  tournament: 'Madrid',           week: 18 },
  ROM: { surface: 'clay',  tournament: 'Rome',             week: 20 },
  RG:  { surface: 'clay',  tournament: 'Roland Garros',    week: 22 },
  HER: { surface: 'grass', tournament: "'s-Hertogenbosch", week: 24 },
  QUE: { surface: 'grass', tournament: "Queen's Club",     week: 25 },
  EAS: { surface: 'grass', tournament: 'Eastbourne',       week: 26 },
  WIM: { surface: 'grass', tournament: 'Wimbledon',        week: 28 },
  BAD: { surface: 'clay',  tournament: 'Båstad',           week: 29 },
  HAM: { surface: 'clay',  tournament: 'Hamburg',          week: 30 },
  WDC: { surface: 'hard',  tournament: 'Washington',       week: 31 },
  MTL: { surface: 'hard',  tournament: 'Montréal',         week: 32 },
  BAS: { surface: 'hard',  tournament: 'Basel',            week: 43 },
  DC:  { surface: 'hard',  tournament: 'Davis Cup',        week: 46 },
};

// The National Bank Open sits in early August (~week 31). Season results shown on the
// Player page are the player's FORM HEADING IN, so anything later in the calendar than
// the active event (Basel in October, the Davis Cup finals in November) is dropped —
// it can't be "form" for a tournament that hasn't started. Summer events (Cincinnati)
// fall a couple of weeks later, so the cutoff is generous.
const SEASON_CUTOFF_WEEK = 34;

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

// Chronological form timeline: keep only events up to the active tournament, then sort
// earliest→latest by calendar week (unknown codes are kept and sorted last, never dropped).
function orderSeason(results: YearResult[]): YearResult[] {
  const weekOf = (short: string) => TOUR_CALENDAR[short]?.week ?? Number.POSITIVE_INFINITY;
  return results
    .filter(r => weekOf(r.short) <= SEASON_CUTOFF_WEEK || !TOUR_CALENDAR[r.short]) // drop known post-event results only
    .sort((a, b) => weekOf(a.short) - weekOf(b.short));
}

function toYearResults(rows: RawPlayer['yearResults']): YearResult[] {
  return orderSeason(rows.map(r => {
    const meta = TOUR_CALENDAR[r.short];
    return {
      short: r.short,
      surface: meta?.surface ?? 'hard',
      tournament: meta?.tournament ?? r.short,
      result: r.result as TournamentResult,
    };
  }));
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
    yearResults: base?.results2026?.length ? orderSeason(base.results2026 as YearResult[]) : toYearResults(r.yearResults),
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
