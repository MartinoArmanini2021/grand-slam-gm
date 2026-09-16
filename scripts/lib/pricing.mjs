// ── Pricing + tiers, mirrored from the app ───────────────────────────────────────────────────────
// Kept byte-for-byte equivalent to src/data/tiers.ts (getTier) and src/data/players.ts
// (priceBreakdown). Node can't import those (players.ts pulls in tournamentConfig → import.meta.env),
// so this is a deliberate copy — pinned by src/__tests__/fieldTooling.test.ts, which fails if the
// app's prices and this file's ever disagree for the active field.

// getTier — src/data/tiers.ts
export const tierOf = (ranking) => (ranking <= 10 ? 'Platinum' : ranking <= 25 ? 'Gold' : 'Silver');

// priceBreakdown().price — src/data/players.ts. Rank base × 2026 form (win% + titles) × surface
// win% on THIS event's surface, clamped to $4–50M.
export function priceOf(ranking, ytd, surfaceWin) {
  const rawBase = 55 * Math.pow(Math.max(1, ranking), -0.46);
  const played = ytd ? ytd.wins + ytd.losses : 0;
  const winRate = played >= 8 ? ytd.wins / played : null;
  const formMult = 1 + (winRate != null ? (winRate - 0.5) * 0.9 : 0) + Math.min(0.12, (ytd?.titles ?? 0) * 0.03);
  const surfMult = 1 + (surfaceWin != null ? (surfaceWin / 100 - 0.5) * 0.5 : 0);
  return Math.max(4, Math.min(50, Math.round(rawBase * formMult * surfMult)));
}

// Fetch a Wikipedia draw page's wikitext via the CORS-open MediaWiki API — the exact source the
// live feed polls, so the tooling and the app can never read different draws.
export async function fetchDraw(page) {
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(page)}`
    + `&prop=wikitext&formatversion=2&format=json&origin=*`;
  const json = await (await fetch(url)).json();
  const wikitext = json?.parse?.wikitext;
  if (typeof wikitext !== 'string') {
    console.error(`could not load draw page "${page}": ${json?.error?.info ?? 'not found'}`);
    process.exit(2);
  }
  return wikitext;
}
