// ── Draw night, in order ─────────────────────────────────────────────────────────────────────────
//
//   node scripts/drawday.mjs paris_2026                                     # the real draw night
//   node scripts/drawday.mjs paris_2026 --rehearse="2025 Rolex Paris Masters – Singles"
//   node scripts/drawday.mjs paris_2026 --plan                              # just print the steps
//
// Draw night is about ten steps that must happen in order, fast, in the evening (the Paris draw was
// published at ~18:30 in 2025 and squads lock the next Monday morning). This runs the checks that
// need no permission, stops at the FIRST problem, and then prints the exact commands and SQL for
// every step that needs Martino's word: nothing here writes to the database or deploys anything.
//
// The automatic part (each is an existing tool, run as it is run by hand):
//   1. check-draw      is the draw complete on Wikipedia, for this event's draw size?
//   2. build-field     who is in the draw, matched to the player pool (writes the field file)
//   3. reconcile-field does the field match the draw exactly (no missing, no phantom players)?
//   4. gen-seed        the prices/tiers SQL for the field (writes the seed file), then --check
// With --rehearse="<another year's page>": steps 1–2 read that page instead, build-field runs dry
// (it never writes a field from the wrong year), and steps 3–4 are skipped. That proves the parser
// and the pool on a draw whose answer is known.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVENTS } from './lib/events.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith('--'));
const rehearseArg = args.find((a) => a.startsWith('--rehearse='));
const rehearse = rehearseArg ? rehearseArg.slice('--rehearse='.length).replace(/^["']|["']$/g, '') : null;
const planOnly = args.includes('--plan');

if (!id || !EVENTS[id]) {
  console.error(`usage: node scripts/drawday.mjs <event-id> [--rehearse="<wiki page>"] [--plan]\nknown: ${Object.keys(EVENTS).join(', ')}`);
  process.exitCode = 2;
} else {
  main();
}

function run(label, script, scriptArgs) {
  console.log(`\n── ${label} ─────────────────────────────────────────────`);
  console.log(`$ node scripts/${script} ${scriptArgs.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}`);
  const r = spawnSync(process.execPath, [resolve(ROOT, 'scripts', script), ...scriptArgs], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) {
    console.log(`\n✗ STOPPED at "${label}" (exit ${r.status}). Fix this before going further; nothing after it has run.`);
    return false;
  }
  console.log(`✓ ${label}`);
  return true;
}

/** Players in the event's field file (0 when missing or the empty placeholder). */
function fieldCount(ev) {
  try {
    const list = JSON.parse(readFileSync(resolve(ROOT, ev.field), 'utf8'));
    return Array.isArray(list) ? list.length : 0;
  } catch {
    return 0;
  }
}

export function followUps(eventId, ev) {
  const plan = readdirSync(resolve(ROOT, 'supabase')).find((f) => f.endsWith(`_${eventId}_round_plan.sql`));
  return [
    ['Apply the prices (seed)', `apply ${ev.seed} (Supabase SQL editor or apply_migration "${eventId}_player_stats")`],
    ['Apply the lock times (if not done yet)', plan ? `apply supabase/${plan}` : `node scripts/round-plan.mjs ${eventId}  → then apply it`],
    ['Feed: add the event to the registry', `supabase/functions/ingest-draw/index.ts → TOURNAMENTS.${eventId} = { page: "${ev.page}", rounds, roster: the field, drawSize: ${ev.drawSize} }`],
    [
      'Feed: deploy',
      `${fieldCount(ev) >= ev.drawSize ? `field has ${fieldCount(ev)} players: OK` : `⚠ STOP: ${ev.field} has ${fieldCount(ev)} players, not ${ev.drawSize}. Build the field first.`}\n      npx supabase functions deploy ingest-draw --project-ref mrdmlfumdsxufifjulbt`,
    ],
    ['Feed: run once by hand for the event', `POST /functions/v1/ingest-draw {"tournamentId":"${eventId}"} with the service key, then: select round, count(*) from matches where tournament_id='${eventId}' group by 1;`],
    ['Switch the game to the event', `update public.app_config set value = '${eventId}', updated_at = now() where key = 'active_tournament_id';`],
    ['Stamp the first round\'s lock time', 'the stamp SQL at the top of the round plan file'],
    ['Remove the old Shanghai lock times', "delete from public.round_plan where tournament_id = 'shanghai_2026';"],
    ['App: default event + "jump into the game" on', 'deploy grand-slam-gm branch paris-flip (four gates, wrangler pages deploy)'],
    ['Checks', `node scripts/new-tournament.mjs ${eventId}  ·  select * from public.round_plan_health('${eventId}');  ·  select * from public.app_state;`],
  ];
}

function printFollowUps(ev) {
  console.log('\n══ Needs Martino\'s word, in this order ══════════════════════════════════════');
  followUps(id, ev).forEach(([what, how], i) => console.log(`  ${String(i + 1).padStart(2)}. ${what}\n      ${how}`));
  console.log('\nThen, Sunday evening after qualifying: re-run this script (the field gains the qualifiers),');
  console.log('re-apply only the NEW players\' prices, redeploy the feed, and pin the first ball:');
  console.log(`  node scripts/round-plan.mjs ${id} --pin R64 "<YYYY-MM-DD HH:MM Paris>" "order of play"`);
}

function main() {
  const ev = EVENTS[id];
  console.log(`Draw night: ${ev.label} (${id}), ${ev.drawSize}-player draw${rehearse ? `\nREHEARSAL against "${rehearse}" (nothing is written)` : ''}`);
  if (planOnly) {
    printFollowUps(ev);
    return;
  }
  const page = rehearse ? [`--page=${rehearse}`] : [];
  if (!run('1. Is the draw complete?', 'check-draw.mjs', [id, ...page])) return (process.exitCode = 1);
  if (!run('2. Build the field', 'build-field.mjs', [id, ...page, ...(rehearse ? ['--dry'] : [])])) return (process.exitCode = 1);
  if (rehearse) {
    console.log('\n(rehearsal: steps 3–4 need the real field file and are skipped)');
  } else {
    if (!existsSync(resolve(ROOT, ev.field))) {
      console.log(`\n✗ STOPPED: ${ev.field} was not written.`);
      return (process.exitCode = 1);
    }
    if (!run('3. Field matches the draw exactly', 'reconcile-field.mjs', [ev.page, ev.field])) return (process.exitCode = 1);
    if (!run('4a. Write the prices', 'gen-seed.mjs', [id])) return (process.exitCode = 1);
    if (!run('4b. Prices are current', 'gen-seed.mjs', [id, '--check'])) return (process.exitCode = 1);
  }
  console.log('\n✓ All automatic checks passed.');
  printFollowUps(ev);
}
