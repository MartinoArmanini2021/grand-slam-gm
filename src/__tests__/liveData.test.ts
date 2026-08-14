import { describe, it, expect } from 'vitest';
import { parseBracket, cleanTeam } from '../data/liveData';
import { matchKey } from '../data/liveResults';
import { findPlayer } from '../data/players';

// These fixtures assert real roster IDS, so they only mean anything while the named players are in
// the ACTIVE field — otherwise each resolves to a synthetic `x_…` id and the tests fail confusingly.
// Pin that assumption here so a field change reports the real cause instead. (Bublik was swapped for
// Medvedev at the Cincinnati cutover: he isn't in that draw.)
describe('fixture assumption — the named players are in the active field', () => {
  it.each(['zverev', 'medvedev', 'deminaur', 'fritz'])('%s is draftable', (id) => {
    expect(findPlayer(id), `fixture player "${id}" is not in the active field — pick another`).toBeDefined();
  });
});

describe('cleanTeam — strip Wikipedia markup', () => {
  it('drops flag templates and wiki-links to a bare name', () => {
    expect(cleanTeam('{{flagicon|GER}} [[Alexander Zverev]]')).toBe('Alexander Zverev');
    expect(cleanTeam('[[Alex de Minaur (tennis)|Alex de Minaur]]')).toBe('Alex de Minaur');
    expect(cleanTeam("'''[[Ben Shelton]]'''")).toBe('Ben Shelton');
  });
});

// A standard 4-team, 2-round tennis bracket template. Winners are derived from
// ADVANCEMENT (who appears in the next round), not score cells — so we only supply
// the teams. Players chosen are all in the Montréal field so ids are stable.
const FIXTURE = `
{{4TeamBracket-Tennis3
| RD1=Semifinals
| RD2=Final
| RD1-seed01=2 | RD1-team01={{flagicon|GER}} [[Alexander Zverev]]  | RD1-score01-1=6 | RD1-score01-2=6
| RD1-seed02=11 | RD1-team02={{flagicon|RUS}} [[Daniil Medvedev]] | RD1-score02-1=3 | RD1-score02-2=4
| RD1-seed03=5 | RD1-team03={{flagicon|AUS}} [[Alex de Minaur]]   | RD1-score03-1=7 | RD1-score03-2=6
| RD1-seed04=22 | RD1-team04={{flagicon|USA}} [[Taylor Fritz]]    | RD1-score04-1=5 | RD1-score04-2=4
| RD2-seed01=2 | RD2-team01={{flagicon|GER}} [[Alexander Zverev]] | RD2-score01-1=6
| RD2-seed02=5 | RD2-team02={{flagicon|AUS}} [[Alex de Minaur]]   | RD2-score02-1=4
}}
`;

describe('parseBracket — structural parse + advancement winners', () => {
  const { draw, results } = parseBracket(FIXTURE, ['SF', 'F']);

  it('builds the pairings for each round it can', () => {
    // 2 semis + 1 final pairing (both semi winners are known)
    expect(draw).toHaveLength(3);
    expect(draw.find(m => m.round === 'SF' && m.slot === 0)).toMatchObject({ p1Id: 'zverev', p2Id: 'medvedev' });
    expect(draw.find(m => m.round === 'SF' && m.slot === 1)).toMatchObject({ p1Id: 'deminaur', p2Id: 'fritz' });
    expect(draw.find(m => m.round === 'F' && m.slot === 0)).toMatchObject({ p1Id: 'zverev', p2Id: 'deminaur' });
  });

  it('derives each completed match winner from who advanced', () => {
    expect(results[matchKey('SF', 0)]).toBe('zverev');    // Zverev advanced to the final
    expect(results[matchKey('SF', 1)]).toBe('deminaur');  // de Minaur advanced
    expect(results[matchKey('F', 0)]).toBeUndefined();    // final not decided (no next round)
  });

  it('maps template rounds onto the tournament’s own round ids', () => {
    expect(new Set(draw.map(m => m.round))).toEqual(new Set(['SF', 'F']));
  });
});

// Real Wikipedia brackets mark the winner with '''bold''' (verified against the 2025
// National Bank Open page) and use 1-digit team indices in some variants. Bold is the
// primary signal; identity comes from the wikilink target.
const BOLD_FIXTURE = `
{{8TeamBracket-Tennis3-v2
| RD1-team1='''{{flagicon|GER}} [[Alexander Zverev]]'''
| RD1-team2={{flagicon|RUS}} [[Daniil Medvedev]]
| RD1-team3={{flagicon|AUS}} [[Alex de Minaur]]
| RD1-team4='''{{flagicon|USA}} [[Taylor Fritz]]'''
}}
`;

describe('parseBracket — bold winner marker', () => {
  const { draw, results } = parseBracket(BOLD_FIXTURE, ['SF', 'F']);

  it('reads 1-digit team indices and pairs them', () => {
    expect(draw.filter(m => m.round === 'SF')).toHaveLength(2);
    expect(draw.find(m => m.slot === 0)).toMatchObject({ p1Id: 'zverev', p2Id: 'medvedev' });
    expect(draw.find(m => m.slot === 1)).toMatchObject({ p1Id: 'deminaur', p2Id: 'fritz' });
  });

  it('picks the bold team as the winner (no next round needed)', () => {
    expect(results[matchKey('SF', 0)]).toBe('zverev'); // Zverev bold
    expect(results[matchKey('SF', 1)]).toBe('fritz');  // Fritz bold (not the higher seed)
  });
});

// The wikilink target survives an abbreviated later-round label.
describe('teamTarget robustness', () => {
  it('matches a full-name winner even when the label is abbreviated', () => {
    const wt = `
{{4TeamBracket
| RD1-team1={{flagicon|GER}} [[Alexander Zverev]]
| RD1-team2={{flagicon|AUS}} [[Alexei Popyrin]]
| RD2-team1='''{{flagicon|GER}} [[Alexander Zverev|A. Zverev]]'''
}}`;
    const { results } = parseBracket(wt, ['SF', 'F']);
    expect(results[matchKey('SF', 0)]).toBe('zverev'); // target [[Alexander Zverev]] matched
  });
});
