// Safe deploy — the one that would have caught the stale-dist ship.
//   1. Wipe dist FIRST, so a failed build can't leave a stale bundle to publish.
//   2. Build. If `tsc -b` or `vite build` errors, execSync throws → we exit BEFORE deploying.
//   3. Deploy.
//   4. BUNDLE-MARKER CHECK: poll production until it actually serves the hashed bundle we
//      just built — so a skipped build or a failed/partial deploy can't pass silently.
// Usage:  npm run deploy
import { execSync } from 'node:child_process';
import { rmSync, existsSync, readFileSync } from 'node:fs';

const PROD = 'https://grand-slam-gm.pages.dev';
const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

// 1) No stale dist can survive.
rmSync('dist', { recursive: true, force: true });

// 2) Build — abort the whole deploy if it fails.
try { run('npm run build'); }
catch { console.error('\n✗ Build failed — NOT deploying. dist was cleaned, so nothing stale can ship.'); process.exit(1); }

// 3) Confirm the build produced a bundle, and capture its hashed name as our marker.
if (!existsSync('dist/index.html')) { console.error('✗ dist/index.html missing after build'); process.exit(1); }
const bundle = readFileSync('dist/index.html', 'utf8').match(/index-[A-Za-z0-9_-]+\.js/)?.[0];
if (!bundle) { console.error('✗ could not find the built JS bundle in dist/index.html'); process.exit(1); }
console.log(`\n→ built bundle: ${bundle}`);

// 4) Deploy.
run('npx wrangler pages deploy dist --project-name grand-slam-gm --branch main --commit-dirty=true');

// 5) Marker check — production must serve the exact bundle we built (propagation-aware).
console.log('\n→ verifying production serves the new bundle…');
let served = false;
const ATTEMPTS = 45; // ~135s — Cloudflare alias propagation can exceed a minute
for (let i = 0; i < ATTEMPTS && !served; i++) {
  try {
    const html = await (await fetch(PROD, { cache: 'no-store', headers: { 'cache-control': 'no-cache' } })).text();
    served = html.includes(bundle);
  } catch { /* transient — retry */ }
  if (!served) await new Promise((r) => setTimeout(r, 3000));
}
if (!served) { console.error(`\n✗ production did NOT serve ${bundle} within ~${ATTEMPTS * 3}s — likely a stale/failed deploy. Investigate (or it's just slow propagation — re-check the live bundle).`); process.exit(1); }
console.log(`\n✓ Deployed and verified: production is serving ${bundle}.`);
