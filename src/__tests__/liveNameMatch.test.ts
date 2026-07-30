import { describe, it, expect } from 'vitest';
import { teamId } from '../data/liveData';
import { PLAYERS } from '../data/players';

// Roster name reconciliation. During the live tournament, a DRAFTED player who fails to
// resolve from Wikipedia's team-cell markup is a SILENT scoring hole — their wins never
// count and nobody is told. So every player on the roster must round-trip from every
// realistic cell form the feed will encounter: flag icons, '''bold''' winners, piped
// abbreviations ("[[Full Name|F. Name]]"), and disambiguated links ("[[Name (tennis)|…]]").
describe('live feed — roster name reconciliation', () => {
  const abbreviate = (name: string) =>
    name.split(' ').map((w, i) => (i === 0 ? `${w[0]}.` : w)).join(' '); // "Alex de Minaur" → "A. de Minaur"

  const cellForms = (name: string): string[] => [
    `[[${name}]]`,                                          // bare link
    `{{flagicon|USA}} [[${name}]]`,                         // with flag icon
    `'''{{flagicon|USA}} [[${name}]]'''`,                   // bold (a match winner)
    `{{flagicon|ESP}} [[${name}|${abbreviate(name)}]]`,     // piped abbreviation (later rounds)
    `'''{{flagicon|ITA}} [[${name} (tennis)|${name}]]'''`,  // disambiguated + bold
  ];

  it('every roster name is unique after normalisation (no id collisions)', () => {
    // If two players normalised to the same key, ID_BY_NAME would silently drop one.
    expect(new Set(PLAYERS.map(p => p.name.toLowerCase())).size).toBe(PLAYERS.length);
  });

  it.each(PLAYERS.map(p => [p.name, p.id] as const))('resolves "%s" from every cell form', (name, id) => {
    for (const cell of cellForms(name)) {
      expect(teamId(cell)).toBe(id);
    }
  });
});
