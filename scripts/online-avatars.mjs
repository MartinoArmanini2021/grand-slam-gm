#!/usr/bin/env node
/**
 * Generates photorealistic player headshots online via Pollinations (free, no key).
 * Text-to-image → realistic faces matched to each player's real appearance,
 * in one consistent studio style. Output: public/avatars/<id>.png
 *
 *   node scripts/online-avatars.mjs                 # all
 *   node scripts/online-avatars.mjs --only alcaraz  # subset
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../public/avatars');

const STYLE = 'professional photorealistic studio headshot, facing camera, shoulders-up, neutral dark grey seamless background, soft even studio lighting, sharp focus on eyes, DSLR 85mm portrait, ultra realistic, high detail';

// name + appearance (drives skin/hair/beard so each face is plausible for the player)
const P = {
  alcaraz:        ['Carlos Alcaraz', 'a 23 year old male Spanish tennis player, olive skin, short dark brown tousled hair, light stubble'],
  sinner:         ['Jannik Sinner', 'a 24 year old male Italian tennis player, fair skin, short copper red hair, clean shaven, freckles'],
  zverev:         ['Alexander Zverev', 'a 29 year old tall male German tennis player, fair skin, short dark brown hair, short stubble beard'],
  djokovic:       ['Novak Djokovic', 'a 38 year old male Serbian tennis player, light skin, short dark brown hair combed back, clean shaven, lean sharp face'],
  fritz:          ['Taylor Fritz', 'a 28 year old male American tennis player, fair skin, medium light brown hair swept aside, clean shaven'],
  medvedev:       ['Daniil Medvedev', 'a 30 year old tall lean male Russian tennis player, fair skin, short dark brown hair, light stubble'],
  ruud:           ['Casper Ruud', 'a 27 year old male Norwegian tennis player, fair skin, short mid brown hair, clean shaven'],
  rublev:         ['Andrey Rublev', 'a 28 year old male Russian tennis player, fair skin, very short light brown buzzed hair, clean shaven'],
  rune:           ['Holger Rune', 'a 23 year old male Danish tennis player, fair skin, medium brown wavy hair, clean shaven'],
  paul:           ['Tommy Paul', 'a 28 year old male American tennis player, fair skin, short brown hair, light stubble'],
  shelton:        ['Ben Shelton', 'a 23 year old male American athlete, dark brown skin, very short black cropped hair, clean shaven, broad build'],
  hurkacz:        ['Hubert Hurkacz', 'a 27 year old very tall male Polish tennis player, fair skin, short dark brown hair, light stubble'],
  kyrgios:        ['Nick Kyrgios', 'a 31 year old male Australian athlete, tan skin, short black hair, full short black beard'],
  dimitrov:       ['Grigor Dimitrov', 'a 33 year old handsome male Bulgarian tennis player, light olive skin, medium dark brown hair, light stubble'],
  tiafoe:         ['Frances Tiafoe', 'a 27 year old male American athlete, dark brown skin, short black cropped hair, clean shaven, warm smile'],
  musetti:        ['Lorenzo Musetti', 'a 22 year old male Italian tennis player, light olive skin, medium dark brown wavy hair, light stubble'],
  korda:          ['Sebastian Korda', 'a 24 year old tall male American tennis player, fair skin, medium light brown hair, clean shaven'],
  draper:         ['Jack Draper', 'a 23 year old male British tennis player, fair skin, short brown hair, clean shaven, strong build'],
  tsitsipas:      ['Stefanos Tsitsipas', 'a 26 year old male Greek tennis player, light olive skin, long brown hair to shoulders, short beard'],
  khachanov:      ['Karen Khachanov', 'a 28 year old tall male tennis player, light olive skin, short black hair, full dark beard'],
  lehecka:        ['Jiri Lehecka', 'a 23 year old male Czech tennis player, fair skin, short mid brown hair, clean shaven'],
  deminaur:       ['Alex de Minaur', 'a 25 year old lean male Australian tennis player, light olive skin, short dark brown hair, clean shaven'],
  fils:           ['Arthur Fils', 'a 21 year old male French athlete, dark brown skin, short black hair, clean shaven'],
  cobolli:        ['Flavio Cobolli', 'a 23 year old male Italian tennis player, light olive skin, short dark brown hair, light stubble'],
  eubanks:        ['Christopher Eubanks', 'a 28 year old very tall thin male American athlete, dark brown skin, very short black hair, clean shaven'],
  berrettini:     ['Matteo Berrettini', 'a 30 year old muscular male Italian tennis player, light olive skin, short dark brown hair, full dark beard'],
  sonego:         ['Lorenzo Sonego', 'a 29 year old male Italian tennis player, fair skin, short brown hair, clean shaven'],
  davidovich:     ['Alejandro Davidovich Fokina', 'a 25 year old male Spanish tennis player, light olive skin, medium dark brown wavy hair, light stubble'],
  vandezandschulp:['Botic van de Zandschulp', 'a 29 year old male Dutch tennis player, fair skin, short brown hair, light stubble'],
  bautistaagut:   ['Roberto Bautista Agut', 'a 36 year old male Spanish tennis player, light olive skin, short dark brown hair, full trimmed dark beard'],
  nakashima:      ['Brandon Nakashima', 'a 23 year old male American tennis player, light tan East Asian American skin, short black hair, clean shaven'],
  thompson:       ['Jordan Thompson', 'a 30 year old male Australian tennis player, fair skin, short brown hair, light stubble'],
};

const args = process.argv.slice(2);
const onlyArg = args.find((a, i) => args[i - 1] === '--only');
const only = onlyArg ? onlyArg.split(',').map(s => s.trim()) : null;
const ids = Object.keys(P).filter(id => !only || only.includes(id));

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function gen(id, index) {
  const [name, appearance] = P[id];
  const prompt = `${STYLE}. Portrait of ${name}, ${appearance}.`;
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=512&nologo=true&model=flux&seed=${1000 + index}`;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.startsWith('image/')) {
        await writeFile(resolve(OUT, `${id}.png`), Buffer.from(await res.arrayBuffer()));
        return true;
      }
      // queue full / error → back off and retry
      await sleep(4000 * attempt);
    } catch {
      await sleep(4000 * attempt);
    }
  }
  return false;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  console.log(`Generating ${ids.length} realistic avatars online…\n`);
  let ok = 0, fail = 0;
  for (let i = 0; i < ids.length; i++) {
    const good = await gen(ids[i], i);
    if (good) { ok++; console.log(`  ✓ ${ids[i]}`); }
    else { fail++; console.log(`  ✗ ${ids[i]}`); }
    await sleep(1500); // pace to stay under the queue limit
  }
  console.log(`\nDone. ${ok} built, ${fail} failed → public/avatars/`);
}
main().catch(e => { console.error(e); process.exit(1); });
