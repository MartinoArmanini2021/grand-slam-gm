import { describe, it, expect } from 'vitest';
import { parseBracket, cleanTeam } from '../data/liveData';
import { matchKey } from '../data/liveResults';

describe('cleanTeam — strip Wikipedia markup', () => {
  it('drops flag templates and wiki-links to a bare name', () => {
    expect(cleanTeam('{{flagicon|ITA}} [[Jannik Sinner]]')).toBe('Jannik Sinner');
    expect(cleanTeam('[[Alex de Minaur (tennis)|Alex de Minaur]]')).toBe('Alex de Minaur');
    expect(cleanTeam("'''[[Novak Djokovic]]'''")).toBe('Novak Djokovic');
  });
});

// A standard 4-team, 2-round tennis bracket template. Winners are derived from
// ADVANCEMENT (who appears in the next round), not score cells — so we only supply
// the teams. Players chosen are all in the roster so ids are stable.
const FIXTURE = `
{{4TeamBracket-Tennis3
| RD1=Semifinals
| RD2=Final
| RD1-seed01=1 | RD1-team01={{flagicon|ITA}} [[Jannik Sinner]]  | RD1-score01-1=6 | RD1-score01-2=6
| RD1-seed02=4 | RD1-team02={{flagicon|GER}} [[Alexander Zverev]] | RD1-score02-1=3 | RD1-score02-2=4
| RD1-seed03=3 | RD1-team03={{flagicon|SRB}} [[Novak Djokovic]] | RD1-score03-1=7 | RD1-score03-2=6
| RD1-seed04=6 | RD1-team04={{flagicon|USA}} [[Taylor Fritz]]   | RD1-score04-1=5 | RD1-score04-2=4
| RD2-seed01=1 | RD2-team01={{flagicon|ITA}} [[Jannik Sinner]]  | RD2-score01-1=6
| RD2-seed02=3 | RD2-team02={{flagicon|SRB}} [[Novak Djokovic]] | RD2-score02-1=4
}}
`;

describe('parseBracket — structural parse + advancement winners', () => {
  const { draw, results } = parseBracket(FIXTURE, ['SF', 'F']);

  it('builds the pairings for each round it can', () => {
    // 2 semis + 1 final pairing (both semi winners are known)
    expect(draw).toHaveLength(3);
    expect(draw.find(m => m.round === 'SF' && m.slot === 0)).toMatchObject({ p1Id: 'sinner', p2Id: 'zverev' });
    expect(draw.find(m => m.round === 'SF' && m.slot === 1)).toMatchObject({ p1Id: 'djokovic', p2Id: 'fritz' });
    expect(draw.find(m => m.round === 'F' && m.slot === 0)).toMatchObject({ p1Id: 'sinner', p2Id: 'djokovic' });
  });

  it('derives each completed match winner from who advanced', () => {
    expect(results[matchKey('SF', 0)]).toBe('sinner');   // Sinner advanced to the final
    expect(results[matchKey('SF', 1)]).toBe('djokovic');  // Djokovic advanced
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
| RD1-team1='''{{flagicon|ITA}} [[Jannik Sinner]]'''
| RD1-team2={{flagicon|GER}} [[Alexander Zverev]]
| RD1-team3={{flagicon|SRB}} [[Novak Djokovic]]
| RD1-team4='''{{flagicon|USA}} [[Taylor Fritz]]'''
}}
`;

describe('parseBracket — bold winner marker', () => {
  const { draw, results } = parseBracket(BOLD_FIXTURE, ['SF', 'F']);

  it('reads 1-digit team indices and pairs them', () => {
    expect(draw.filter(m => m.round === 'SF')).toHaveLength(2);
    expect(draw.find(m => m.slot === 0)).toMatchObject({ p1Id: 'sinner', p2Id: 'zverev' });
    expect(draw.find(m => m.slot === 1)).toMatchObject({ p1Id: 'djokovic', p2Id: 'fritz' });
  });

  it('picks the bold team as the winner (no next round needed)', () => {
    expect(results[matchKey('SF', 0)]).toBe('sinner'); // Sinner bold
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
