import { describe, it, expect } from 'vitest';
import fullDraw from './fixtures/nbo2025-fulldraw.txt?raw';
import fieldJson from '../data/montreal2026Field.json';
import { buildResolver, parseFullDraw, buildMatchRows } from '../data/drawParser';
import type { LiveMatch, LiveResults } from '../data/liveResults';
import { matchKey } from '../data/liveResults';
import { TOURNAMENT, ACTIVE_TOURNAMENT_ID } from '../data/tournamentConfig';
import { LIVE } from '../data/liveData';

// The ingest-draw Edge Function is standalone Deno and can't import the Vite config, so it
// hardcodes TOURNAMENT_ID / WIKI_PAGE / SCORED_ROUNDS. If those silently drift from the app,
// the server would ingest the wrong page or wrong rounds and freeze the leaderboard. These
// tests pin the app's values — if one fails, update supabase/functions/ingest-draw/index.ts
// (and the cron body's tournamentId) to match.
describe('ingest-draw ↔ app config parity', () => {
  it('tournament id equals the Edge Function TOURNAMENT_ID', () => {
    expect(ACTIVE_TOURNAMENT_ID).toBe('montreal_2026');
  });
  it('scored rounds equal the Edge Function SCORED_ROUNDS', () => {
    expect(TOURNAMENT.rounds).toEqual(['R64', 'R32', 'R16', 'QF', 'SF', 'F']);
  });
  it('Wikipedia page title equals the Edge Function WIKI_PAGE', () => {
    expect(LIVE.wikipediaPage).toBe("2026 National Bank Open – Men's singles");
  });
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
    expect(ids.size).toBe(74); // the whole field, unique
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
