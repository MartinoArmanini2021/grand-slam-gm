// ── New tournament: what is ready and what is left, in one command ───────────────────────────────────
//
//   node scripts/new-tournament.mjs paris_2026                       (checks Wikipedia too)
//   node scripts/new-tournament.mjs paris_2026 --offline
//   node scripts/new-tournament.mjs paris_2026 --app=../grand-slam-gm  (the app repo, default ../grand-slam-gm)
//
// Every changeover so far was a long hand-kept checklist (Shanghai's ran to 12 steps, and its draw-day
// gaps were found by reading code). This walks the same steps in the runbook's order, checks each one
// it can check from the files (and Wikipedia), and prints the exact command for the next thing to do.
// It reads only: nothing is written, nothing touches the database. The database and deploy steps are
// listed with their SQL/commands for Martino's word, because only he says go.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVENTS } from './lib/events.mjs';
import { planRows } from './round-plan.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith('--'));
const offline = args.includes('--offline');
const appArg = args.find((a) => a.startsWith('--app='));
const APP = resolve(ROOT, appArg ? appArg.slice(6) : '../grand-slam-gm');

if (!id) {
  console.error('usage: node scripts/new-tournament.mjs <tournament_id> [--offline] [--app=<path to grand-slam-gm>]');
  process.exit(2);
}

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');
const steps = [];
const step = (title, state, detail = '', next = '') => steps.push({ title, state, detail, next });

// 1. the tooling registry
const ev = EVENTS[id];
if (!ev) {
  step('Tooling registry (scripts/lib/events.mjs)', 'todo', `no entry for ${id}`, `add ${id}: { page, field, seed, label, surface, status: 'upcoming', drawSize, manual: [] }`);
} else {
  const miss = ['page', 'field', 'seed', 'label', 'surface', 'drawSize'].filter((k) => ev[k] == null);
  step('Tooling registry (scripts/lib/events.mjs)', miss.length ? 'todo' : 'done',
    miss.length ? `missing: ${miss.join(', ')}` : `${ev.label} · ${ev.drawSize}-draw · "${ev.page}" · status ${ev.status}`);
}

// 2. the draw page on Wikipedia
if (ev?.page) {
  if (offline) step('Wikipedia draw page', 'skip', '--offline');
  else {
    try {
      const url = `https://en.wikipedia.org/w/api.php?action=parse&format=json&prop=wikitext&redirects=1&page=${encodeURIComponent(ev.page)}`;
      const res = await fetch(url, { headers: { 'User-Agent': 'GrandSlamGM/1.0 (https://grandslamgm.com)' } });
      const j = await res.json();
      if (j.error) step('Wikipedia draw page', 'wait', `"${ev.page}" does not exist yet (normal until the draw is made)`, 'run this again on draw day');
      else {
        const w = j.parse.wikitext['*'];
        const sections = (w.match(/\{\{\s*16TeamBracket/gi) ?? []).length;
        const want = ev.drawSize === 56 ? 4 : 8;
        step('Wikipedia draw page', sections >= want ? 'done' : 'wait', `${sections} of ${want} draw sections published`, sections >= want ? `node scripts/check-draw.mjs ${id}` : 'wait for the full draw');
      }
    } catch (e) {
      step('Wikipedia draw page', 'skip', `could not reach Wikipedia: ${e.message}`);
    }
  }
}

// 3–4. the field and the seed
if (ev?.field) {
  step('Field file (who is in the draw)', existsSync(resolve(ROOT, ev.field)) ? 'done' : 'todo', ev.field,
    existsSync(resolve(ROOT, ev.field)) ? `node scripts/reconcile-field.mjs "${ev.page}" ${ev.field}` : `node scripts/apply-rankings.mjs --dry, then node scripts/build-field.mjs ${id}`);
}
if (ev?.seed) {
  step('Player prices seed (SQL)', existsSync(resolve(ROOT, ev.seed)) ? 'done' : 'todo', ev.seed,
    existsSync(resolve(ROOT, ev.seed)) ? `node scripts/gen-seed.mjs ${id} --check` : `node scripts/gen-seed.mjs ${id}`);
}

// 5. the ingest feed's registry (and the app twin in this repo)
const ingest = read(resolve(ROOT, 'supabase/functions/ingest-draw/index.ts'));
step('Feed registry (supabase/functions/ingest-draw)', new RegExp(`\\b${id}\\s*:`).test(ingest) ? 'done' : 'todo',
  '', 'add the entry (page, rounds, roster from the field, drawSize) — then deploy ingest-draw on his word');
const twin = read(resolve(ROOT, 'src/data/tournamentConfig.ts'));
step('Tooling twin (src/data/tournamentConfig.ts)', new RegExp(`\\b${id}\\s*:`).test(twin) ? 'done' : 'todo', '', `add ${id} with status 'staged'`);

// 6. the schedule
const schedFile = resolve(ROOT, 'scripts/schedules', `${id}.json`);
if (!existsSync(schedFile)) {
  step('Schedule (scripts/schedules)', 'todo', 'no schedule file', `write scripts/schedules/${id}.json (see paris_2026.json), then node scripts/round-plan.mjs ${id}`);
} else {
  try {
    const rows = planRows(id, JSON.parse(readFileSync(schedFile, 'utf8')));
    const sqlFiles = readdirSync(resolve(ROOT, 'supabase')).filter((f) => f.endsWith(`_${id}_round_plan.sql`));
    const floors = rows.filter((r) => /^floor/.test(r.note)).length;
    step('Schedule (scripts/schedules)', 'done', `${rows.map((r) => r.round).join(' → ')}; ${floors} of ${rows.length} still early floors`);
    step('Round plan SQL', sqlFiles.length ? 'done' : 'todo', sqlFiles.join(', '), sqlFiles.length ? 'apply on his word (then: select * from public.round_plan_health(…))' : `node scripts/round-plan.mjs ${id}`);
  } catch (e) {
    step('Schedule (scripts/schedules)', 'todo', e.message);
  }
}

// 7. the app repo
const appData = read(resolve(APP, 'src/lib/game/data.ts'));
if (!appData) step('App tournament entry (grand-slam-gm)', 'skip', `app repo not found at ${APP}`);
else {
  step('App tournament entry (grand-slam-gm src/lib/game/data.ts)', new RegExp(`\\b${id}\\s*:`).test(appData) ? 'done' : 'todo', '', 'add the TournamentInfo entry (name, year, city, surface)');
  const def = /DEFAULT_TOURNAMENT_ID\s*=\s*"([^"]+)"/.exec(appData)?.[1];
  step('App default tournament (flip day, one line)', def === id ? 'done' : 'later', `DEFAULT_TOURNAMENT_ID is "${def}"`, `on flip day: DEFAULT_TOURNAMENT_ID = "${id}", four gates, deploy on his word`);
  const season = read(resolve(APP, 'public/season.html'));
  const jump = /JUMP_IN\s*=\s*(true|false)/.exec(season)?.[1];
  if (jump) step('Front page "jump into the game" (flip day)', jump === 'true' ? 'done' : 'later', `JUMP_IN = ${jump}`, 'on flip day: JUMP_IN = true');
}

// 8. the database steps (his word, in this order)
step('Database: flip the active tournament (his word)', 'later', '',
  `update public.app_config set value = '${id}', updated_at = now() where key = 'active_tournament_id';`);
step('Database: stamp the first scored round (flip day)', 'later', '', 'the stamp SQL is at the top of the round plan file');
step('Every evening before a round: pin its first ball', 'later', '', `node scripts/round-plan.mjs ${id} --pin <ROUND> "<YYYY-MM-DD HH:MM local>" "<source>"`);

const icon = { done: '✓', todo: '✗', wait: '…', later: '·', skip: '?' };
console.log(`\n  ${id}${ev ? ` — ${ev.label}` : ''}\n`);
for (const s of steps) {
  console.log(`  ${icon[s.state]} ${s.title}${s.detail ? `\n      ${s.detail}` : ''}${s.state !== 'done' && s.next ? `\n      → ${s.next}` : ''}`);
}
const todo = steps.filter((s) => s.state === 'todo').length;
console.log(`\n  ${todo === 0 ? 'Nothing blocking. The rest waits for draw day or flip day.' : `${todo} step(s) to do.`}\n`);
process.exitCode = 0; // not process.exit(): on Windows it can abort while fetch handles close
