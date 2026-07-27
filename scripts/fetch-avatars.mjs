// Download official ATP headshots for the master pool into public/avatars/{id}.png,
// so the app self-hosts them instead of hotlinking (robust against ATP blocking a
// deployed domain's referer). Reproducible + idempotent: `node scripts/fetch-avatars.mjs`
// skips files already present. ATP 403s a bare request, so we send browser-like
// headers incl. a Referer (verified sufficient).
import { readFileSync, existsSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pool = JSON.parse(readFileSync(join(root, 'src/data/atp300.json'), 'utf8'));
const outDir = join(root, 'public/avatars');
mkdirSync(outDir, { recursive: true });

const HEADERS = [
  '-H', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  '-H', 'Referer: https://www.atptour.com/',
  '-H', 'Accept: image/avif,image/webp,image/png,image/*,*/*;q=0.8',
];

let ok = 0, skip = 0;
const failed = [];
for (const p of pool) {
  const out = join(outDir, `${p.id}.png`);
  if (existsSync(out) && statSync(out).size > 1000) { skip++; continue; }
  try {
    // -f: fail (no file) on HTTP error; -sL: silent, follow redirects.
    execFileSync('curl', ['-sfL', ...HEADERS, '-o', out, p.photoUrl], { timeout: 25000 });
    if (existsSync(out) && statSync(out).size > 1000) ok++; else failed.push(p.id);
  } catch { failed.push(p.id); }
}

const files = readdirSync(outDir).filter(f => f.endsWith('.png'));
const totalKB = Math.round(files.reduce((s, f) => s + statSync(join(outDir, f)).size, 0) / 1024);
console.log(`downloaded ${ok}, skipped ${skip}, failed ${failed.length} | ${files.length} files, ${totalKB} KB total`);
if (failed.length) console.log('failed ids:', failed.join(' '));
