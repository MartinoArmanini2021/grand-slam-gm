import type { Player, Surface, TournamentResult, YearResult } from '../types';
import rawField from './wimbledon2026Field.json';

// ── Real Wimbledon 2026 men's singles field ──────────────────────────────────
// Every player, price, and result below is derived from the actual 2026 draw
// (see wimbledon2026Field.json — sourced from Wikipedia; ages/surface%/YTD are
// best-effort estimates where the live feed wasn't reachable). The game plays the
// REAL bracket, so the field must contain everyone who reached the last 32.

interface RawPlayer {
  id: string; name: string; country: string; flag: string; age: number;
  hand: 'R' | 'L'; ranking: number; seed: number | null;
  surface: { grass: number; hard: number; clay: number };
  ytd: { wins: number; losses: number; titles: number };
  wimbledon2026Exit: string;
  yearResults: { short: string; result: string }[];
}

const SLAM_META: Record<string, { short: string; surface: Surface; tournament: string }> = {
  W:  { short: 'WIM', surface: 'grass', tournament: 'Wimbledon' },
  RG: { short: 'RG',  surface: 'clay',  tournament: 'Roland Garros' },
  AO: { short: 'AO',  surface: 'hard',  tournament: 'Australian Open' },
};

// Price by ATP ranking. A steep curve so a $100M / 6-player squad forces real
// trade-offs: one marquee name eats a third of the budget, deep value picks are
// cheap (and a low-ranked deep run — like Fery — is where fortunes are made).
export function priceFor(ranking: number): number {
  return Math.max(4, Math.min(50, Math.round(52 * Math.pow(ranking, -0.42))));
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
  return {
    id: r.id, name: r.name, country: r.country, flag: r.flag,
    ranking: r.ranking, seed: r.seed, age: r.age, hand: r.hand,
    style: deriveStyle(r),
    price: priceFor(r.ranking),
    exit: r.wimbledon2026Exit as TournamentResult,
    surface: { hard: r.surface.hard, clay: r.surface.clay, grass: r.surface.grass },
    ytd: r.ytd,
    form: [],
    yearResults: toYearResults(r.yearResults),
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
