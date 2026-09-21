// The "frozen tournament" guard in both edge functions (2026-09-22): once public.tournament_status has a
// row for a tournament, recompute-score and ingest-draw must answer skipped:'completed' BEFORE they read
// or write anything for it, and a failed status read must throw rather than be treated as "not frozen".
// Pinned as text, like serverScoring.test.ts pins the points curves: a refactor that moves the guard
// below the first read, or softens the throw, fails here.
import { describe, expect, it } from 'vitest';
import recomputeSrc from '../../supabase/functions/recompute-score/index.ts?raw';
import ingestSrc from '../../supabase/functions/ingest-draw/index.ts?raw';

const guard = ".from('tournament_status')";

describe('frozen-tournament guard (edge functions)', () => {
  it('recompute-score checks tournament_status before it reads matches, and skips without writing', () => {
    const at = recomputeSrc.indexOf(guard);
    expect(at, 'guard present').toBeGreaterThan(-1);
    expect(at, 'guard before the matches read').toBeLessThan(recomputeSrc.indexOf(".from('matches')"));
    expect(at, 'guard after the tournament id is resolved').toBeGreaterThan(recomputeSrc.indexOf('is unset or unreadable'));
    expect(recomputeSrc).toMatch(/if \(fErr\) throw fErr;/);
    expect(recomputeSrc).toMatch(/skipped: 'completed'/);
    // the skip must return before the heartbeat upsert
    expect(at).toBeLessThan(recomputeSrc.indexOf(".from('scoring_health')"));
  });

  it('ingest-draw checks tournament_status before the Wikipedia fetch, and skips without writing', () => {
    const at = ingestSrc.indexOf(guard);
    expect(at, 'guard present').toBeGreaterThan(-1);
    expect(at, 'guard before the wiki fetch').toBeLessThan(ingestSrc.indexOf('const wikiUrl'));
    expect(at, 'guard after the registry lookup').toBeGreaterThan(ingestSrc.indexOf('tournamentId = requestedId;'));
    expect(ingestSrc).toMatch(/if \(fErr\) throw fErr;/);
    expect(ingestSrc).toMatch(/skipped: 'completed'/);
    expect(at).toBeLessThan(ingestSrc.indexOf(".from('ingest_health')"));
  });
});
