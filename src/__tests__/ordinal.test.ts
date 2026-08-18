import { describe, it, expect } from 'vitest';
import { ordinal } from '../data/format';

// The finished-tournament screen leads with "You finished 2nd of 6". Getting that string wrong is
// small but conspicuous — it is the largest text on the screen, and it is about the reader.
//
// The 11–13 exception is the classic failure: a naive last-digit rule renders "11st", "12nd",
// "13rd". Public leagues are meant to grow past ten managers, so those are real positions, not
// hypotheticals — and the person who came eleventh is exactly the one who would notice.
describe('ordinal', () => {
  it('handles the common cases', () => {
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(2)).toBe('2nd');
    expect(ordinal(3)).toBe('3rd');
    expect(ordinal(4)).toBe('4th');
    expect(ordinal(9)).toBe('9th');
  });

  it('handles the 11-13 exception', () => {
    expect(ordinal(11)).toBe('11th');
    expect(ordinal(12)).toBe('12th');
    expect(ordinal(13)).toBe('13th');
  });

  it('resumes normally at 21', () => {
    expect(ordinal(21)).toBe('21st');
    expect(ordinal(22)).toBe('22nd');
    expect(ordinal(23)).toBe('23rd');
    expect(ordinal(24)).toBe('24th');
  });

  it('handles 111-113, where the exception repeats', () => {
    expect(ordinal(111)).toBe('111th');
    expect(ordinal(112)).toBe('112th');
    expect(ordinal(113)).toBe('113th');
    expect(ordinal(101)).toBe('101st');
  });

  it('never produces a bare number or an empty suffix', () => {
    for (let n = 1; n <= 200; n++) {
      expect(ordinal(n)).toMatch(/^\d+(st|nd|rd|th)$/);
    }
  });
});
