// Types for pricing.mjs — see events.d.ts for why the tooling is plain .mjs. These let
// fieldTooling.test.ts (which pins tooling↔app price/tier parity) typecheck under `tsc -b`.
// Signatures mirror src/data/tiers.ts (getTier) and src/data/players.ts (priceBreakdown).

export declare const tierOf: (ranking: number) => 'Platinum' | 'Gold' | 'Silver';

export declare function priceOf(
  ranking: number,
  ytd: { wins: number; losses: number; titles: number } | null | undefined,
  surfaceWin: number | null | undefined,
): number;

export declare function fetchDraw(page: string): Promise<string>;

export declare const norm: (s: string) => string;
