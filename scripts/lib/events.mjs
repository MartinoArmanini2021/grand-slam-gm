// ── The per-event data the build tooling needs ───────────────────────────────────────────────────
// Node can't import src/data/tournamentConfig.ts (it reads import.meta.env, which only Vite defines),
// so the handful of facts the scripts need live here. Keep the ids and Wikipedia pages identical to
// tournamentConfig.ts — a parity test (fieldTooling.test.ts) fails if they drift.
//
// Adding a tournament = one entry here. Then:
//   node scripts/build-field.mjs <id>     → writes its field JSON from the published draw
//   node scripts/reconcile-field.mjs …    → proves that field matches the draw exactly
//   node scripts/gen-seed.mjs <id>        → writes its player_stats seed (ranking+price+tier)

export const EVENTS = {
  cincinnati_2026: {
    page: "2026 Cincinnati Open – Men's singles",
    field: 'src/data/cincinnati2026Field.json',
    seed: 'supabase/seed_cincinnati_player_stats.sql',
    label: 'Cincinnati Open 2026',
    surface: 'hard',       // which surface win% feeds the price model
    // Real main-draw entrants who are NOT in the top-300 stats pool (wildcards/qualifiers). Bio is
    // real; 2026 form is left neutral (ytd 0/0/0, surface 50) because we have no verified match data
    // for them — their rank (>300) floors the price and puts them in the bottom tier anyway, so a big
    // upset win still earns a big multiplier. Names MUST match the Wikipedia link target exactly.
    // Each is included ONLY if actually present in the draw, so a withdrawal drops them automatically.
    manual: [
      { id: 'monfils',    name: 'Gaël Monfils',       country: 'France',        flag: '🇫🇷', age: 39, hand: 'R', ranking: 327 },
      { id: 'kokkinakis', name: 'Thanasi Kokkinakis', country: 'Australia',     flag: '🇦🇺', age: 30, hand: 'R', ranking: 443 },
      { id: 'wolf',       name: 'J.J. Wolf',          country: 'United States', flag: '🇺🇸', age: 27, hand: 'R', ranking: 688 },
    ],
  },

  // Staged for the main target. A Grand Slam has NO byes, so it scores from its first round and the
  // unscored-opening-round machinery switches itself off (OPENING_ROUND resolves to undefined).
  // Fill `manual` only if the published draw turns up entrants outside the top-300 pool.
  usopen_2026: {
    page: "2026 US Open – Men's singles",
    field: 'src/data/usopen2026Field.json',
    seed: 'supabase/seed_usopen_player_stats.sql',
    label: 'US Open 2026',
    surface: 'hard',
    // Real main-draw entrants outside the top-300 stats pool. Rankings are the ones the
    // tournament itself published on the draw page where it gave one (Misolic entered on a
    // protected ranking of 101; Kokkinakis's PR is 84 but his actual rank is far lower, so we
    // keep the real one for consistency with Cincinnati). The three WILDCARDS below are given
    // NOMINAL ranks: Wikipedia lists no number for them, and rather than invent precision we
    // use a value comfortably outside the top 300, which is what floors their price and puts
    // them in the bottom tier. It is not a claim about their real ATP position — and it does
    // feed the upset multiplier, so if one of them goes on a run, revisit it BEFORE the first
    // ball, never after ([[lesson-stale-rankings]]).
    manual: [
      // The draw page lists Misolic under PROTECTED RANKING at 101 — but a protected ranking is
      // exactly what a player uses when his ACTUAL rank has fallen too far to enter directly, and
      // he is absent from the top-300 pool for that reason. Using 101 priced him at $7M and, worse,
      // would have shrunk his upset multiplier as though he were a top-100 player. Nominal, like
      // the wildcards below.
      { id: 'misolic',    name: 'Filip Misolic',      country: 'Austria',       flag: '🇦🇹', age: 25,   hand: 'R', ranking: 350 },
      { id: 'monfils',    name: 'Gaël Monfils',       country: 'France',        flag: '🇫🇷', age: 39,   hand: 'R', ranking: 327 },
      { id: 'kokkinakis', name: 'Thanasi Kokkinakis', country: 'Australia',     flag: '🇦🇺', age: 30,   hand: 'R', ranking: 443 },
      // This page writes him "J. J. Wolf" with spaces; Cincinnati's writes "J.J. Wolf".
      // The name must match the wikilink target of THIS event's page, not the player's
      // canonical spelling — which is why the two entries differ.
      { id: 'wolf',       name: 'J. J. Wolf',         country: 'United States', flag: '🇺🇸', age: 27,   hand: 'R', ranking: 688 },
      { id: 'gorzny',     name: 'Sebastian Gorzny',   country: 'United States', flag: '🇺🇸', age: null, hand: 'R', ranking: 500 },
      { id: 'kennedy',    name: 'Jack Kennedy',       country: 'United States', flag: '🇺🇸', age: null, hand: 'R', ranking: 500 },
    ],
  },
};

export function getEvent(id) {
  const ev = EVENTS[id];
  if (!ev) {
    console.error(`unknown event "${id}". Known: ${Object.keys(EVENTS).join(', ')}`);
    process.exit(2);
  }
  return ev;
}

// A MANUAL entry only needs identity + rank; the rest is neutral filler in the field's shape.
export const expandManual = (m) => ({
  ...m, seed: null,
  surface: { hard: 50, clay: 50, grass: 50 },
  ytd: { wins: 0, losses: 0, titles: 0 },
  yearResults: [],
});
