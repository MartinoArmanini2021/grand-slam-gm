import { describe, it, expect } from 'vitest';
import { TOURNAMENTS } from '../data/tournamentConfig';

// ── The ingest/scoring functions must never GUESS which tournament they are working on ───────────
// Both used to fall back to a hardcoded 'montreal_2026'. Once that event finished, any call that
// omitted an id quietly re-scraped a dead tournament — or, for the scorer, rewrote a FINISHED
// tournament's standings — and reported success either way. Silence is the dangerous part: the job
// looks healthy while doing the wrong thing. These are text assertions against the Deno sources,
// which cannot be imported here (they pull esm.sh at runtime).

const raw = (f: string): Promise<string> =>
  import(`../../supabase/functions/${f}/index.ts?raw`).then(m => m.default as string);

// Assertions about ABSENCE must ignore comments: both files deliberately DESCRIBE the old hardcoded
// fallbacks in their comments, so a naive match would find the very strings the tests forbid.
const codeOnly = (src: string): string =>
  src.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');

describe('ingest-draw — config-driven, never guessing', () => {
  it('carries a registry rather than one baked-in tournament', async () => {
    expect(await raw('ingest-draw')).toMatch(/const TOURNAMENTS: Record<string/);
  });

  it('has NO hardcoded default tournament id', async () => {
    expect(codeOnly(await raw('ingest-draw'))).not.toMatch(/DEFAULT_TOURNAMENT_ID/);
    expect(await raw('ingest-draw')).toMatch(/requires an explicit tournamentId/);
  });

  it('refuses an unknown id loudly instead of ingesting the wrong draw', async () => {
    expect(await raw('ingest-draw')).toMatch(/has no field\/page for/);
  });

  it('every registry entry names a tournament the app knows, with matching rounds', async () => {
    const s = await raw('ingest-draw');
    const ids = [...s.matchAll(/^ {2}([a-z0-9_]+): \{$/gm)].map(m => m[1]);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const t = TOURNAMENTS[id];
      expect(t, `ingest carries "${id}" but the app has no such tournament`).toBeDefined();
      // The rounds the ingest writes must be exactly the rounds the app scores. A Slam scores its
      // first round (R128); a Masters byes past it. Getting this wrong silently drops a whole round.
      const block = s.slice(s.indexOf(`  ${id}: {`));
      const rounds = block.slice(0, block.indexOf('},')).match(/rounds: \[([^\]]+)\]/)?.[1]
        ?.split(',').map(r => r.trim().replace(/'/g, '')) ?? [];
      expect(rounds, `rounds for ${id}`).toEqual([...t.rounds]);
    }
  });
});

describe('recompute-score — resolves from app_config or stops', () => {
  it('has no hardcoded tournament fallback', async () => {
    expect(codeOnly(await raw('recompute-score'))).not.toMatch(/montreal_2026/);
  });

  it('throws rather than scoring an unresolved tournament', async () => {
    expect(await raw('recompute-score')).toMatch(/could not resolve a tournament/);
  });
});
