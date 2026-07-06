#!/usr/bin/env node
/**
 * Builds real-likeness avatars from each player's actual photo:
 *   fetch real Wikipedia photo → remove background (local ONNX) →
 *   auto-frame the head → composite on a clean uniform studio background →
 *   circular-ready PNG. The face is the REAL player; only bg + framing change.
 *
 *   node scripts/photo-avatars.mjs [--only id1,id2]
 */
import { removeBackground } from '@imgly/background-removal-node';
import Jimp from 'jimp';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../public/avatars');
const SIZE = 512;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  'Referer': 'https://en.wikipedia.org/',
};

const WIKI = {
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

// Two-stop studio backdrop per player — subtle, uniform across the set.
const BG_TOP = 0x223047ff, BG_BOT = 0x0e1626ff;

async function fetchPhoto(article) {
  const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${article}`, { headers: HEADERS });
  const j = await r.json();
  let url = j?.thumbnail?.source;
  if (!url) throw new Error('no image');
  url = url.replace(/\/\d+px-/, '/500px-');
  const img = await fetch(url, { headers: HEADERS });
  if (!img.ok) throw new Error(`img ${img.status}`);
  return Buffer.from(await img.arrayBuffer());
}

// Alpha bounding box of the cut-out subject.
function alphaBounds(img) {
  const { width, height, data } = img.bitmap;
  let minX = width, minY = height, maxX = 0, maxY = 0, any = false;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] > 40) {
      any = true;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  return any ? { minX, minY, maxX, maxY } : null;
}

// Horizontal centroid of the head band (top slice of the subject).
function headCenterX(img, top, bandH) {
  const { width, data } = img.bitmap;
  let sum = 0, n = 0;
  for (let y = top; y < top + bandH; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] > 40) { sum += x; n++; }
  }
  return n ? sum / n : width / 2;
}

function buildBackground() {
  const bg = new Jimp(SIZE, SIZE);
  bg.scan(0, 0, SIZE, SIZE, (x, y, idx) => {
    const t = y / SIZE;
    const top = Jimp.intToRGBA(BG_TOP), bot = Jimp.intToRGBA(BG_BOT);
    // radial-ish vertical blend
    bg.bitmap.data[idx]     = top.r + (bot.r - top.r) * t;
    bg.bitmap.data[idx + 1] = top.g + (bot.g - top.g) * t;
    bg.bitmap.data[idx + 2] = top.b + (bot.b - top.b) * t;
    bg.bitmap.data[idx + 3] = 255;
  });
  return bg;
}

async function build(id, article) {
  const src = await fetchPhoto(article);
  const cutBlob = await removeBackground(new Blob([src], { type: 'image/jpeg' }), { model: 'medium' });
  const cut = await Jimp.read(Buffer.from(await cutBlob.arrayBuffer()));

  const b = alphaBounds(cut);
  if (!b) throw new Error('no subject');

  // Frame the head: square window anchored at the top of the subject.
  const subjW = b.maxX - b.minX;
  const subjH = b.maxY - b.minY;
  const cx = headCenterX(cut, b.minY, Math.max(8, Math.round(subjH * 0.18)));
  // window height ~ proportion of subject so head + a bit of shoulders fit
  const win = Math.round(Math.min(subjH * 0.66, subjW * 1.25));
  const top = Math.max(0, Math.round(b.minY - win * 0.14));
  const left = Math.round(cx - win / 2);

  // Crop the cut-out to the head window (clamped), then scale to SIZE.
  const cropX = Math.max(0, left), cropY = Math.max(0, top);
  const cropW = Math.min(cut.bitmap.width - cropX, win);
  const cropH = Math.min(cut.bitmap.height - cropY, win);
  const head = cut.clone().crop(cropX, cropY, cropW, cropH).cover(SIZE, SIZE);

  const out = buildBackground();
  out.composite(head, 0, 0);

  // Soft vignette for depth
  const cxv = SIZE / 2, cyv = SIZE * 0.46, inner = SIZE * 0.42, outer = SIZE * 0.72;
  out.scan(0, 0, SIZE, SIZE, (x, y, idx) => {
    const r = Math.hypot(x - cxv, y - cyv);
    let f = 1 - Math.max(0, (r - inner) / (outer - inner)) * 0.5;
    if (f < 0.35) f = 0.35;
    out.bitmap.data[idx] *= f; out.bitmap.data[idx + 1] *= f; out.bitmap.data[idx + 2] *= f;
  });

  await out.writeAsync(resolve(OUT, `${id}.png`));
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const args = process.argv.slice(2);
  const onlyArg = args.find((a, i) => args[i - 1] === '--only');
  const only = onlyArg ? onlyArg.split(',').map(s => s.trim()) : null;
  const ids = Object.keys(WIKI).filter(id => !only || only.includes(id));

  console.log(`Building ${ids.length} real-likeness avatars…\n`);
  let ok = 0, fail = 0;
  for (const id of ids) {
    try { await build(id, WIKI[id]); ok++; console.log(`  ✓ ${id}`); }
    catch (e) { fail++; console.log(`  ✗ ${id} — ${e.message}`); }
  }
  console.log(`\nDone. ${ok} built, ${fail} failed → public/avatars/`);
}
main().catch(e => { console.error(e); process.exit(1); });
