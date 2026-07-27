// Generate the 300-player master pool (src/data/atp300.json) from the ATP top-300
// snapshot (src/data/atp300.raw.json, from the avatars ZIP, dated 2026-07-20).
//
// Reproducible: `node scripts/gen-atp300.mjs`. Reuses the existing Wimbledon roster's
// ids where names match (so the bracket, saved squads, and avatars keep working) and
// generates stable ids for the rest.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = JSON.parse(readFileSync(join(root, 'src/data/atp300.raw.json'), 'utf8')).players;
const field = JSON.parse(readFileSync(join(root, 'src/data/wimbledon2026Field.json'), 'utf8'));

const clean = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Match key collapses ALL separators (spaces, hyphens) so "Jan-Lennard" and
// "Jan Lennard" resolve to the same player.
const matchKey = (s) => clean(s).replace(/[^a-z]/g, '');

// IOC/ATP 3-letter country codes → { country, flag }. Covers every code in the top 300.
const COUNTRY = {
  ARG: ['Argentina', '🇦🇷'], AUS: ['Australia', '🇦🇺'], AUT: ['Austria', '🇦🇹'], BEL: ['Belgium', '🇧🇪'],
  BIH: ['Bosnia & Herzegovina', '🇧🇦'], BOL: ['Bolivia', '🇧🇴'], BRA: ['Brazil', '🇧🇷'], BUL: ['Bulgaria', '🇧🇬'],
  CAN: ['Canada', '🇨🇦'], CHI: ['Chile', '🇨🇱'], CHN: ['China', '🇨🇳'], COL: ['Colombia', '🇨🇴'],
  CRO: ['Croatia', '🇭🇷'], CZE: ['Czechia', '🇨🇿'], DEN: ['Denmark', '🇩🇰'], DOM: ['Dominican Republic', '🇩🇴'],
  ECU: ['Ecuador', '🇪🇨'], ESP: ['Spain', '🇪🇸'], EST: ['Estonia', '🇪🇪'], FIN: ['Finland', '🇫🇮'],
  FRA: ['France', '🇫🇷'], GBR: ['Great Britain', '🇬🇧'], GEO: ['Georgia', '🇬🇪'], GER: ['Germany', '🇩🇪'],
  GRE: ['Greece', '🇬🇷'], HKG: ['Hong Kong', '🇭🇰'], HUN: ['Hungary', '🇭🇺'], IND: ['India', '🇮🇳'],
  ITA: ['Italy', '🇮🇹'], JOR: ['Jordan', '🇯🇴'], JPN: ['Japan', '🇯🇵'], KAZ: ['Kazakhstan', '🇰🇿'],
  KOR: ['South Korea', '🇰🇷'], LTU: ['Lithuania', '🇱🇹'], LUX: ['Luxembourg', '🇱🇺'], MDA: ['Moldova', '🇲🇩'],
  MON: ['Monaco', '🇲🇨'], NED: ['Netherlands', '🇳🇱'], NOR: ['Norway', '🇳🇴'], PAR: ['Paraguay', '🇵🇾'],
  PER: ['Peru', '🇵🇪'], POL: ['Poland', '🇵🇱'], POR: ['Portugal', '🇵🇹'], ROU: ['Romania', '🇷🇴'],
  RSA: ['South Africa', '🇿🇦'], RUS: ['Russia', '🇷🇺'], SRB: ['Serbia', '🇷🇸'], SUI: ['Switzerland', '🇨🇭'],
  SVK: ['Slovakia', '🇸🇰'], SWE: ['Sweden', '🇸🇪'], TPE: ['Chinese Taipei', '🇹🇼'], TUN: ['Tunisia', '🇹🇳'],
  TUR: ['Türkiye', '🇹🇷'], UKR: ['Ukraine', '🇺🇦'], URU: ['Uruguay', '🇺🇾'], USA: ['United States', '🇺🇸'],
};

const existingId = new Map(field.map((f) => [matchKey(f.name), f.id]));
const used = new Set(field.map((f) => f.id));
const lastName = (name) => {
  const p = clean(name).replace(/-/g, ' ').replace(/[^a-z ]/g, ' ').trim().split(/\s+/);
  return p[p.length - 1];
};

const unknownCodes = new Set();
const pool = raw.map((p) => {
  // id: reuse the existing roster id when the name matches; else lastname, then full
  // name on collision — matching the roster's own convention.
  let id = existingId.get(matchKey(p.name));
  if (!id) {
    id = lastName(p.name);
    if (used.has(id)) id = matchKey(p.name); // full name on surname collision
    while (used.has(id)) id += 'x';
    used.add(id);
  }
  const c = COUNTRY[p.ctry];
  if (!c) unknownCodes.add(p.ctry);
  return {
    id,
    atpId: p.id,
    name: p.name,
    rank: p.rank,
    ctry: p.ctry,
    country: c ? c[0] : p.ctry,
    flag: c ? c[1] : '🎾',
    photoUrl: p.headshot,
  };
});

if (unknownCodes.size) console.warn('WARNING unmapped country codes:', [...unknownCodes].join(' '));
const ids = pool.map((p) => p.id);
if (new Set(ids).size !== ids.length) throw new Error('duplicate ids generated!');

writeFileSync(join(root, 'src/data/atp300.json'), JSON.stringify(pool, null, 0) + '\n');
console.log(`Wrote src/data/atp300.json — ${pool.length} players, ${new Set(pool.map((p) => p.ctry)).size} countries, all ids unique.`);
