// Tiles all generated avatars into one labelled grid image for quick review.
import Jimp from 'jimp';
import { readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = resolve(__dirname, '../public/avatars');
const CELL = 128, COLS = 6, PAD = 6;

const files = (await readdir(DIR)).filter(f => f.endsWith('.png')).sort();
const rows = Math.ceil(files.length / COLS);
const W = COLS * (CELL + PAD) + PAD, H = rows * (CELL + PAD) + PAD;
const sheet = new Jimp(W, H, 0x0b0f18ff);

for (let i = 0; i < files.length; i++) {
  const img = await Jimp.read(resolve(DIR, files[i]));
  img.resize(CELL, CELL);
  const x = PAD + (i % COLS) * (CELL + PAD);
  const y = PAD + Math.floor(i / COLS) * (CELL + PAD);
  sheet.composite(img, x, y);
  console.log(`  [${i}] ${String.fromCharCode(65 + (i % COLS))}${Math.floor(i / COLS) + 1}  ${files[i].replace('.png', '')}`);
}
await sheet.writeAsync(resolve(__dirname, '../public/avatars-sheet.png'));
console.log('wrote public/avatars-sheet.png');
