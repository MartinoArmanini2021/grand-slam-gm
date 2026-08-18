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

// A NAMED branch target: `node scripts/deploy.mjs branch=ux-revamp` publishes to its own Cloudflare
// preview at <branch>.grand-slam-gm.pages.dev, leaving BOTH dev and production untouched. Added for
// the Phase 3 revamp, which has to live somewhere the current app can be compared against — and
// which must never be one mistyped argument away from replacing it.
const NAMED = (process.argv.find(a => a.startsWith('branch=')) || '').slice(7);
const PREVIEW = NAMED ? true : process.argv.includes('preview');
const BRANCH = NAMED || (PREVIEW ? 'dev' : 'main');    // Cloudflare treats non-`main` branches as previews
const TARGET_URL = NAMED
  ? `https://${NAMED}.grand-slam-gm.pages.dev`
  : PREVIEW ? 'https://dev.grand-slam-gm.pages.dev' : 'https://grand-slam-gm.pages.dev';
const LABEL = NAMED ? `PREVIEW (${NAMED})` : PREVIEW ? 'DEV PREVIEW' : 'PRODUCTION';
const run = (cmd) => execSync(cmd, { stdio: 'inherit' });
const git = (cmd) => execSync(`git ${cmd}`, { encoding: 'utf8' }).trim();
console.log(`\n▶ Deploying to ${LABEL}  (branch: ${BRANCH} · ${TARGET_URL})`);

// 0) SAFETY: a PRODUCTION deploy must ship a known commit — so "what's live" always maps to a
//    git commit + a release tag we can restore to. Refuse to publish an uncommitted working tree
//    (closes the footgun where a half-finished edit ships via wrangler's --commit-dirty). Preview
//    deploys are exempt; --allow-dirty is the emergency-hotfix escape hatch. (dist / build info are
//    gitignored, so a fresh build never trips this — only real tracked changes do.)
const ALLOW_DIRTY = process.argv.includes('--allow-dirty');
if (!PREVIEW && !ALLOW_DIRTY) {
  const dirty = git('status --porcelain');
  if (dirty) {
    console.error('\n✗ Uncommitted changes — a PRODUCTION deploy must ship a committed version.');
    console.error('  Commit (or stash) first, then deploy — so the live site always matches a git');
    console.error('  commit + release tag. For a genuine emergency, re-run with --allow-dirty.');
    console.error('\n  Changed files:\n' + dirty.split('\n').map((l) => `    ${l}`).join('\n'));
    process.exit(1);
  }
}

// 1) No stale dist can survive.
rmSync('dist', { recursive: true, force: true });

// 2) Tests — the behaviour gate. A regression in the live money/scoring/transfer model
//    fails here and aborts the deploy, even if the code still typechecks and builds.
try { run('npm test'); }
catch { console.error('\n✗ Tests failed — NOT deploying. Fix the regression before shipping.'); process.exit(1); }

// 3) Build — abort the whole deploy if it fails.
// A named-branch preview builds in that branch's Vite mode, so .env.<branch> applies. This is how
// the ux-revamp preview gets VITE_UX_HARNESS=1 (which makes its draft-time screens reachable) while
// production, built with no mode, strips the harness entirely.
try { run(NAMED ? `npm run build -- --mode ${NAMED}` : 'npm run build'); }
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

// 7) TAG the release (PRODUCTION only) — a permanent, pushed "known-good" restore point. The tree
//    was verified clean above, so HEAD is exactly what's live. To restore later: `git checkout
//    <tag> && npm run deploy` rebuilds that version back through the full test gate. Best-effort —
//    a tag failure never fails an already-live deploy. See docs/ROLLBACK.md.
if (!PREVIEW) {
  try {
    const stamp = new Date().toISOString().replace(/\.\d+Z$/, 'Z').replace(/[:]/g, '').replace(/-/g, '').replace('T', '-'); // 20260810-113000Z
    const tag = `release-${stamp}`;
    const sha = git('rev-parse --short HEAD');
    execSync(`git tag -a ${tag} -m "Live bundle ${bundle} · commit ${sha}"`, { stdio: 'ignore' });
    execSync(`git push -q origin ${tag}`, { stdio: 'ignore' });
    console.log(`\n🏷  Release tagged ${tag} (bundle ${bundle} · commit ${sha}) and pushed — your restore point.`);
  } catch (e) {
    console.warn(`\n⚠ Could not create/push the release tag (deploy is still live): ${e.message}`);
    console.warn('  You can tag manually: git tag -a release-<stamp> -m "..." && git push origin --tags');
  }
}
