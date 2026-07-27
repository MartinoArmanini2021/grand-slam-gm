import { PLAYER_POOL } from './playerPool';

// Player nicknames, sourced from the avatars ZIP (Player Avatars.dc.html). Shown in
// quotes above the player's name, with the country flag. Keyed here by full name and
// resolved to the app's player ids via the pool, so the ids stay correct even as the
// roster/pool changes. Players without a nickname simply show the flag alone.
const NICK_BY_NAME: Record<string, string> = {
  'Jannik Sinner': 'The Carrot',
  'Carlos Alcaraz': 'Carlitos',
  'Novak Djokovic': 'Nole',
  'Daniil Medvedev': 'Medve',
  'Alexander Zverev': 'Sascha',
  'Stefanos Tsitsipas': 'The Greek',
  'Andrey Rublev': 'Rublo',
  'Taylor Fritz': 'Fritzy',
  'Ben Shelton': 'Shelly',
  'Alex de Minaur': 'Demon',
  'Grigor Dimitrov': 'Baby Fed',
  'Matteo Berrettini': 'The Hammer',
  'Hubert Hurkacz': 'Hubi',
  'Karen Khachanov': 'Karen',
  'Alexander Bublik': 'Bubz',
  'Reilly Opelka': 'Big Rig',
  'Stan Wawrinka': 'Stan the Man',
  'Frances Tiafoe': 'Big Foe',
  'Holger Rune': 'Viking',
  'Denis Shapovalov': 'Shapo',
  'Felix Auger-Aliassime': 'FAA',
  'Sebastian Korda': 'SebiK',
  'Casper Ruud': 'Casp',
  'Tommy Paul': 'TP',
  'Nick Kyrgios': 'NK',
};

// Collapse to letters only so accent/hyphen/spacing differences never split a match.
const key = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');

const idByKey = new Map(PLAYER_POOL.map(p => [key(p.name), p.id]));
const NICK_BY_ID: Record<string, string> = {};
for (const [name, nick] of Object.entries(NICK_BY_NAME)) {
  const id = idByKey.get(key(name));
  if (id) NICK_BY_ID[id] = nick;
}

// The player's nickname (without quotes), or null if they don't have one.
export const nickOf = (id: string): string | null => NICK_BY_ID[id] ?? null;
