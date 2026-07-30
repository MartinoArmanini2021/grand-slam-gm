import poolRaw from './atp300.json';

// ── Master player pool (ATP top 300, 2026-07-20) ─────────────────────────────
// The single source of current base info — name, rank, country, and official photo
// — for every ranked player, generated from the ATP snapshot (see scripts/gen-atp300.mjs).
// Each tournament's playable field is a subset of this pool; players.ts overlays the
// pool's current rank/country/photo onto the active tournament's roster.
//
// ids are reconciled with the existing roster so the bracket, saved squads, and
// avatars keep working (scripts/gen-atp300.mjs reuses a roster id on a name match).

export interface PoolPlayer {
  id: string;
  atpId: string;
  name: string;
  rank: number;
  ctry: string;      // 3-letter code
  country: string;   // display name
  flag: string;      // emoji
  photoUrl: string;  // official ATP headshot
  // ── real last-12-month stats (added by scripts/refresh-stats.mjs) ──────────
  // Optional/nullable: present only after a stats refresh; null when Sackmann has
  // no data for that player in the window. Never fabricated — see the script.
  age?: number | null;
  hand?: 'R' | 'L';
  price?: number;                                          // millions, priceFor(rank)
  surface?: { hard: number | null; clay: number | null; grass: number | null } | null;
  ytd?: { wins: number; losses: number; titles: number } | null;
  statsYear?: number;                                      // which season `ytd`/`surface` describe (2026 = current)
  // Per-tournament 2026 results (round reached at each M500/M1000/Slam), newest/biggest
  // first — shape matches YearResult so it drops straight into the player page.
  results2026?: { tournament: string; surface: string; short: string; result: string }[];
}

export const PLAYER_POOL = poolRaw as PoolPlayer[];

const BY_ID = new Map(PLAYER_POOL.map(p => [p.id, p]));

export const poolPlayer = (id: string): PoolPlayer | undefined => BY_ID.get(id);

// The player's official headshot URL, or null if they aren't in the pool.
export const photoUrlFor = (id: string): string | null => BY_ID.get(id)?.photoUrl ?? null;
