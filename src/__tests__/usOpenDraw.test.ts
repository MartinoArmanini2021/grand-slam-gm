import { describe, it, expect } from 'vitest';
import usoDraw from './fixtures/uso2025-fulldraw.txt?raw';
import { buildResolver, parseFullDraw } from '../data/drawParser';
import fieldJson from '../data/montreal2026Field.json';
import type { RoundId } from '../types';

// Forward-looking guard for running the app at the US Open. Validates the shared draw parser
// against a REAL 128-player Grand Slam draw (2025 US Open men's singles), scoring all SEVEN
// rounds. Unlike a Masters draw (32 first-round byes → sparse, hard-to-parse opening round),
// a Grand Slam has NO byes: all 128 players play round 1, so R128 is fully populated and MUST
// parse cleanly. Structure: 8 sixteen-player sections + a finals bracket = 127 matches.
describe('draw parser — full 128 Grand Slam (2025 US Open)', () => {
  const SLAM_ROUNDS = ['R128', 'R64', 'R32', 'R16', 'QF', 'SF', 'F'] as RoundId[];
  const resolve = buildResolver(fieldJson as { id: string; name: string }[]);
  const { draw, results, meta } = parseFullDraw(usoDraw, { scoredRounds: SLAM_ROUNDS, resolve });
  const count = (r: string) => draw.filter(m => m.round === r).length;

  it('reconstructs all seven rounds with the exact Grand Slam match counts', () => {
    expect(count('R128')).toBe(64);
    expect(count('R64')).toBe(32);
    expect(count('R32')).toBe(16);
    expect(count('R16')).toBe(8);
    expect(count('QF')).toBe(4);
    expect(count('SF')).toBe(2);
    expect(count('F')).toBe(1);
    expect(draw.length).toBe(127);
  });

  it('captures a winner for EVERY match — including the fully-played opening round', () => {
    expect(Object.keys(results).length).toBe(127);
    const everyMatchDecided = SLAM_ROUNDS.every(r =>
      draw.filter(m => m.round === r).every(m => !!results[`${r}_${m.slot}`]));
    expect(everyMatchDecided).toBe(true);
  });

  it('captures the real (accented) name + flag code for off-roster opponents', () => {
    // Alcaraz didn't play Montréal, so he's off the draftable roster → a synthetic "x_" id.
    // The meta must carry his proper name + IOC flag code so the bracket shows "🇪🇸 Carlos
    // Alcaraz", not the placeholder id.
    expect(meta['x_carlos_alcaraz']).toEqual({ name: 'Carlos Alcaraz', country: 'ESP' });
    // Every off-roster id in the draw has a meta entry (real name captured, not left as an id).
    const offRoster = new Set(draw.flatMap(m => [m.p1Id, m.p2Id]).filter(id => id.startsWith('x_')));
    for (const id of offRoster) expect(meta[id]?.name).toBeTruthy();
    // Roster players (real ids) are NOT in meta — they carry their own name/flag.
    expect(Object.keys(meta).every(id => id.startsWith('x_'))).toBe(true);
  });
});
