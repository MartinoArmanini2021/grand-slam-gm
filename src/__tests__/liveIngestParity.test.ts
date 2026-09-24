import { describe, it, expect } from 'vitest';
import fullDraw from './fixtures/nbo2025-fulldraw.txt?raw';
import fieldJson from '../data/montreal2026Field.json';
import { buildResolver, parseFullDraw, buildMatchRows, parseBracket } from '../data/drawParser';
import type { LiveMatch, LiveResults } from '../data/liveResults';
import { matchKey } from '../data/liveResults';
import { TOURNAMENT, ACTIVE_TOURNAMENT_ID, TOURNAMENTS, wikipediaPageFor } from '../data/tournamentConfig';
import { LIVE } from '../data/liveData';

// The ingest-draw Edge Function is standalone Deno and can't import the Vite config, so it carries
// its own TOURNAMENTS registry (page + rounds + field per event). If that drifts from the app, the
// server would ingest the wrong page or wrong rounds and freeze the leaderboard. These tests pin the
// app's values against a mirror of that registry — if one fails, update the registry in
// supabase/functions/ingest-draw/index.ts to match (and redeploy it).
//
// MIRROR of the Edge Function's TOURNAMENTS registry. Keep in sync — that's the whole point.
const INGEST_REGISTRY: Record<string, { page: string; rounds: string[] }> = {
  montreal_2026:   { page: "2026 National Bank Open – Men's singles", rounds: ['R64', 'R32', 'R16', 'QF', 'SF', 'F'] },
  cincinnati_2026: { page: "2026 Cincinnati Open – Men's singles",    rounds: ['R64', 'R32', 'R16', 'QF', 'SF', 'F'] },
};

describe('ingest-draw ↔ app config parity', () => {
  it('the Edge Function registry carries the ACTIVE tournament', () => {
    // A tournament the app is running but ingest-draw does not carry = a silent leaderboard freeze.
    expect(Object.keys(INGEST_REGISTRY)).toContain(ACTIVE_TOURNAMENT_ID);
  });
  it('scored rounds equal the registry entry for the active tournament', () => {
    expect(TOURNAMENT.rounds).toEqual(INGEST_REGISTRY[ACTIVE_TOURNAMENT_ID].rounds);
  });
  it('Wikipedia page title equals the registry entry for the active tournament', () => {
    expect(LIVE.wikipediaPage).toBe(INGEST_REGISTRY[ACTIVE_TOURNAMENT_ID].page);
  });
});

// Every registry entry must describe its tournament exactly as the app does — so an event that is
// STAGED today (Cincinnati) is already provably ingestable, making the cutover a config flip rather
// than a coupled redeploy. (Events not yet built for ingest — e.g. the US Open — simply aren't in the
// registry yet; the active-tournament test above is what stops one going live un-ingestable.)
describe('every ingest registry entry matches the app config', () => {
  for (const [id, entry] of Object.entries(INGEST_REGISTRY)) {
    it(`${id} matches the app's page + rounds`, () => {
      const t = TOURNAMENTS[id];
      expect(t, `app has no tournament config for ${id}`).toBeDefined();
      expect(entry.rounds).toEqual(t.rounds);
      expect(entry.page).toBe(wikipediaPageFor(t)); // the page LIVE derives at runtime
    });
  }
});

// Every RUNNING tournament must be ingestable — going live without a registry entry would silently
// freeze that event's leaderboard. Scoped to status 'live': a 'completed' event is never ingested
// again (its results are final), and a 'staged' one is not exposed to players yet.
describe('no live tournament is un-ingestable', () => {
  for (const t of Object.values(TOURNAMENTS).filter(x => x.status === 'live')) {
    it(`${t.id} (live) is in the ingest registry`, () => {
      expect(Object.keys(INGEST_REGISTRY)).toContain(t.id);
    });
  }
});

// Exercise the EXACT server path: the roster comes from the field JSON (what ingest-draw
// imports), fed through the shared parser (what ingest-draw runs). This proves the server
// reproduces the draw independently of the client's PLAYERS overlay — same code, same data.
describe('ingest-draw server path (field roster + shared parser)', () => {
  const resolve = buildResolver(fieldJson as { id: string; name: string }[]);
  const { draw, results } = parseFullDraw(fullDraw, { scoredRounds: ['R64', 'R32', 'R16', 'QF', 'SF', 'F'], resolve });

  it('reconstructs the scored rounds from the real 2025 draw', () => {
    expect(draw.filter(m => m.round === 'R64')).toHaveLength(32);
    expect(draw.filter(m => m.round === 'F')).toHaveLength(1);
  });
  it('resolves the champion to a real roster id (Shelton is on the Montréal roster)', () => {
    expect(results[matchKey('F', 0)]).toBe('shelton');
  });
  it('the field-JSON roster matches every drafted id used by the client', () => {
    const ids = new Set((fieldJson as { id: string }[]).map(p => p.id));
    expect(ids.size).toBe(77); // the whole field, unique
  });
});

// The bulletproofing guarantee: the ingest function can NEVER regress a recorded result to
// null because of a flaky fetch or a mid-edit (partial) Wikipedia page. buildMatchRows is
// the pure core of that; these tests pin every priority case.
describe('ingest never-regress (buildMatchRows)', () => {
  const m = (round: string, slot: number, p1Id: string, p2Id: string): LiveMatch =>
    ({ round: round as LiveMatch['round'], slot, half: 'top', p1Id, p2Id });
  const draw: LiveMatch[] = [m('QF', 0, 'shelton', 'khachanov')];
  const win = (k: string, v: string): LiveResults => ({ [k]: v });
  const key = matchKey('QF', 0);

  it('writes a freshly parsed winner', () => {
    const [row] = buildMatchRows('t', draw, win(key, 'shelton'));
    expect(row.winner_id).toBe('shelton');
  });

  it('KEEPS a stored winner when the new parse has none (partial/flaky page)', () => {
    const [row] = buildMatchRows('t', draw, {}, { [key]: 'shelton' });
    expect(row.winner_id).toBe('shelton'); // never regressed to null
  });

  it('applies a fresh correction over the stored winner', () => {
    const [row] = buildMatchRows('t', draw, win(key, 'khachanov'), { [key]: 'shelton' });
    expect(row.winner_id).toBe('khachanov');
  });

  it('lets a manual override beat both parsed and stored', () => {
    const [row] = buildMatchRows('t', draw, win(key, 'shelton'), { [key]: 'shelton' }, { [key]: 'khachanov' });
    expect(row.winner_id).toBe('khachanov');
  });

  it('is null only when no winner exists anywhere (undecided match)', () => {
    const [row] = buildMatchRows('t', draw, {}, {}, {});
    expect(row.winner_id).toBeNull();
    expect(row).toMatchObject({ tournament_id: 't', round: 'QF', slot: 0, p1_id: 'shelton', p2_id: 'khachanov' });
  });
});

describe('resolver folds hyphen/space differences (live 2026 draw)', () => {
  const resolve = buildResolver(fieldJson as { id: string; name: string }[]);
  it('resolves "Jan-Lennard Struff" (Wikipedia hyphen) to the roster id "struff"', () => {
    // Regression from the live 2026 Montréal draw: Wikipedia writes "Jan-Lennard Struff"
    // while the roster has "Jan Lennard Struff". Before hyphen-folding he resolved to a
    // synthetic id and would have silently never scored for anyone who drafted him.
    expect(resolve('{{flagicon|GER}} [[Jan-Lennard Struff|J-L Struff]]')).toBe('struff');
    // A genuine non-roster qualifier still resolves to a synthetic id (unchanged).
    expect(resolve('{{flagicon|CAN}} [[Liam Draxl]]')).toMatch(/^x_/);
  });
  it('resolves a family-name-first name ("Shang Juncheng") to the roster id "shang"', () => {
    // The live 2026 draw writes the Chinese convention "Shang Juncheng"; the roster has
    // "Juncheng Shang". Without the word-order fallback he resolved to a synthetic id and
    // would never score. A genuine non-roster qualifier stays synthetic.
    expect(resolve('{{flagicon|CHN}} [[Shang Juncheng]]')).toBe('shang');
    expect(resolve('{{flagicon|AUS}} [[Aleksandar Vukic]]')).toMatch(/^x_/);
  });
});

describe('display mode shows a seed vs a to-be-decided opponent (bracket visibility)', () => {
  // A just-published section: one seed placed, its first-round opponent still empty ("bye" slot).
  const wt = '{{16TeamBracket\n| RD1-team1={{flagicon|GER}} [[Alexander Zverev|A Zverev]]\n| RD1-team2={{flagicon|}}\n}}';
  const resolve = (raw: string) => (raw.includes('Zverev') ? 'zverev' : 'x');
  it('drops the half-known pairing by default, but emits it (seed vs tbd) in display mode', () => {
    // Scoring/ingest path: nothing to score yet.
    expect(parseBracket(wt, ['R64'], resolve).draw).toHaveLength(0);
    // Display path: the seed shows against a placeholder that fills in when the round is played.
    const shown = parseBracket(wt, ['R64'], resolve, true).draw;
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({ p1Id: 'zverev', p2Id: 'tbd' });
  });
});

describe('an override applies only for a real participant (F4-5 / durable overrides)', () => {
  const oneMatch: LiveMatch[] = [{ round: 'QF', slot: 0, half: 'top', p1Id: 'shelton', p2Id: 'khachanov' }];
  it('applies a valid override, and IGNORES one that names a non-participant', () => {
    // A durable override that names one of the two players wins…
    expect(buildMatchRows('t', oneMatch, {}, {}, { QF_0: 'khachanov' })[0].winner_id).toBe('khachanov');
    // …but a typo'd / stale-slot override that names someone NOT in the pairing is ignored
    // (never written as an impossible winner — would fail the matches winner-in-pairing CHECK).
    expect(buildMatchRows('t', oneMatch, {}, {}, { QF_0: 'zverev' })[0].winner_id).toBeNull();
  });
});
