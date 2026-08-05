// Safe deploy — the one that would have caught the stale-dist ship.
//   1. Wipe dist FIRST, so a failed build can't leave a stale bundle to publish.
//   2. TEST. The full vitest suite must pass — this is the gate that stops a broken live
//      model (e.g. the frozen-index transfer freeze) from ever reaching production. A
//      green typecheck is not enough; behaviour regressions only show up in the tests.
//   3. Build. If `tsc -b` or `vite build` errors, execSync throws → we exit BEFORE deploying.
//   4. Deploy.
//   5. BUNDLE-MARKER CHECK: poll the target until it actually serves the hashed bundle we
//      just built — so a skipped build or a failed/partial deploy can't pass silently.
//
// Two targets, so dev work never touches the live app:
//   npm run deploy          → PRODUCTION  (Cloudflare branch `main` → grand-slam-gm.pages.dev)
//   npm run deploy:preview  → DEV PREVIEW (Cloudflare branch `dev`  → dev.grand-slam-gm.pages.dev)
// Same Supabase backs both today — see DEV_WORKFLOW.md for isolating dev data.
import { execSync } from 'node:child_process';
import { rmSync, existsSync, readFileSync } from 'node:fs';

const PREVIEW = process.argv.includes('preview');
const BRANCH = PREVIEW ? 'dev' : 'main';               // Cloudflare treats non-`main` branches as previews
const TARGET_URL = PREVIEW ? 'https://dev.grand-slam-gm.pages.dev' : 'https://grand-slam-gm.pages.dev';
const LABEL = PREVIEW ? 'DEV PREVIEW' : 'PRODUCTION';
const run = (cmd) => execSync(cmd, { stdio: 'inherit' });
console.log(`\n▶ Deploying to ${LABEL}  (branch: ${BRANCH} · ${TARGET_URL})`);

// 1) No stale dist can survive.
rmSync('dist', { recursive: true, force: true });

// 2) Tests — the behaviour gate. A regression in the live money/scoring/transfer model
//    fails here and aborts the deploy, even if the code still typechecks and builds.
try { run('npm test'); }
catch { console.error('\n✗ Tests failed — NOT deploying. Fix the regression before shipping.'); process.exit(1); }

// 3) Build — abort the whole deploy if it fails.
try { run('npm run build'); }
catch { console.error('\n✗ Build failed — NOT deploying. dist was cleaned, so nothing stale can ship.'); process.exit(1); }

// 4) Confirm the build produced a bundle, and capture its hashed name as our marker.
if (!existsSync('dist/index.html')) { console.error('✗ dist/index.html missing after build'); process.exit(1); }
const bundle = readFileSync('dist/index.html', 'utf8').match(/index-[A-Za-z0-9_-]+\.js/)?.[0];
if (!bundle) { console.error('✗ could not find the built JS bundle in dist/index.html'); process.exit(1); }
console.log(`\n→ built bundle: ${bundle}`);

// 5) Deploy.
run(`npx wrangler pages deploy dist --project-name grand-slam-gm --branch ${BRANCH} --commit-dirty=true`);

// 6) Marker check — the target must serve the exact bundle we built (propagation-aware).
console.log(`\n→ verifying ${LABEL} serves the new bundle…`);
let served = false;
const ATTEMPTS = 45; // ~135s — Cloudflare alias propagation can exceed a minute
for (let i = 0; i < ATTEMPTS && !served; i++) {
  try {
    const html = await (await fetch(TARGET_URL, { cache: 'no-store', headers: { 'cache-control': 'no-cache' } })).text();
    served = html.includes(bundle);
  } catch { /* transient — retry */ }
  if (!served) await new Promise((r) => setTimeout(r, 3000));
}
if (!served) { console.error(`\n✗ ${LABEL} did NOT serve ${bundle} within ~${ATTEMPTS * 3}s — likely a stale/failed deploy. Investigate (or it's just slow propagation — re-check the live bundle).`); process.exit(1); }
console.log(`\n✓ Deployed and verified: ${LABEL} is serving ${bundle}.`);
