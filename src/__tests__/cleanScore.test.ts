import { describe, it, expect } from 'vitest';
import { cleanScore } from '../data/drawParser';

// A stray "}}" was leaking into the bracket as a set score — a nested Wikipedia template that the
// `{{..}}` pass couldn't fully match left a residual brace, and the final strip didn't remove {}.
describe('cleanScore — no stray braces reach the bracket', () => {
  it('leaves a plain game count untouched', () => {
    expect(cleanScore('6')).toBe('6');
    expect(cleanScore("'''6'''")).toBe('6'); // winner-bold ticks stripped
  });
  it("strips a tiebreak <sup> marker but keeps the games", () => {
    expect(cleanScore('7<sup>7</sup>')).toBe('7');
  });
  it('removes a whole {{template}} score cell', () => {
    expect(cleanScore('{{abbr|w/o|walkover}}')).toBe('');
  });
  it('removes a NESTED-template leftover so no "}}" survives (the actual bug)', () => {
    const out = cleanScore('{{nowrap|{{flagicon|ESP}}}}');
    expect(out).not.toMatch(/[{}]/);
    expect(out).toBe('');
  });
  it('a bare stray "}}" cleans to empty (so it is dropped, never shown)', () => {
    expect(cleanScore('}}')).toBe('');
  });
});
