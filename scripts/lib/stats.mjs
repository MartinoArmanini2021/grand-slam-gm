// ── Season statistics shared by the two pool builders ────────────────────────────────────────────
// build-2026-stats.mjs (Wikipedia draws) and refresh-stats.mjs (the TML match database) used to each
// carry their own surfacePct — and they had drifted: one refused to price a thin season, the other
// quietly turned four matches into hard percentages. One rule now, in one place. Rule 3 of the
// changeover runbook applies throughout: unknown is null, never 0 and never 50.

/** Below this many matches a surface record says more about scheduling than about the player. */
export const MIN_SURFACE = 4;

/** Win percentage, or null when nothing was played — never 0 for "unknown". */
export const pct = (w, l) => (w + l ? Math.round((100 * w) / (w + l)) : null);

/**
 * Per-surface win%: the player's own record on that surface when it has at least `min` matches;
 * otherwise the season overall stands in — unless the whole season is thinner than `min`, in
 * which case the honest answer is null (UNKNOWN, not 50%). `min` is deliberately low: it keeps a
 * real clay specialist's clay number while refusing to price anyone off a single result.
 */
export function surfacePct(st, min = MIN_SURFACE) {
  const overall = pct(st.w, st.l);
  const thinSeason = st.w + st.l < min;
  const one = (k) => {
    const { w, l } = st.surf[k];
    if (w + l >= min) return pct(w, l);   // his own record on this surface
    if (thinSeason) return null;          // too few matches to say anything
    return overall;                       // his season stands in for the surface
  };
  return { hard: one('hard'), clay: one('clay'), grass: one('grass') };
}

/**
 * The evidence behind each percentage: the wins-losses actually played on that surface, and whether
 * the figure is that surface's own record (`real`) or the overall season standing in for it.
 * Without this the pool cannot tell "76% on hard, 13-4" from "76% season, two hard matches".
 */
export function surfaceRecord(st, min = MIN_SURFACE) {
  const out = {};
  for (const k of ['hard', 'clay', 'grass']) {
    const { w, l } = st.surf[k];
    out[k] = { w, l, real: w + l >= min };
  }
  return out;
}
