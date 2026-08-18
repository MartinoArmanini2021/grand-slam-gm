import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ── Accessibility guarantees that a comment cannot provide ───────────────────────────────────────
//
// Both defects below shipped WITH comments asserting they were fine. That is the pattern worth
// defending against: a claim in a comment stops the next person checking, so the claim has to be
// executable.
//
// Read from disk rather than `import css from '../index.css?raw'` — Vite processes CSS even for a
// ?raw import, so the string the test received was not the source file and the assertions were
// quietly measuring nothing.
const css = readFileSync(fileURLToPath(new URL('../index.css', import.meta.url)), 'utf8');

const luminance = (hex: string): number => {
  const parts = hex.replace('#', '').match(/../g)!;
  const c = parts.map(h => parseInt(h, 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const token = (name: string): string =>
  css.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`))?.[1] ?? '';

describe('colour contrast (WCAG 2.2 AA)', () => {
  // --ink-3 is the caption/hint colour: deadlines, helper text, the line under the save button —
  // exactly the text that explains what is going on. It shipped as #6B7C96, commented as
  // "~4.5:1 (WCAG AA)", measuring 4.24:1 on white and 3.75:1 on the app's own --bg. It failed AA
  // on both, and the comment is why nobody re-measured.
  it('--ink-3 passes 4.5:1 on BOTH white and the app background', () => {
    const ink3 = token('ink-3');
    const bg = token('bg');
    expect(ink3, '--ink-3 token').toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(bg, '--bg token').toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(contrast(ink3, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ink3, bg)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('prefers-reduced-motion', () => {
  // Collapsing animation-duration without collapsing animation-iteration-count turns an `infinite`
  // animation into a strobe — 100,000 cycles a second — for the users who explicitly asked for LESS
  // motion. The app has an infinite animation (.pulse-dot, on the save indicator), so this was not
  // theoretical: reducing motion accelerated it.
  it('also collapses the iteration count, not just the duration', () => {
    // Comments stripped first: the block now carries a comment explaining why the iteration count
    // matters, and a test that accepted prose as proof of a declaration would pass on the comment.
    const code = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const start = code.indexOf('@media (prefers-reduced-motion: reduce)');
    expect(start, 'reduced-motion media query').toBeGreaterThan(-1);
    const block = code.slice(start, code.indexOf('}', code.indexOf('animation-duration', start)));
    expect(block).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
    expect(block).toMatch(/animation-iteration-count:\s*1\s*!important/);
  });

  it('every infinite animation is covered by that guard', () => {
    const infinites = [...css.matchAll(/animation:[^;]*\binfinite\b/g)].map(m => m[0]);
    // Non-vacuous: the app really does have at least one, which is why the guard is needed.
    expect(infinites.length).toBeGreaterThan(0);
    const code = css.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code.slice(code.indexOf('@media (prefers-reduced-motion: reduce)')))
      .toMatch(/animation-iteration-count:\s*1\s*!important/);
  });
});
