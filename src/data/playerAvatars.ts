import { createAvatar } from '@dicebear/core';
import { personas } from '@dicebear/collection';
import { getPlayer } from './players';
import { getTier } from './tiers';

// One consistent illustrated style ("same artist"), customized per player from
// their real features (skin tone, hair style/colour, facial hair). Background
// is a solid tier colour so the set reads like a Fantalab-style card lineup.

type Skin = 'light' | 'fair' | 'medium' | 'tan' | 'brown' | 'dark';
type HairColor = 'black' | 'darkbrown' | 'brown' | 'lightbrown' | 'blond' | 'ginger';
type Hair =
  | 'shortCombover' | 'buzzcut' | 'fade' | 'curly' | 'curlyHighTop'
  | 'long' | 'extraLong' | 'bald' | 'balding' | 'sideShave' | 'bunUndercut';
type Facial = 'shadow' | 'beardMustache' | 'goatee' | null;

interface Trait { skin: Skin; hair: Hair; hc: HairColor; facial: Facial; }

const SKIN: Record<Skin, string> = {
  light: 'f4d0b0', fair: 'e8b58e', medium: 'cf9155', tan: 'c07f45', brown: '9a5c33', dark: '6f4327',
};
const HAIR: Record<HairColor, string> = {
  black: '1e1a17', darkbrown: '2e2016', brown: '4a3121', lightbrown: '7b4f2c', blond: 'c9a15a', ginger: 'b5541f',
};

const TIER_BG: Record<string, string> = {
  Platinum: '8fe3f2', Gold: 'f7be3f', Silver: 'b6c0cc',
};

const TRAITS: Record<string, Trait> = {
  alcaraz:         { skin: 'medium', hair: 'shortCombover', hc: 'darkbrown',  facial: 'shadow' },
  sinner:          { skin: 'light',  hair: 'shortCombover', hc: 'ginger',     facial: null },
  zverev:          { skin: 'fair',   hair: 'shortCombover', hc: 'darkbrown',  facial: 'shadow' },
  djokovic:        { skin: 'light',  hair: 'shortCombover', hc: 'darkbrown',  facial: null },
  fritz:           { skin: 'fair',   hair: 'shortCombover', hc: 'brown',      facial: null },
  medvedev:        { skin: 'fair',   hair: 'shortCombover', hc: 'darkbrown',  facial: 'shadow' },
  ruud:            { skin: 'fair',   hair: 'shortCombover', hc: 'brown',      facial: null },
  rublev:          { skin: 'fair',   hair: 'buzzcut',       hc: 'lightbrown', facial: null },
  rune:            { skin: 'fair',   hair: 'curly',         hc: 'brown',      facial: null },
  paul:            { skin: 'fair',   hair: 'shortCombover', hc: 'brown',      facial: 'shadow' },
  shelton:         { skin: 'dark',   hair: 'fade',          hc: 'black',      facial: null },
  hurkacz:         { skin: 'fair',   hair: 'shortCombover', hc: 'darkbrown',  facial: 'shadow' },
  kyrgios:         { skin: 'tan',    hair: 'fade',          hc: 'black',      facial: 'beardMustache' },
  dimitrov:        { skin: 'medium', hair: 'shortCombover', hc: 'darkbrown',  facial: 'shadow' },
  tiafoe:          { skin: 'dark',   hair: 'fade',          hc: 'black',      facial: null },
  musetti:         { skin: 'medium', hair: 'curly',         hc: 'darkbrown',  facial: 'shadow' },
  korda:           { skin: 'fair',   hair: 'shortCombover', hc: 'lightbrown', facial: null },
  draper:          { skin: 'fair',   hair: 'shortCombover', hc: 'brown',      facial: null },
  tsitsipas:       { skin: 'medium', hair: 'long',          hc: 'brown',      facial: 'beardMustache' },
  khachanov:       { skin: 'medium', hair: 'buzzcut',       hc: 'black',      facial: 'beardMustache' },
  lehecka:         { skin: 'fair',   hair: 'shortCombover', hc: 'brown',      facial: null },
  deminaur:        { skin: 'medium', hair: 'shortCombover', hc: 'darkbrown',  facial: null },
  fils:            { skin: 'dark',   hair: 'fade',          hc: 'black',      facial: null },
  cobolli:         { skin: 'medium', hair: 'shortCombover', hc: 'darkbrown',  facial: 'shadow' },
  eubanks:         { skin: 'dark',   hair: 'buzzcut',       hc: 'black',      facial: null },
  berrettini:      { skin: 'medium', hair: 'shortCombover', hc: 'darkbrown',  facial: 'beardMustache' },
  sonego:          { skin: 'fair',   hair: 'shortCombover', hc: 'brown',      facial: null },
  davidovich:      { skin: 'medium', hair: 'curly',         hc: 'darkbrown',  facial: 'shadow' },
  vandezandschulp: { skin: 'fair',   hair: 'shortCombover', hc: 'brown',      facial: 'shadow' },
  bautistaagut:    { skin: 'medium', hair: 'shortCombover', hc: 'darkbrown',  facial: 'beardMustache' },
  nakashima:       { skin: 'medium', hair: 'shortCombover', hc: 'black',      facial: null },
  thompson:        { skin: 'fair',   hair: 'shortCombover', hc: 'brown',      facial: 'shadow' },
};

const uriCache = new Map<string, string | null>();

export function getAvatarUri(id: string): string | null {
  if (uriCache.has(id)) return uriCache.get(id)!;
  const t = TRAITS[id];
  if (!t) { uriCache.set(id, null); return null; }

  const tier = getTier(getPlayer(id).ranking);

  const uri = createAvatar(personas, {
    seed: id,
    radius: 50,
    backgroundColor: [TIER_BG[tier]],
    skinColor: [SKIN[t.skin]],
    hair: [t.hair],
    hairColor: [HAIR[t.hc]],
    facialHair: t.facial ? [t.facial] : undefined,
    facialHairProbability: t.facial ? 100 : 0,
    clothingColor: ['26324a'], // uniform navy kit → cohesive lineup, pops on every tier
    eyes: ['open', 'happy'],
    mouth: ['smile', 'bigSmile'],
    nose: ['mediumRound'],
  }).toDataUri();

  uriCache.set(id, uri);
  return uri;
}
