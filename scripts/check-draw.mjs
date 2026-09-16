// ── Has the draw actually been published? ────────────────────────────────────────────────────────
//
//   node scripts/check-draw.mjs <event-id> [--page="<wiki title>"]
//
// Job 8 cannot start until the tournament publishes its bracket, so this answers one question
// honestly: are the round-one slots FILLED — all of them, for THIS event's draw size?
//
// Traps that each produced a confident "DRAW IS PUBLISHED" on a page that was not one:
//
//   1. (2026-08-26) Counting `{{flagicon|XXX}} [[Name]]` across the whole page counts the SEED LIST,
//      the withdrawals table and the qualifying section — none of which are the draw. Read the
//      `RD1-teamNN` parameters and nothing else.
//   2. (2026-08-26) Capturing a slot with [^\n|]* stops at the `|` inside {{flagicon|USA}}, so every
//      filled slot read as the string "{{flagicon". Capture to END OF LINE.
//   3. (2026-08-27) A 50% bar called a half-typed page "published" at 65/128.
//   4. (9 September review) A slot holding only `{{flagicon|}}` — the empty-flag placeholder left on
//      unfilled slots — counted as FILLED, because the home-made stripper only removed three-letter
//      flags; and "32 slots or more" accepted a Masters-sized count for a Slam. Now the parser's own
//      cleanTeam() decides what is empty (it drops every {{template}}, exactly as ingest-draw will),
//      and the bar is the event's draw size from scripts/lib/events.mjs: 128 filled slots for a Slam,
//      64 for a 96-draw Masters, whose 32 seeds sit out the first round.
//
// READ-ONLY.

import { cleanTeam } from '../src/data/drawParser.ts';
import { getEvent } from './lib/events.mjs';

const API = 'https://en.wikipedia.org/w/api.php';
const [id, ...flags] = process.argv.slice(2);
if (!id) { console.error('usage: node scripts/check-draw.mjs <event-id> [--page="<wiki title>"]'); process.exit(2); }
const ev = getEvent(id);
const pageFlag = flags.find((f) => f.startsWith('--page='));
const TITLE = pageFlag ? pageFlag.slice('--page='.length).replace(/^["']|["']$/g, '') : ev.page;
if (!Number.isInteger(ev.drawSize)) {
  console.error(`scripts/lib/events.mjs must declare drawSize for ${id} (128 for a Slam, 96 for a Masters)`);
  process.exit(2);
}
// Filled first-round slots the page must show: every slot for a Slam; for a 96-draw Masters the 32
// seeds have byes, so 64 of the 128 first-round slots stay empty by design.
const EXPECTED = ev.drawSize === 128 ? 128 : 2 * ev.drawSize - 128;

const res = await fetch(
  `${API}?action=parse&page=${encodeURIComponent(TITLE)}&prop=wikitext&formatversion=2&format=json&origin=*`,
);
if (!res.ok) {
  console.log(`\n  ${TITLE}\n  page fetch failed: ${res.status} — retry, do NOT read this as "no draw"\n`);
  process.exit(1);
}
const w = (await res.json())?.parse?.wikitext ?? '';
if (!w) {
  console.log(`\n  ${TITLE}\n  no wikitext — page may not exist yet\n`);
  process.exit(1);
}

const brackets = (w.match(/\{\{\s*[0-9]+TeamBracket/gi) || []).length;
const slots = [...w.matchAll(/\|\s*RD1-team(\d{2})\s*=([^\n]*)/g)].map((m) => m[2].trim());

// The parser's own cleaner decides what is empty: it drops every {{template}}, so a slot holding only
// the empty-flag placeholder {{flagicon|}} reads as empty — the same reading ingest-draw will make.
const filled = slots.filter((s) => cleanTeam(s) !== '');
const quals = slots.filter((s) => /qualifier/i.test(s));
const empty = slots.length - filled.length;
// A draw is COMPLETE or it is useless. Wikipedia fills a Slam draw in one long sitting, so allow
// only a couple of stragglers — measured against THIS event's size, never against a floor.
const ready = filled.length >= EXPECTED - 2 && filled.length <= EXPECTED;

console.log(`\n  ${id} — ${TITLE}`);
console.log(`    bracket templates : ${brackets}`);
console.log(`    round-one slots   : ${slots.length}`);
console.log(`    filled            : ${filled.length}   (expected ${EXPECTED} for a ${ev.drawSize}-draw)`);
console.log(`    empty             : ${empty}`);
console.log(`    marked "Qualifier": ${quals.length}   ← how many placeholders Job 8 must create`);
if (filled.length) console.log(`    sample            : ${filled.slice(0, 3).map(cleanTeam).join(' · ')}`);
if (filled.length > EXPECTED) console.log(`    ! more filled first-round slots than the draw holds — is a qualifying bracket on this page?`);
console.log(`\n    ${ready ? '✅  DRAW IS PUBLISHED — Job 8 can start' : '⏳  still a skeleton — the draw is not out'}\n`);
// Set the code and let the event loop drain. process.exit() here races Node's teardown of the
// still-closing fetch handle and dies with a libuv assertion (exit 127 on Windows), which would
// have made this watch unreadable to the scheduled task that depends on it.
process.exitCode = ready ? 0 : 3;
