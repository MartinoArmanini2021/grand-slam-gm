#!/usr/bin/env node
/**
 * Builds illustrated avatars that look like the real players by stylizing each
 * player's real Wikipedia photo into a painted/cartoon portrait.
 *
 *   fetch real photo → crop to face → smooth → posterize colour →
 *   overlay dark edge outlines → boost saturation/contrast → save PNG
 *
 * Fully local (Jimp) — no API key. Output: public/avatars/<id>.png
 *
 *   node scripts/stylize-avatars.mjs                    # all players
 *   node scripts/stylize-avatars.mjs --only alcaraz     # subset
 */

import Jimp from 'jimp';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../public/avatars');

const WIKI_ARTICLES = {
  alcaraz:'Carlos_Alcaraz', sinner:'Jannik_Sinner', zverev:'Alexander_Zverev', djokovic:'Novak_Djokovic',
  fritz:'Taylor_Fritz', medvedev:'Daniil_Medvedev', ruud:'Casper_Ruud', rublev:'Andrey_Rublev',
  rune:'Holger_Rune', paul:'Tommy_Paul_(tennis)', shelton:'Ben_Shelton', hurkacz:'Hubert_Hurkacz',
  kyrgios:'Nick_Kyrgios', dimitrov:'Grigor_Dimitrov', tiafoe:'Frances_Tiafoe', musetti:'Lorenzo_Musetti',
  korda:'Sebastian_Korda', draper:'Jack_Draper', tsitsipas:'Stefanos_Tsitsipas', khachanov:'Karen_Khachanov',
  lehecka:'Ji%C5%99%C3%AD_Lehe%C4%8Dka', deminaur:'Alex_de_Minaur', fils:'Arthur_Fils', cobolli:'Flavio_Cobolli',
  eubanks:'Christopher_Eubanks', berrettini:'Matteo_Berrettini', sonego:'Lorenzo_Sonego',
  davidovich:'Alejandro_Davidovich_Fokina', vandezandschulp:'Botic_van_de_Zandschulp',
  bautistaagut:'Roberto_Bautista_Agut', nakashima:'Brandon_Nakashima', thompson:'Jordan_Thompson_(tennis)'
};

const SIZE = 512;

const args = process.argv.slice(2);
const onlyArg = args.find((a, i) => args[i - 1] === '--only');
const only = onlyArg ? onlyArg.split(',').map(s => s.trim()) : null;
const entries = Object.entries(WIKI_ARTICLES).filter(([id]) => !only || only.includes(id));

// Wikimedia serves thumbnails to browser-like clients; it rejects generic UAs
// and rate-limits (429) direct original-file hotlinking. Use the thumbnail path.
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  'Referer': 'https://en.wikipedia.org/',
};

async function fetchPhoto(article) {
  const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${article}`, { headers: HEADERS });
  const j = await r.json();
  let url = j?.thumbnail?.source;
  if (!url) throw new Error('no image');
  url = url.replace(/\/\d+px-/, '/500px-'); // rendered thumbnail — always JPEG/PNG
  const img = await fetch(url, { headers: HEADERS });
  if (!img.ok) throw new Error(`img ${img.status}`);
  return Buffer.from(await img.arrayBuffer());
}

function stylize(base) {
  // Square crop biased toward the top (faces sit high in portraits)
  const w = base.bitmap.width, h = base.bitmap.height;
  const side = Math.min(w, h);
  const sx = Math.round((w - side) / 2);
  const sy = Math.round(Math.min(h - side, side * 0.05));
  base.crop(sx, sy, side, side).resize(SIZE, SIZE);

  // Zoom into the face: crop the central-upper region and scale back up
  const z = Math.round(SIZE * 0.80);
  base.crop(Math.round((SIZE - z) / 2), Math.round(SIZE * 0.04), z, z).resize(SIZE, SIZE);

  // ── Colour layer: smoothed + posterized → flat painterly regions
  const color = base.clone();
  color.gaussian(2);
  color.posterize(8);
  color.color([{ apply: 'saturate', params: [10] }]);
  color.contrast(0.06);

  // ── Edge layer: dark outlines from a Laplacian on a denoised greyscale copy
  const edge = base.clone().greyscale().blur(1);
  edge.convolute([[0, -1, 0], [-1, 4, -1], [0, -1, 0]]); // edges bright, rest black
  edge.contrast(0.6);
  edge.invert(); // edges dark, rest white → multiply keeps only the lines
  color.composite(edge, 0, 0, { mode: Jimp.BLEND_MULTIPLY, opacitySource: 0.5, opacityDest: 1 });

  // ── Vignette: darken the corners to focus the face and mute busy backdrops
  const cx = SIZE / 2, cy = SIZE * 0.44, inner = SIZE * 0.40, outer = SIZE * 0.66;
  const d = color.bitmap.data;
  color.scan(0, 0, SIZE, SIZE, (x, y, idx) => {
    const r = Math.hypot(x - cx, y - cy);
    let f = 1 - Math.max(0, (r - inner) / (outer - inner)) * 0.85;
    if (f < 0.15) f = 0.15;
    d[idx] *= f; d[idx + 1] *= f; d[idx + 2] *= f;
  });

  return color;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`Stylizing ${entries.length} avatars from real photos…\n`);
  let ok = 0, fail = 0;
  for (const [id, article] of entries) {
    try {
      const buf = await fetchPhoto(article);
      const base = await Jimp.read(buf);
      const out = stylize(base);
      await out.writeAsync(resolve(OUT_DIR, `${id}.png`));
      ok++; console.log(`  ✓ ${id}`);
    } catch (err) {
      fail++; console.error(`  ✗ ${id} — ${err.message}`);
    }
  }
  console.log(`\nDone. ${ok} built, ${fail} failed → public/avatars/`);
}

main().catch(e => { console.error(e); process.exit(1); });
