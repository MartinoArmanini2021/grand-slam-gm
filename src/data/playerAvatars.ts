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

// Real Wimbledon 2026 field — one illustrated style, each customized to the
// player's distinctive real features so the set reads as recognizable icons.
const TRAITS: Record<string, Trait> = {
  sinner:             { skin: 'light',  hair: 'shortCombover', hc: 'ginger',     facial: null },
  zverev:             { skin: 'fair',   hair: 'shortCombover', hc: 'darkbrown',  facial: 'shadow' },
  augeraliassime:     { skin: 'brown',  hair: 'fade',          hc: 'black',      facial: 'shadow' },
  shelton:            { skin: 'dark',   hair: 'fade',          hc: 'black',      facial: null },
  deminaur:           { skin: 'medium', hair: 'shortCombover', hc: 'darkbrown',  facial: null },
  fritz:              { skin: 'fair',   hair: 'shortCombover', hc: 'blond',      facial: null },
  djokovic:           { skin: 'light',  hair: 'shortCombover', hc: 'darkbrown',  facial: null },
  medvedev:           { skin: 'fair',   hair: 'shortCombover', hc: 'darkbrown',  facial: 'shadow' },
  cobolli:            { skin: 'medium', hair: 'shortCombover', hc: 'darkbrown',  facial: 'shadow' },
  bublik:             { skin: 'fair',   hair: 'shortCombover', hc: 'brown',      facial: 'shadow' },
  ruud:               { skin: 'fair',   hair: 'shortCombover', hc: 'brown',      facial: null },
  rublev:             { skin: 'fair',   hair: 'buzzcut',       hc: 'lightbrown', facial: null },
  lehecka:            { skin: 'fair',   hair: 'shortCombover', hc: 'brown',      facial: null },
  darderi:            { skin: 'medium', hair: 'curly',         hc: 'darkbrown',  facial: 'shadow' },
  mensik:             { skin: 'fair',   hair: 'shortCombover', hc: 'brown',      facial: null },
  tien:               { skin: 'light',  hair: 'shortCombover', hc: 'black',      facial: null },
  tiafoe:             { skin: 'dark',   hair: 'fade',          hc: 'black',      facial: null },
  franciscocerundolo: { skin: 'medium', hair: 'curly',         hc: 'darkbrown',  facial: 'beardMustache' },
  khachanov:          { skin: 'medium', hair: 'buzzcut',       hc: 'black',      facial: 'beardMustache' },
  fils:               { skin: 'dark',   hair: 'fade',          hc: 'black',      facial: null },
  paul:               { skin: 'fair',   hair: 'shortCombover', hc: 'brown',      facial: 'shadow' },
  davidovichfokina:   { skin: 'medium', hair: 'curly',         hc: 'darkbrown',  facial: 'shadow' },
  jodar:              { skin: 'medium', hair: 'shortCombover', hc: 'darkbrown',  facial: null },
  fonseca:            { skin: 'tan',    hair: 'curly',         hc: 'darkbrown',  facial: null },
  rinderknech:        { skin: 'fair',   hair: 'shortCombover', hc: 'brown',      facial: 'beardMustache' },
  norrie:             { skin: 'fair',   hair: 'long',          hc: 'brown',      facial: null },
  humbert:            { skin: 'fair',   hair: 'shortCombover', hc: 'brown',      facial: null },
  nakashima:          { skin: 'light',  hair: 'shortCombover', hc: 'black',      facial: null },
  etcheverry:         { skin: 'medium', hair: 'long',          hc: 'darkbrown',  facial: 'beardMustache' },
  tabilo:             { skin: 'medium', hair: 'shortCombover', hc: 'black',      facial: null },
  buse:               { skin: 'tan',    hair: 'curly',         hc: 'darkbrown',  facial: null },
  arnaldi:            { skin: 'medium', hair: 'shortCombover', hc: 'darkbrown',  facial: 'shadow' },
  fery:               { skin: 'fair',   hair: 'shortCombover', hc: 'brown',      facial: null },
  struff:             { skin: 'fair',   hair: 'balding',       hc: 'brown',      facial: 'shadow' },
  hurkacz:            { skin: 'fair',   hair: 'shortCombover', hc: 'darkbrown',  facial: 'shadow' },
  safiullin:          { skin: 'fair',   hair: 'shortCombover', hc: 'brown',      facial: 'shadow' },
  mochizuki:          { skin: 'light',  hair: 'shortCombover', hc: 'black',      facial: null },
  dimitrov:           { skin: 'medium', hair: 'shortCombover', hc: 'darkbrown',  facial: 'shadow' },
  berrettini:         { skin: 'medium', hair: 'shortCombover', hc: 'darkbrown',  facial: 'beardMustache' },
  tsitsipas:          { skin: 'medium', hair: 'long',          hc: 'brown',      facial: 'beardMustache' },
  sonego:             { skin: 'fair',   hair: 'shortCombover', hc: 'brown',      facial: null },
  brooksby:           { skin: 'fair',   hair: 'shortCombover', hc: 'brown',      facial: null },
  shapovalov:         { skin: 'fair',   hair: 'curly',         hc: 'lightbrown', facial: null },
  wawrinka:           { skin: 'fair',   hair: 'balding',       hc: 'brown',      facial: 'shadow' },
  virtanen:           { skin: 'fair',   hair: 'shortCombover', hc: 'blond',      facial: null },
  cilic:              { skin: 'fair',   hair: 'shortCombover', hc: 'darkbrown',  facial: 'shadow' },
  munar:              { skin: 'medium', hair: 'shortCombover', hc: 'darkbrown',  facial: 'shadow' },
  giron:              { skin: 'medium', hair: 'shortCombover', hc: 'black',      facial: 'shadow' },
  bergs:              { skin: 'fair',   hair: 'shortCombover', hc: 'brown',      facial: null },
  fucsovics:          { skin: 'fair',   hair: 'buzzcut',       hc: 'brown',      facial: 'shadow' },
  svajda:             { skin: 'fair',   hair: 'shortCombover', hc: 'brown',      facial: null },
  zheng:              { skin: 'light',  hair: 'shortCombover', hc: 'black',      facial: null },
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
