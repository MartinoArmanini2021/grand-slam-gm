#!/usr/bin/env node
/**
 * Generates a UNIFORM set of photorealistic player headshots.
 *
 * Every avatar uses the same studio framing / lighting / background prompt so
 * the whole set is visually homogeneous — only the per-player appearance line
 * changes. Faces are described by appearance (age, skin, hair, facial hair),
 * NOT by the real athlete's name, to keep results consistent and avoid
 * likeness/policy issues.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-...  node scripts/generate-avatars.mjs                 # OpenAI gpt-image-1 (default)
 *   REPLICATE_API_TOKEN=r8_...  node scripts/generate-avatars.mjs --replicate  # Flux 1.1 pro on Replicate
 *   node scripts/generate-avatars.mjs --only alcaraz,sinner                  # regenerate a subset
 *
 * Output: public/avatars/<id>.png
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../public/avatars');

// Shared studio direction — identical for every player = homogeneous set.
const STYLE = [
  'Professional sports headshot, shoulders-up, facing the camera directly.',
  'Soft even studio lighting, seamless dark charcoal gradient background (#141a26).',
  'Photorealistic, shot on an 85mm portrait lens, shallow depth of field, sharp focus on the eyes.',
  'Neutral confident expression, athletic build, wearing a plain modern athletic polo.',
  'Ultra realistic, high detail, colour photograph, centered composition.',
].join(' ');

// Appearance-only descriptors (no names). Kept tasteful and generic-but-distinct.
const APPEARANCE = {
  alcaraz:         'A 23-year-old male tennis player with warm olive Mediterranean skin, short dark brown tousled hair, light stubble, strong jaw.',
  sinner:          'A 24-year-old male tennis player with fair skin, short copper-red hair, clean-shaven, light freckles, angular features.',
  zverev:          'A 29-year-old very tall male tennis player with fair skin, short dark brown hair, short stubble beard.',
  djokovic:        'A 38-year-old male tennis player with light skin, short dark brown hair combed back, clean-shaven, lean sharp features.',
  fritz:           'A 28-year-old male tennis player with fair skin, medium-length light brown hair swept to the side, clean-shaven, all-American look.',
  medvedev:        'A 30-year-old male tennis player with fair skin, short dark brown hair, light stubble, tall and lean.',
  ruud:            'A 27-year-old male tennis player with fair Scandinavian skin, short mid-brown hair, clean-shaven, friendly features.',
  rublev:          'A 28-year-old male tennis player with fair skin, very short light-brown buzzed hair, clean-shaven, intense expression.',
  rune:            'A 23-year-old male tennis player with fair skin, medium brown wavy hair, clean-shaven, youthful.',
  paul:            'A 28-year-old male tennis player with fair skin, short brown hair, light stubble, boyish features.',
  shelton:         'A 23-year-old male athlete with dark brown skin, very short black cropped hair, clean-shaven, broad muscular build, bright smile.',
  hurkacz:         'A 27-year-old very tall male tennis player with fair skin, short dark brown hair, light stubble.',
  kyrgios:         'A 31-year-old male athlete with tan Mediterranean-Asian skin, short black hair, full short black beard, visible arm tattoos.',
  dimitrov:        'A 33-year-old male tennis player with light-olive skin, medium dark brown hair, light stubble, classically handsome features.',
  tiafoe:          'A 27-year-old male athlete with dark brown skin, short black cropped hair, clean-shaven, warm charismatic smile.',
  musetti:         'A 22-year-old male tennis player with light-olive skin, medium dark brown wavy hair, light stubble, elegant features.',
  korda:           'A 24-year-old tall male tennis player with fair skin, medium light-brown hair, clean-shaven, youthful.',
  draper:          'A 23-year-old male tennis player with fair skin, short brown hair, clean-shaven, strong build.',
  tsitsipas:       'A 26-year-old male tennis player with light-olive Greek skin, long brown hair to the shoulders, short beard.',
  khachanov:       'A 28-year-old tall male tennis player with light-olive skin, short black hair, full dark beard.',
  lehecka:         'A 23-year-old male tennis player with fair skin, short mid-brown hair, clean-shaven.',
  deminaur:        'A 25-year-old male tennis player with light-olive skin, short dark brown hair, clean-shaven, lean athletic.',
  fils:            'A 21-year-old male athlete with dark brown skin, short black hair, clean-shaven, youthful athletic.',
  cobolli:         'A 23-year-old male tennis player with light-olive Italian skin, short dark brown hair, light stubble.',
  eubanks:         'A 28-year-old very tall male athlete with dark brown skin, very short black hair, clean-shaven, thin build.',
  berrettini:      'A 30-year-old muscular male tennis player with light-olive skin, short dark brown hair, full dark beard.',
  sonego:          'A 29-year-old male tennis player with fair skin, short brown hair, clean-shaven.',
  davidovich:      'A 25-year-old male tennis player with light-olive Spanish skin, medium dark brown wavy hair, light stubble.',
  vandezandschulp: 'A 29-year-old male tennis player with fair Dutch skin, short brown hair, light stubble.',
  bautistaagut:    'A 36-year-old male tennis player with light-olive Spanish skin, short dark brown hair, full trimmed dark beard.',
  nakashima:       'A 23-year-old male tennis player with light-tan East-Asian-American skin, short black hair, clean-shaven.',
  thompson:        'A 30-year-old male tennis player with fair skin, short brown hair, light stubble.',
};

const args = process.argv.slice(2);
const useReplicate = args.includes('--replicate');
const onlyArg = args.find((a, i) => args[i - 1] === '--only');
const only = onlyArg ? onlyArg.split(',').map(s => s.trim()) : null;

const entries = Object.entries(APPEARANCE).filter(([id]) => !only || only.includes(id));

async function genOpenAI(prompt) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not set');
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt,
      size: '1024x1024',
      quality: 'medium',
      n: 1,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return Buffer.from(json.data[0].b64_json, 'base64');
}

async function genReplicate(prompt) {
  const key = process.env.REPLICATE_API_TOKEN;
  if (!key) throw new Error('REPLICATE_API_TOKEN not set');
  const res = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro/predictions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, Prefer: 'wait' },
    body: JSON.stringify({ input: { prompt, aspect_ratio: '1:1', output_format: 'png', safety_tolerance: 2 } }),
  });
  if (!res.ok) throw new Error(`Replicate ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const url = Array.isArray(json.output) ? json.output[0] : json.output;
  const img = await fetch(url);
  return Buffer.from(await img.arrayBuffer());
}

const generate = useReplicate ? genReplicate : genOpenAI;

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`Generating ${entries.length} avatars via ${useReplicate ? 'Replicate/Flux' : 'OpenAI gpt-image-1'}…\n`);

  let ok = 0, fail = 0;
  for (const [id, appearance] of entries) {
    const prompt = `${appearance} ${STYLE}`;
    try {
      const buf = await generate(prompt);
      await writeFile(resolve(OUT_DIR, `${id}.png`), buf);
      ok++;
      console.log(`  ✓ ${id}`);
    } catch (err) {
      fail++;
      console.error(`  ✗ ${id} — ${err.message}`);
    }
  }
  console.log(`\nDone. ${ok} generated, ${fail} failed → public/avatars/`);
}

main().catch(e => { console.error(e); process.exit(1); });
