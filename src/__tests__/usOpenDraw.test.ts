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
  const { draw, results } = parseFullDraw(usoDraw, { scoredRounds: SLAM_ROUNDS, resolve });
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
});
