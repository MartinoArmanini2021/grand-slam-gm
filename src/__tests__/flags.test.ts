import { describe, it, expect } from 'vitest';
import { flagEmoji } from '../data/flags';

// The bracket shows off-roster opponents with a flag derived from the draw's {{flagicon|XYZ}}
// code. Those are IOC 3-letter codes (ESP, GER, SUI…), which differ from ISO alpha-2 — so the
// mapping has to be explicit. Guard the common tennis nations + the graceful-unknown path.
describe('flagEmoji — IOC/flag code → emoji', () => {
  it('maps IOC 3-letter codes that differ from ISO alpha-2', () => {
    expect(flagEmoji('ESP')).toBe('🇪🇸'); // Spain (ISO ES)
    expect(flagEmoji('GER')).toBe('🇩🇪'); // Germany (ISO DE)
    expect(flagEmoji('SUI')).toBe('🇨🇭'); // Switzerland (ISO CH)
    expect(flagEmoji('NED')).toBe('🇳🇱'); // Netherlands (ISO NL)
    expect(flagEmoji('USA')).toBe('🇺🇸');
    expect(flagEmoji('TPE')).toBe('🇹🇼'); // Chinese Taipei
  });

  it('accepts an already-alpha-2 code and is case/space tolerant', () => {
    expect(flagEmoji('US')).toBe('🇺🇸');
    expect(flagEmoji(' fra ')).toBe('🇫🇷');
  });

  it('returns undefined for unknown or empty codes (renders flagless, never tofu)', () => {
    expect(flagEmoji(undefined)).toBeUndefined();
    expect(flagEmoji('')).toBeUndefined();
    expect(flagEmoji('ZZZ')).toBeUndefined();
  });
});
